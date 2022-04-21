import assert from 'assert';
import DataNode from '../DataNode/DataNode';

// TODO: add some basic tests

/**
 * Traverses the graph in depth-first order. Every node reachable from `startingNodes` will
 * be visited exactly once. If a cycle is detected, the node is still visited but the search
 * will only visit the nodes around the cycle once.
 *
 * @param startingNodes A starting collection of nodes to iterate from
 * @param visitor function that receives each node as well as the path from one of the starting
 * nodes up to but not including the current node
 * @param direction Forward goes node -> dependents (direction of data). Backward goes node -> dependencies
 */
export default function dfs(
  startingNodes: DataNode[],
  visitor: (node: DataNode, stack: DataNode[]) => void,
  direction: 'forward' | 'backward' = 'forward',
): void {
  const visited = new Set<DataNode>();

  const stack: DataNode[] = [];

  // Depth-first backwards-traverse graph from observed, detecting cycles and finding unevaluated nodes
  function visitHelperer(node: DataNode) {
    if (visited.has(node)) return;

    visitor(node, stack);

    if (stack.includes(node)) {
      // Short circuit search if we've found a cycle
      return;
    }

    stack.push(node);

    (direction === 'forward' ? node.dependents : node.dependencies).forEach(visitHelperer);

    assert(stack.pop() === node, 'Stack in bad state');
    visited.add(node);
  }

  for (const startingNode of startingNodes) {
    visitHelperer(startingNode);
  }
}