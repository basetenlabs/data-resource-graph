import assert from 'assert';
import dfs from '../Graph/dfs';
import Graph from '../Graph/Graph';
import { shallowEquals } from '../utils/utils';
import { CalculateFunction, NodeState, NodeStatus, Observer } from './NodeTypes';
import { areArraysEqual, areStatesEqual, isErrorStatus } from './utils';

interface EvaluationData<TResult> {
  dependencies: DataNode[];
  dependencyStates: NodeState<unknown>[];
  /**
   * Output of state after evaluation is run. Unlike DataNode.state, this is not cleared on invalidation
   */
  state: NodeState<TResult>;
}

export type DataNodesOf<TArgs extends unknown[]> = { [Key in keyof TArgs]: DataNode<TArgs[Key]> };

type EvaluationInfo<TResult> = {
  depStates: NodeState<unknown>[];
} & (
  | { shouldEvaluate: false; nextState: NodeState<TResult> }
  | { shouldEvaluate: true; depValues: unknown[] }
);

class DataNode<TResult = unknown> {
  public state: NodeState<TResult> = { status: NodeStatus.Unevaluated };
  private lastEvaluation: EvaluationData<TResult> | undefined = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public dependents = new Set<DataNode<any>>();

  // Use any to avoid problems with assigning DataNode<X> to DataNode<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private observers: Observer<any>[] = [];

  [Symbol.toStringTag] = `DataNode('${this.id}')`;

  constructor(
    public readonly graph: Graph,
    public readonly id: string,
    public dependencies: DataNode[],
    private calculateFunction: CalculateFunction<TResult, unknown[]>,
  ) {}

  //#region observers
  public addObserver(observer: Observer<TResult>): void {
    this.assertNotDeleted();
    this.graph.assertTransaction('DataNode.addObserver()');

    if (this.observers.includes(observer)) return;
    this.observers.push(observer);
  }

  public removeObserver(observer: Observer<TResult>): void {
    this.assertNotDeleted();
    this.graph.assertTransaction('DataNode.removeObserver()');

    const index = this.observers.indexOf(observer);
    if (index < 0) return;
    this.observers.splice(index, 1);
  }

  public hasObserver(): boolean {
    return this.observers.length > 0;
  }

  public notifyObservers(): void {
    for (const observer of this.observers) {
      observer(this.state);
    }
  }
  //#endregion observers

  /**
   * Value has changed, e.g. for dependency-free data. Won't use cached value except for detecting unchanged evaluation
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
    this.replaceInner(dependencies, { fn, sync: true });
  }

  public replaceWithAsync<TArgs extends unknown[]>(
    dependencies: DataNodesOf<TArgs>,
    fn: (...args: TArgs) => Promise<TResult>,
  ): void {
    this.replaceInner(dependencies, { fn, sync: false });
  }

  private replaceInner<TArgs extends unknown[]>(
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
   * @return Whether to notify observers
   */
  private commitEvaluation(newState: NodeState<TResult>, depStates: NodeState<unknown>[]): boolean {
    this.state = newState;
    const shouldNotify =
      (!this.lastEvaluation || !areStatesEqual(newState, this.lastEvaluation.state)) &&
      this.hasObserver();
    this.lastEvaluation = {
      dependencyStates: depStates,
      dependencies: this.dependencies,
      state: this.state,
    };
    return shouldNotify;
  }

  /**
   * @return Whether to notify observers
   */
  public evaluate(): boolean {
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
   * @return Whether to notify observers
   */
  public async evaluateAsync(): Promise<boolean> {
    this.assertNotDeleted();

    const evaluationInfo = this.getEvaluationInfo();
    const { depStates } = evaluationInfo;

    if (!evaluationInfo.shouldEvaluate) {
      return this.commitEvaluation(evaluationInfo.nextState, depStates);
    }

    const currentTransactionId = this.graph.transactionId;

    try {
      // Calculate node
      const value = await this.calculateFunction.fn(...evaluationInfo.depValues);

      if (currentTransactionId !== this.graph.transactionId) {
        // Another evaluation has begin. Discard result
        return false;
      }

      return this.commitEvaluation(
        {
          status: NodeStatus.Resolved,
          value: value,
        },
        depStates,
      );
    } catch (err) {
      if (currentTransactionId !== this.graph.transactionId) {
        // Another evaluation has begin. Discard result
        return false;
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
