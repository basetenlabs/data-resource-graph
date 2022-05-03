import assert from 'assert';
import { defaults } from 'lodash';
import DataNode, { DataNodesOf } from '../DataNode/DataNode';
import { NodeStatus } from '../DataNode/NodeTypes';
import { takeFromSet } from '../utils';
import dfs from './dfs';
import { defaultOptions, GraphOptions } from './options';
import { ReevaluationGraphState, Transaction } from './types';

class Graph implements Iterable<DataNode> {
  private nodes: Map<string, DataNode> = new Map();
  public transaction: Transaction | undefined;
  private readonly options: GraphOptions;

  constructor(options: Partial<GraphOptions> = {}) {
    this.options = defaults(defaultOptions, options);
  }

  public addNode<TArgs extends unknown[], TResult>(
    id: string,
    dependencies: DataNodesOf<TArgs>,
    calculate: (...args: TArgs) => TResult,
  ): DataNode<TResult> {
    this.assertTransaction('addNode');

    if (this.nodes.has(id)) {
      throw new Error(`Node with id ${id} already exists`);
    }

    const newNode = new DataNode(
      this,
      id,
      dependencies,
      calculate as (...args: unknown[]) => TResult,
    );

    for (const dep of dependencies) {
      dep.dependents.add(newNode);
    }

    this.nodes.set(id, newNode);

    return newNode;
  }

  public deleteNode(id: string): void {
    this.assertTransaction('deleteNode');

    const node = this.getNode(id);
    if (!node) {
      throw new Error(`Node with id ${id} doesn't exist`);
    }

    // Mark all dependents as unevaluated since they've entered an error state
    node.state = { status: NodeStatus.Deleted };
    for (const dependent of node.dependents) {
      dependent.invalidate();
    }
    // Remove dependencies to self
    for (const dep of node.dependencies) {
      dep.dependents.delete(node);
    }

    this.nodes.delete(id);
  }

  private makeReevaluationGraph(): ReevaluationGraphState {
    const observed = Array.from(this.nodes.values()).filter((node) => node.hasObserver());

    const unevaluated = new Set<DataNode>();
    const observedSet = new Set<DataNode>();

    // Traverse observed subgraph looking for unevaluated deps and cycles
    // Future optimization: whether or not each node is directly or indirectly observed can be cached
    // based on the set of observed nodes and graph topology
    dfs(
      observed,
      (node, stack) => {
        observedSet.add(node);
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

        if (node.state.status === NodeStatus.Unevaluated) {
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

  private evaluate(): void {
    const { ready, waiting } = this.makeReevaluationGraph();

    let readyNode: DataNode | undefined;

    // eslint-disable-next-line no-cond-assign
    while ((readyNode = takeFromSet(ready))) {
      readyNode.evaluate();

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
   */
  public act(callback: () => void): void {
    if (this.transaction) {
      // If already inside a transaction, can just call callback
      callback();
      return;
    }

    const transaction = (this.transaction = { observedNodesChanged: new Set() });

    try {
      callback();

      this.evaluate();
    } finally {
      this.options.observationBatcher(() => {
        for (const node of transaction.observedNodesChanged) {
          node.notifyObservers();
        }
      });

      this.transaction = undefined;
    }
  }
  //#endregion transaction support
}

export default Graph;
