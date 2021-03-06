import DataNode from '../DataNode';
import { CalculateFunction, DataNodesOf } from '../DataNode/types';
import { GraphTransaction } from './GraphTransaction';
import { defaultOptions, GraphOptions } from './options';
import { MutationInfo, TransactionResult } from './types';

/**
 * @public
 */
class Graph implements Iterable<DataNode> {
  private readonly nodes: Map<string, DataNode> = new Map();
  public readonly options: GraphOptions;

  private currentMutation: MutationInfo | undefined;
  /**
   * Incrementing counter corresponding to most recent transaction
   * @internal
   */
  public transactionId = 0;

  constructor(options: Partial<GraphOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  public addNode<TArgs extends unknown[], TResult>(
    id: string,
    dependencies: DataNodesOf<TArgs>,
    fn: (...args: TArgs) => TResult,
  ): DataNode<TResult> {
    return this.addNodeInternal(id, dependencies, { fn, sync: true });
  }

  public addAsyncNode<TArgs extends unknown[], TResult>(
    id: string,
    dependencies: DataNodesOf<TArgs>,
    fn: (...args: TArgs) => Promise<TResult>,
  ): DataNode<TResult> {
    return this.addNodeInternal<TArgs, TResult>(id, dependencies, { fn, sync: false });
  }

  private addNodeInternal<TArgs extends unknown[], TResult>(
    id: string,
    dependencies: DataNodesOf<TArgs>,
    calculate: CalculateFunction<TResult, TArgs>,
  ): DataNode<TResult> {
    this.markMutated('Graph.addNode()');

    if (this.nodes.has(id)) {
      throw new Error(`Node with id ${id} already exists`);
    }

    const newNode = new DataNode(
      this,
      id,
      dependencies,
      calculate as CalculateFunction<TResult, unknown[]>,
    );

    for (const dep of dependencies) {
      dep.dependents.add(newNode);
    }

    this.nodes.set(id, newNode);

    return newNode;
  }

  /**
   * Helper which either adds or replaces a node based on whether the node already exists
   */
  public upsertNode<TArgs extends unknown[], TResult>(
    id: string,
    dependencies: DataNodesOf<TArgs>,
    fn: (...args: TArgs) => TResult,
  ): DataNode<TResult> {
    const existing = this.getNode<TResult>(id);
    if (existing) {
      existing.replace(dependencies, fn);
      return existing;
    } else {
      return this.addNode(id, dependencies, fn);
    }
  }

  /**
   * Helper which either adds or replaces a node based on whether the node already exists for async calculate functions
   */
  public upsertAsyncNode<TArgs extends unknown[], TResult>(
    id: string,
    dependencies: DataNodesOf<TArgs>,
    fn: (...args: TArgs) => Promise<TResult>,
  ): DataNode<TResult> {
    const existing = this.getNode<TResult>(id);
    if (existing) {
      existing.replaceWithAsync(dependencies, fn);
      return existing;
    } else {
      return this.addAsyncNode(id, dependencies, fn);
    }
  }

  /**
   * @internal
   */
  public deleteNodeInternal(node: DataNode): void {
    this.nodes.delete(node.id);
  }

  getNode<TResult = unknown>(id: string): DataNode<TResult> | undefined {
    return this.nodes.get(id) as DataNode<TResult> | undefined;
  }

  [Symbol.iterator](): IterableIterator<DataNode> {
    return this.nodes.values();
  }

  //#region transaction support
  /**
   * @internal
   */
  public markMutated(name = 'method'): void {
    if (!this.currentMutation) {
      throw new Error(`${name} must be called inside a transaction`);
    }
    this.currentMutation.isChanged = true;
  }

  /**
   * Run mutations on the graph, resulting in graph re-evaluation
   *
   * @returns TransactionResult, only for outermost act() call. Also undefined if mutator didn't alter the graph.
   */
  public act(mutator: () => void): TransactionResult | undefined {
    if (this.currentMutation) {
      // If already inside a transaction, can just call callback
      mutator();
      return undefined;
    }

    this.currentMutation = { isChanged: false };

    try {
      mutator();
      // Only process transaction if mutator caused a mutation
      if (this.currentMutation.isChanged) {
        this.transactionId++;
        return new GraphTransaction(this).result;
      }
    } finally {
      this.currentMutation = undefined;
    }

    return { sync: true };
  }
  //#endregion transaction support
}

export default Graph;
