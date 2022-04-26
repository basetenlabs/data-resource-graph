import assert from 'assert';
import DataNode, { DataNodesOf } from '../DataNode/DataNode';
import { NodeStatus } from '../DataNode/NodeTypes';
import { takeFromSet } from '../utils';
import dfs from './dfs';
import { ReevaluationGraphState } from './types';

class Graph implements Iterable<DataNode> {
  private nodes: Map<string, DataNode> = new Map();

  public addNode<TArgs extends unknown[], TResult>(
    id: string,
    dependencies: DataNodesOf<TArgs>,
    calculate: (...args: TArgs) => TResult,
  ): DataNode<TResult> {
    if (this.nodes.has(id)) {
      throw new Error(`Node with id ${id} already exists`);
    }

    const newNode = new DataNode(id, dependencies, calculate as (...args: unknown[]) => TResult);

    for (const dep of dependencies) {
      dep.dependents.add(newNode);
    }

    this.nodes.set(id, newNode);

    return newNode;
  }

  public deleteNode(_id: string): void {
    // TODO: Mark all dependents as DependencyError
  }

  /**
   * @internal
   */
  public makeReevaluationGraph(): ReevaluationGraphState {
    // Traverse observed subgraph looking for unevaluated deps and cycles
    const observed = Array.from(this.nodes.values()).filter((node) => node.hasObserver());

    const unevaluated = new Set<DataNode>();

    // Future optimization: whether or not each node is directly or indirectly observed can be cached
    // based on the set of observed nodes
    dfs(
      observed,
      (node, stack) => {
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

    // Traverse forwards, recursively making nodes as evaluated
    dfs(
      Array.from(unevaluated),
      (node) => {
        unevaluated.add(node);
      },
      'forward',
    );

    const reevaluationGraph: ReevaluationGraphState = { ready: new Set(), waiting: new Map() };

    // For all observed and unevaluated nodes, decide whether it's ready or is waiting on dependencies
    for (const node of observed) {
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

  public evaluate(): void {
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
}

export default Graph;
