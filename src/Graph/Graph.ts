import assert from 'assert';
import DataNode from '../DataNode/DataNode';
import { NodeStatus } from '../DataNode/NodeTypes';

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

  public analyze(): void {
    // Find all observed nodes
    const observed = Array.from(this.nodes.values()).filter((node) => node.hasObserver());

    const unevaluated: DataNode[] = [];

    const visited = new Set<DataNode>();

    const stack: DataNode[] = [];

    // Depth-first backwards-traverse graph from observed, detecting cycles and finding unevaluated nodes
    function visitNode(node: DataNode) {
      if (visited.has(node)) return;

      // Check for cycle
      const priorNodeIndex = stack.indexOf(node);
      if (priorNodeIndex >= 0) {
        // Found cycle
        const cycle = stack.slice(priorNodeIndex);
        for (const cycleNode of cycle) {
          cycleNode.state = { status: NodeStatus.CicularDependencyError };
        }
        // Remove cycle nodes from unevaluated
        unevaluated.filter((unevaluatedNode) => !cycle.includes(unevaluatedNode));

        // TODO: what to do with dependents of cycle nodes?

        return;
      }

      stack.push(node);

      if (node.state.status === NodeStatus.Unevaluated) {
        unevaluated.push(node);
      }

      node.dependents.forEach(visitNode);

      assert(stack.pop() === node, 'Stack in bad state');
      visited.add(node);
    }

    for (const seedNode of observed) {
      visitNode(seedNode);
    }

    // Built map starting at unevaluated
  }

  getNode(id: string): DataNode | undefined {
    return this.nodes.get(id);
  }

  [Symbol.iterator](): IterableIterator<DataNode> {
    return this.nodes.values();
  }
}

export default Graph;
