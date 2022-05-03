import assert from 'assert';
import dfs from '../Graph/dfs';
import Graph from '../Graph/Graph';
import { shallowEquals } from '../utils';
import { NodeState, NodeStatus, Observer } from './NodeTypes';
import { areArraysEqual, areStatesEqual, isErrorStatus } from './utils';

// TODO: add interfaces for public export

interface EvaluationData<TResult> {
  dependencies: DataNode[];
  dependencyStates: NodeState<unknown>[];
  state: NodeState<TResult>;
}

export type DataNodesOf<TArgs extends unknown[]> = { [Key in keyof TArgs]: DataNode<TArgs[Key]> };

class DataNode<TResult = unknown> {
  public state: NodeState<TResult> = { status: NodeStatus.Unevaluated };
  private lastEvaluation: EvaluationData<TResult> | undefined = undefined;

  constructor(
    public readonly graph: Graph,
    public readonly id: string,
    public dependencies: DataNode[],
    private calculateFunction: (...args: unknown[]) => TResult,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public dependents = new Set<DataNode<any>>();

  // Use any to avoid problems with assigning DataNode<X> to DataNode<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private observers: Observer<any>[] = [];

  public addObserver(observer: Observer<TResult>): void {
    this.graph.assertTransaction('addObserver');

    if (this.observers.includes(observer)) return;
    this.observers.push(observer);
  }

  public removeObserver(observer: Observer<TResult>): void {
    this.graph.assertTransaction('removeObserver');

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

  /**
   * Value has changed, e.g. for dependency-free data. Won't use cached
   * value except for detecting unchanged evaluation
   */
  public invalidate(): void {
    this.graph.assertTransaction('invalidate');
    this.state = { status: NodeStatus.Unevaluated };
  }

  public replace<TArgs extends unknown[]>(
    dependencies: DataNodesOf<TArgs>,
    calculate: (...args: TArgs) => TResult,
  ): void;
  public replace(dependencies: DataNode[], calculate: (...args: unknown[]) => TResult): void {
    this.graph.assertTransaction('replace');

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

        dependency.dependents.add(this);
      }
    }

    this.dependencies = dependencies;

    for (const dep of dependencies) {
      dep.dependents.add(this);
    }

    this.calculateFunction = calculate;
    this.invalidate();
  }

  public evaluate(): void {
    const depStates = this.dependencies.map((dep) => dep.state);
    try {
      if (this.lastEvaluation && this.state.status !== NodeStatus.Unevaluated) {
        if (
          shallowEquals(this.dependencies, this.lastEvaluation.dependencies) &&
          areArraysEqual(depStates, this.lastEvaluation.dependencyStates, areStatesEqual)
        ) {
          // Short circuit re-evaluation since dependencies are the same
          return;
        }
      }

      // Build dependency values
      const dependencyValues: unknown[] = [];
      for (const depState of depStates) {
        // Is dependency in an errored state?
        if (isErrorStatus(depState.status)) {
          this.state = {
            status: NodeStatus.DependencyError,
          };
          return;
        }
        if (depState.status !== NodeStatus.Resolved) {
          console.error('DataNode.evalate() called with dependency in unresolved state');
          this.state = {
            status: NodeStatus.InternalError,
          };
          return;
        }
        dependencyValues.push(depState.value);
      }

      let value: TResult;
      try {
        // Calculate node
        value = this.calculateFunction(...dependencyValues);
      } catch (err) {
        this.state = {
          status: NodeStatus.OwnError,
        };
        return;
      }

      this.state = {
        status: NodeStatus.Resolved,
        value: value,
      };
    } finally {
      // Check if state changed
      if (!this.lastEvaluation || !areStatesEqual(this.state, this.lastEvaluation.state)) {
        // TODO: short circuit on different equality check (e.g. structural equality) provided
        this.graph.transaction?.observedNodesChanged.add(this);
      }
      // Ensure lastEvaluation is set on return
      this.lastEvaluation = {
        dependencyStates: depStates,
        dependencies: this.dependencies,
        state: this.state,
      };
    }
  }

  [Symbol.toStringTag] = `DataNode(${this.id})`;
}

export default DataNode;
