import assert from 'assert';
import { NodeState, NodeStatus } from './NodeTypes';

// TODO: add interfaces for public export
class DataNode<TResult = unknown> {
  public state: NodeState<TResult> = { status: NodeStatus.Unevaluated };

  constructor(
    public readonly id: string,
    public dependencies: DataNode[],
    public calculate: (...args: unknown[]) => TResult,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public dependents = new Set<DataNode<any>>();

  // Use any to avoid problems with assigning DataNode<X> to DataNode<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private observers: Observer<any>[] = [];

  public addObserver(observer: Observer<TResult>): void {
    if (this.observers.includes(observer)) return;
    this.observers.push(observer);
  }

  public removeObserver(observer: Observer<TResult>): void {
    const index = this.observers.indexOf(observer);
    if (index < 0) return;
    this.observers.splice(index, 1);
  }

  public hasObserver(): boolean {
    return this.observers.length > 0;
  }

  /**
   * Value has changed, e.g. for dependency-free data. Won't use cached
   * value except for detecting unchanged evaluation
   */
  public invalidate(): void {
    this.state = { status: NodeStatus.Unevaluated };
    // TODO: invalidate dependents?
    // TODO: trigger recalculation
  }

  public replace(dependencies: DataNode[], calculate: (...args: unknown[]) => TResult): void {
    // Remove self from old dependencies
    for (const dependency of this.dependencies) {
      if (!dependencies.includes(dependency)) {
        assert(
          !dependency.dependents.has(this),
          `Internal error: Graph inconsistency between ${this}.dependencies and ${dependencies}.dependents`,
        );

        dependency.dependents.add(this);
      }
    }

    this.dependencies = dependencies;

    for (const dep of dependencies) {
      dep.dependents.add(this);
    }

    this.calculate = calculate;
    this.invalidate();
  }

  [Symbol.toStringTag]: () => `DataNode(this.id)`;
}

type Observer<TResult> = (result: TResult) => void;

export default DataNode;
