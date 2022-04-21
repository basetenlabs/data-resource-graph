import DataNode from '../DataNode/DataNode';
import { NodeStatus } from '../DataNode/NodeTypes';
import dfs from './dfs';
import { ReevaluationGraphState } from './types';

class Graph implements Iterable<DataNode> {
  private nodes: Map<string, DataNode> = new Map();

  public addNode<TDependencies extends DataNode[], TResult>(
    id: string,
    dependencies: TDependencies,
    calculate: (...deps: TDependencies) => TResult,
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

    // Start evaluating with unevaluated, and update dependencies

    const reevaluationGraph: ReevaluationGraphState = { ready: new Set(), waiting: new Map() };

    for (const node of unevaluated) {
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

    return reevaluationGraph;
  }

  getNode(id: string): DataNode | undefined {
    return this.nodes.get(id);
  }

  [Symbol.iterator](): IterableIterator<DataNode> {
    return this.nodes.values();
  }
}

export default Graph;
