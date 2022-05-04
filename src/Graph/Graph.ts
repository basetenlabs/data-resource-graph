import assert from 'assert';
import { defaults } from 'lodash';
import DataNode, { DataNodesOf } from '../DataNode/DataNode';
import { CalculateFunction, NodeStatus } from '../DataNode/NodeTypes';
import { assertRunOnce, takeFromSet } from '../utils';
import dfs from './dfs';
import { defaultOptions, GraphOptions } from './options';
import { ReevaluationGraphState, Transaction } from './types';

class Graph implements Iterable<DataNode> {
  private readonly nodes: Map<string, DataNode> = new Map();
  private readonly options: GraphOptions;

  public transaction: Transaction | undefined;
  // Incrementing counter corresponding to most recent transaction
  public transactionId = 0;
  // Set of nodes that still needed to be evaluated in most recent transaction
  private nodesPendingExecution = new Set<DataNode>();

  constructor(options: Partial<GraphOptions> = {}) {
    this.options = defaults(defaultOptions, options);
  }

  public addNode<TArgs extends unknown[], TResult>(
    id: string,
    dependencies: DataNodesOf<TArgs>,
    fn: (...args: TArgs) => TResult,
  ): DataNode<TResult> {
    return this.addNodeInner(id, dependencies, { fn, sync: true });
  }

  public addNodeAsync<TArgs extends unknown[], TResult>(
    id: string,
    dependencies: DataNodesOf<TArgs>,
    fn: (...args: TArgs) => Promise<TResult>,
  ): DataNode<TResult> {
    return this.addNodeInner<TArgs, TResult>(id, dependencies, { fn, sync: false });
  }

  private addNodeInner<TArgs extends unknown[], TResult>(
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

  public deleteNodeInternal(node: DataNode): void {
    this.assertTransaction('Graph.deleteNode()');

    this.nodes.delete(node.id);
  }

  private makeReevaluationGraph(): ReevaluationGraphState {
    const observed = Array.from(this.nodes.values()).filter((node) => node.hasObserver());

    const unevaluated = new Set<DataNode>();
    const observedSet = new Set<DataNode>();

    // Traverse observed subgraph looking for unevaluated nodes and detecting cycles
    // TODO Future optimization: whether or not each node is directly or indirectly observed can be cached
    // based on the set of observed nodes and graph topology
    dfs(
      observed,
      (node, stack) => {
        observedSet.add(node);
        // Look for cycles
        const priorNodeIndex = stack.indexOf(node);
        if (priorNodeIndex >= 0) {
          // Found cycle, set error on all cycle nodes
          const cycle = stack.slice(priorNodeIndex);
          for (const cycleNode of cycle) {
            cycleNode.state = { status: NodeStatus.CicularDependencyError };
            // Remove cycle nodes from unevaluated
            unevaluated.delete(cycleNode);
          }

          return;
        }

        // Check if node needs to be evaluated
        if (node.state.status === NodeStatus.Unevaluated) {
          unevaluated.add(node);
        } else if (this.nodesPendingExecution.has(node)) {
          // Carry over nodes that were supposed to be executed last transaction but weren't
          unevaluated.add(node);
        }
      },
      'backward',
    );

    // Traverse forwards, recursively making nodes as unevaluated
    dfs(
      Array.from(unevaluated),
      (node) => {
        if (node.state.status !== NodeStatus.CicularDependencyError) {
          unevaluated.add(node);
        }
      },
      'forward',
    );

    const reevaluationGraph: ReevaluationGraphState = { ready: new Set(), waiting: new Map() };

    // For all observed and unevaluated nodes, decide whether it's ready or is waiting on dependencies
    for (const node of observedSet) {
      if (unevaluated.has(node)) {
        let numUnevaluatedDeps = 0;
        for (const dep of node.dependencies) {
          if (unevaluated.has(dep)) numUnevaluatedDeps++;
        }
        if (numUnevaluatedDeps) {
          reevaluationGraph.waiting.set(node, numUnevaluatedDeps);
        } else {
          reevaluationGraph.ready.add(node);
        }
      }
    }

    return reevaluationGraph;
  }

  // ASYNC: add parallel evaluate async
  // ASYNC: return TransactionInfo, namely a completion promise and a flag about whether transaction was cancelled
  // Add hasAsync() to evaluate graph to see if sync evaluate can be called
  private evaluate({ ready, waiting }: ReevaluationGraphState): void {
    // ASYNC: [...ready, ...waiting.keys()].forEach(node =>this.nodesPendingExecution.add(node));

    let readyNode: DataNode | undefined;

    // ASYNC: run ready code in parallel, and call internal run() function on signal

    // eslint-disable-next-line no-cond-assign
    while ((readyNode = takeFromSet(ready))) {
      // ASYNC: add conditional async
      readyNode.evaluate();

      // ASYNC: check for staleness

      for (const dependent of readyNode.dependents) {
        const dependentCounter = waiting.get(dependent);
        if (dependentCounter !== undefined) {
          if (dependentCounter === 1) {
            waiting.delete(dependent);
            ready.add(dependent);
          } else if (dependentCounter > 1) {
            // Signal
            waiting.set(dependent, dependentCounter - 1);
          }
        }
      }
    }

    assert(!waiting.size, 'Exhausted ready queue with nodes still waiting');
    // Finished executing
    this.nodesPendingExecution.clear();
  }

  getNode(id: string): DataNode | undefined {
    return this.nodes.get(id);
  }

  [Symbol.iterator](): IterableIterator<DataNode> {
    return this.nodes.values();
  }

  //#region transaction support
  public assertTransaction(name = 'method'): void {
    if (!this.transaction) {
      throw new Error(`${name} must be called inside a transaction`);
    }
  }

  /**
   * Run mutations inside an action
   * @returns TransactionResult, only for outermost act() call
   */
  public act(callback: () => void): void {
    if (this.transaction) {
      // If already inside a transaction, can just call callback
      callback();
      return;
    }

    const transaction = (this.transaction = { notificationQueue: new Set() });
    this.transactionId++;

    // TODO: figure out control flow + error handling; move evaluate() out of try?
    try {
      callback();
    } catch (err) {
      this.transaction = undefined;
      throw err;
    }

    const reevaluationGraph = this.makeReevaluationGraph();

    this.evaluate(reevaluationGraph);

    assertRunOnce(this.options.observationBatcher)(() => {
      for (const node of transaction.notificationQueue) {
        node.notifyObservers();
      }
    });

    this.transaction = undefined;
  }
  //#endregion transaction support
}

export default Graph;
