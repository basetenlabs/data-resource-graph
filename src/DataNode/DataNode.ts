import Graph from '../Graph';
import assert from '../utils/assert';
import { NodeState, NodeStatus } from './NodeState';
import { CalculateFunction, DataNodesOf, Observer } from './types';
import { areArraysEqual, areStatesEqual } from './utils';

interface EvaluationCache<TResult> {
  dependencyStates: NodeState<unknown>[];
  /**
   * Output of state after evaluation is run. Unlike DataNode.state, this is not cleared on invalidation
   */
  state: NodeState<TResult>;
}

interface CalculationCache<TResult> {
  dependencyStates: NodeState<unknown>[];
  /**
   * Output of state after evaluation is run. Unlike DataNode.state, this is not cleared on invalidation
   */
  promise: Promise<TResult>;
}

type EvaluationInfo<TResult> = {
  depStates: NodeState<unknown>[];
} & (
  | { shouldEvaluate: false; nextState: NodeState<TResult> }
  | { shouldEvaluate: true; depValues: unknown[] }
);

/**
 * A node in the data graph. Each DataNode has:
 * - An array of dependencies on other nodes
 * - A calculate function which takes in the values of its dependency nodes and returns its own value
 * @public
 */
class DataNode<TResult = unknown> {
  /**
   * @internal - Access the node state by adding an observer
   */
  public state: NodeState<TResult> = { status: NodeStatus.Unevaluated };
  private lastEvaluation: EvaluationCache<TResult> | undefined = undefined;
  private currentAsyncEvaluation: CalculationCache<TResult> | undefined = undefined;
  public dependents = new Set<DataNode>();

  // Use unknown to avoid problems with assigning DataNode<X> to DataNode<unknown>
  private observers: Observer<unknown>[] = [];
  // Observers which haven't received the latest value yet
  private pendingObservers = new Set<Observer<unknown>>();

  readonly [Symbol.toStringTag] = `DataNode('${this.id}')`;

  /**
   * @internal - Use Graph.addNode()/Graph.addNodeAsync() to add new nodes
   */
  constructor(
    public readonly graph: Graph,
    public readonly id: string,
    public dependencies: DataNode[],
    private calculateFunction: CalculateFunction<TResult, unknown[]>,
  ) {}

  //#region observers

  public addObserver(observer: Observer<TResult>): void {
    // Need to cast to unknown
    const unknownObserver = observer as Observer<unknown>;

    this.assertNotDeleted();
    this.graph.markMutated('DataNode.addObserver()');

    if (this.observers.includes(unknownObserver)) return;
    this.observers.push(unknownObserver);
    // New observer needs to be notified in current transaction
    this.pendingObservers.add(unknownObserver);
  }

  public removeObserver(observer: Observer<TResult>): void {
    const unknownObserver = observer as Observer<unknown>;

    this.assertNotDeleted();
    this.graph.markMutated('DataNode.removeObserver()');

    const index = this.observers.indexOf(unknownObserver);
    if (index < 0) return;
    this.observers.splice(index, 1);
    this.pendingObservers.delete(unknownObserver);
  }

  public hasObserver(): boolean {
    return this.observers.length > 0;
  }

  /**
   * @internal
   */
  public hasPendingObservers(): boolean {
    return !!this.pendingObservers.size;
  }

  /**
   * @internal
   */
  public notifyObservers(): void {
    for (const observer of this.pendingObservers) {
      assert(
        this.state.status !== NodeStatus.Unevaluated &&
          this.state.status !== NodeStatus.Pending &&
          this.state.status !== NodeStatus.Running,
        'Observers being notified with non-observable state',
      );
      try {
        observer(this.state);
      } catch (err) {
        this.graph.options.onError(err);
      }
    }
    this.pendingObservers.clear();
  }

  //#endregion observers

  /**
   * Signal that the value has changed. The previously cached value won't be used except for detecting which dependent nodes to evaluate
   */
  public invalidate(): void {
    this.assertNotDeleted();
    this.graph.markMutated('DataNode.invalidate()');
    this.state = { status: NodeStatus.Unevaluated };
    this.currentAsyncEvaluation = undefined;
  }

  /**
   * @internal
   */
  public markPending(): void {
    this.state = { status: NodeStatus.Pending };
  }

  public replace<TArgs extends unknown[]>(
    dependencies: DataNodesOf<TArgs>,
    fn: (...args: TArgs) => TResult,
  ): void {
    this.replaceInternal(dependencies, { fn, sync: true });
  }

  public replaceWithAsync<TArgs extends unknown[]>(
    dependencies: DataNodesOf<TArgs>,
    fn: (...args: TArgs) => Promise<TResult>,
  ): void {
    this.replaceInternal(dependencies, { fn, sync: false });
  }

  private replaceInternal<TArgs extends unknown[]>(
    dependencies: DataNodesOf<TArgs>,
    calculateFn: CalculateFunction<TResult, TArgs>,
  ): void {
    this.assertNotDeleted();
    this.graph.markMutated('DataNode.replace()');

    // Remove self from old dependencies
    for (const dependency of this.dependencies) {
      if (!dependencies.includes(dependency)) {
        assert(
          dependency.dependents.has(this),
          `Internal error: Graph inconsistency between ${this}.dependencies and ${dependencies}.dependents`,
        );

        dependency.dependents.delete(this);
      }
    }

    this.dependencies = dependencies;

    for (const dep of dependencies) {
      dep.dependents.add(this);
    }

    this.calculateFunction = calculateFn as CalculateFunction<TResult, unknown[]>;
    this.invalidate();
    this.lastEvaluation = undefined;
    this.currentAsyncEvaluation = undefined;
  }

  private getEvaluationInfo(): EvaluationInfo<TResult> {
    const depStates = this.dependencies.map((dep) => dep.state);

    if (
      this.lastEvaluation &&
      this.state.status !== NodeStatus.Unevaluated &&
      areArraysEqual(depStates, this.lastEvaluation.dependencyStates, areStatesEqual)
    ) {
      // Short circuit re-evaluation since dependencies are the same
      return { depStates, shouldEvaluate: false, nextState: this.lastEvaluation.state };
    }

    const depValues: unknown[] = [];

    // Build dependency values
    for (const dep of this.dependencies) {
      const depState = dep.state;

      // Is dependency in an errored state?
      if (
        depState.status === NodeStatus.OwnError ||
        depState.status === NodeStatus.DependencyError
      ) {
        return {
          depStates,
          shouldEvaluate: false,
          nextState: {
            status: NodeStatus.DependencyError,
            path: [...(depState.status === NodeStatus.DependencyError ? depState.path : []), dep],
            error: depState.error,
          },
        };
      }

      if (
        depState.status === NodeStatus.Deleted ||
        depState.status === NodeStatus.MissingDependencyError
      ) {
        return {
          depStates,
          shouldEvaluate: false,
          nextState: {
            status: NodeStatus.MissingDependencyError,
            path: [
              ...(depState.status === NodeStatus.MissingDependencyError ? depState.path : []),
              dep,
            ],
          },
        };
      }

      assert(
        depState.status === NodeStatus.Resolved,
        'DataNode.evalate() called with dependency in unresolved state',
      );

      depValues.push(depState.value);
    }

    return { depStates, shouldEvaluate: true, depValues };
  }

  /**
   * @returns Whether to notify observers
   */
  private commitEvaluation(newState: NodeState<TResult>, depStates: NodeState<unknown>[]): void {
    this.state = newState;
    if (!this.lastEvaluation || !areStatesEqual(newState, this.lastEvaluation.state)) {
      // State has changed, so notify all observers
      for (const observer of this.observers) {
        this.pendingObservers.add(observer);
      }
    }
    this.currentAsyncEvaluation = undefined;
    this.lastEvaluation = {
      dependencyStates: depStates,
      state: this.state,
    };
  }

  /**
   * @returns Whether to notify observers
   * @internal
   */
  public evaluate(): void {
    this.assertNotDeleted();
    assert(
      this.calculateFunction.sync,
      'DataNode.evaluate() must only be called for synchronous nodes',
    );

    const evaluationInfo = this.getEvaluationInfo();
    const { depStates } = evaluationInfo;

    if (!evaluationInfo.shouldEvaluate) {
      return this.commitEvaluation(evaluationInfo.nextState, depStates);
    }

    try {
      // Calculate node
      const value = this.calculateFunction.fn(...evaluationInfo.depValues);

      return this.commitEvaluation(
        {
          status: NodeStatus.Resolved,
          value: value,
        },
        depStates,
      );
    } catch (error) {
      return this.commitEvaluation(
        {
          status: NodeStatus.OwnError,
          error,
        },
        depStates,
      );
    }
  }

  /**
   * @returns Whether to notify observers
   */
  public async evaluateAsync(): Promise<void> {
    this.assertNotDeleted();

    const evaluationInfo = this.getEvaluationInfo();
    const { depStates } = evaluationInfo;

    if (!evaluationInfo.shouldEvaluate) {
      return this.commitEvaluation(evaluationInfo.nextState, depStates);
    }

    const owningTransactionId = this.graph.transactionId;
    this.state = { status: NodeStatus.Running };

    try {
      // Try to reuse the last calculation, which may have been cancelled
      if (
        !this.currentAsyncEvaluation ||
        !areArraysEqual(this.currentAsyncEvaluation.dependencyStates, depStates, areStatesEqual)
      ) {
        // Calculate node
        this.currentAsyncEvaluation = {
          dependencyStates: depStates,
          promise: Promise.resolve(this.calculateFunction.fn(...evaluationInfo.depValues)),
        };
      }

      const value = await this.currentAsyncEvaluation.promise;

      if (owningTransactionId !== this.graph.transactionId) {
        // Another evaluation has begin. Discard result
        return;
      }

      return this.commitEvaluation(
        {
          status: NodeStatus.Resolved,
          value: value,
        },
        depStates,
      );
    } catch (error) {
      if (owningTransactionId !== this.graph.transactionId) {
        // Another evaluation has begin. Discard result
        return;
      }
      return this.commitEvaluation(
        {
          status: NodeStatus.OwnError,
          error,
        },
        depStates,
      );
    }
  }

  public delete(): void {
    if (this.isDeleted()) return;
    this.graph.markMutated('DataNode.delete()');

    this.state = { status: NodeStatus.Deleted };

    // Mark all dependents as unevaluated since they've entered an error state
    for (const dependent of this.dependents) {
      dependent.invalidate();
    }
    // Remove dependencies to self
    for (const dep of this.dependencies) {
      dep.dependents.delete(this);
    }
    // Remove from graph
    this.graph.deleteNodeInternal(this);
  }

  public isDeleted(): boolean {
    return this.state.status === NodeStatus.Deleted;
  }

  private assertNotDeleted() {
    if (this.isDeleted()) {
      throw new Error('Operation on deleted node');
    }
  }

  public isAsync(): boolean {
    return !this.calculateFunction.sync;
  }

  /**
   * @internal
   * @returns whether to notify observers
   */
  public setCircularDependencyError(): boolean {
    const oldState = this.state;
    this.state = { status: NodeStatus.CicularDependencyError };
    // This node is no longer in an evaluable state
    this.lastEvaluation = undefined;
    if (!areStatesEqual(oldState, this.state)) {
      // Need to notify
      for (const observer of this.observers) {
        this.pendingObservers.add(observer);
      }
      return true;
    }
    return false;
  }
}

export default DataNode;
