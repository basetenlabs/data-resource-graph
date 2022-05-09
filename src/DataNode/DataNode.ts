import Graph from '../Graph';
import dfs from '../Graph/dfs';
import assert from '../utils/assert';
import { shallowEquals } from '../utils/utils';
import { CalculateFunction, DataNodesOf, NodeState, NodeStatus, Observer } from './types';
import { areArraysEqual, areStatesEqual, isErrorStatus } from './utils';

interface EvaluationData<TResult> {
  dependencies: DataNode[];
  dependencyStates: NodeState<unknown>[];
  /**
   * Output of state after evaluation is run. Unlike DataNode.state, this is not cleared on invalidation
   */
  state: NodeState<TResult>;
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
  private lastEvaluation: EvaluationData<TResult> | undefined = undefined;
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
    this.graph.assertTransaction('DataNode.addObserver()');

    if (this.observers.includes(unknownObserver)) return;
    this.observers.push(unknownObserver);
    // New observer needs to be notified in current transaction
    this.pendingObservers.add(unknownObserver);
  }

  public removeObserver(observer: Observer<TResult>): void {
    const unknownObserver = observer as Observer<unknown>;

    this.assertNotDeleted();
    this.graph.assertTransaction('DataNode.removeObserver()');

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

  public notifyObservers(): void {
    for (const observer of this.pendingObservers) {
      try {
        observer(this.state);
      } catch (err) {
        // TODO: better error handling
        console.error(err);
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
    this.graph.assertTransaction('DataNode.invalidate()');
    this.state = { status: NodeStatus.Unevaluated };
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
    this.graph.assertTransaction('DataNode.replace()');

    // If graph was part of a cycle, remove circular dependency error from
    // all dependencies that are part of a cycle since they may have been part of the same cycle.
    // When the graph is re-evaluated, any nodes that are still part of a cycle will be
    // marked as such.
    dfs([this], (node): boolean => {
      if (node.state.status !== NodeStatus.CicularDependencyError) {
        return false;
      }

      node.invalidate();
      return true;
    });

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
  }

  private getEvaluationInfo(): EvaluationInfo<TResult> {
    const depStates = this.dependencies.map((dep) => dep.state);

    if (
      this.lastEvaluation &&
      this.state.status !== NodeStatus.Unevaluated &&
      shallowEquals(this.dependencies, this.lastEvaluation.dependencies) &&
      areArraysEqual(depStates, this.lastEvaluation.dependencyStates, areStatesEqual)
    ) {
      // Short circuit re-evaluation since dependencies are the same
      return { depStates, shouldEvaluate: false, nextState: this.state };
    }

    const depValues: unknown[] = [];

    // Build dependency values
    for (const depState of depStates) {
      // Is dependency in an errored state?

      if (isErrorStatus(depState.status)) {
        return {
          depStates,
          shouldEvaluate: false,
          nextState: {
            status: NodeStatus.DependencyError,
          },
        };
      }

      if (depState.status !== NodeStatus.Resolved) {
        console.error('DataNode.evalate() called with dependency in unresolved state');
        return {
          depStates,
          shouldEvaluate: false,
          nextState: {
            status: NodeStatus.InternalError,
          },
        };
      }
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
    this.lastEvaluation = {
      dependencyStates: depStates,
      dependencies: this.dependencies,
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
    } catch (err) {
      return this.commitEvaluation(
        {
          status: NodeStatus.OwnError,
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

    try {
      // Calculate node
      const value = await this.calculateFunction.fn(...evaluationInfo.depValues);

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
    } catch (err) {
      if (owningTransactionId !== this.graph.transactionId) {
        // Another evaluation has begin. Discard result
        return;
      }
      return this.commitEvaluation(
        {
          status: NodeStatus.OwnError,
        },
        depStates,
      );
    }
  }

  public delete(): void {
    this.graph.assertTransaction('DataNode.delete()');
    if (this.isDeleted()) return;

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
}

export default DataNode;
