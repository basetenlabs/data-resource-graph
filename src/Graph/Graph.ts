import defaults from 'lodash/defaults';
import DataNode from '../DataNode';
import { CalculateFunction, DataNodesOf } from '../DataNode/types';
import { GraphTransaction } from './GraphTransaction';
import { defaultOptions, GraphOptions } from './options';
import { TransactionResult } from './types';

/**
 * @public
 */
class Graph implements Iterable<DataNode> {
  private readonly nodes: Map<string, DataNode> = new Map();
  public readonly options: GraphOptions;

  private isInMutationPhase = false;
  /**
   * Incrementing counter corresponding to most recent transaction
   * @internal
   */
  public transactionId = 0;

  private currentTransaction: GraphTransaction | undefined;

  constructor(options: Partial<GraphOptions> = {}) {
    this.options = defaults(defaultOptions, options);
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
    this.assertTransaction('Graph.addNode()');

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
   * @internal
   */
  public deleteNodeInternal(node: DataNode): void {
    this.assertTransaction('Graph.deleteNode()');

    this.nodes.delete(node.id);
  }

  getNode(id: string): DataNode | undefined {
    return this.nodes.get(id);
  }

  [Symbol.iterator](): IterableIterator<DataNode> {
    return this.nodes.values();
  }

  //#region transaction support
  /**
   * @internal
   */
  public assertTransaction(name = 'method'): void {
    if (!this.isInMutationPhase) {
      throw new Error(`${name} must be called inside a transaction`);
    }
  }

  /**
   * Run mutations inside an action
   * @returns TransactionResult, only for outermost act() call
   */
  public act(mutator: () => void): TransactionResult | undefined {
    if (this.isInMutationPhase) {
      // If already inside a transaction, can just call callback
      mutator();
      return undefined;
    }

    this.isInMutationPhase = true;
    this.transactionId++;

    try {
      mutator();
    } finally {
      this.isInMutationPhase = false;
    }

    this.currentTransaction = new GraphTransaction(this, this.currentTransaction);
    return this.currentTransaction.result;
  }
  //#endregion transaction support
}

export default Graph;
