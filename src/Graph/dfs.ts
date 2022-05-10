import DataNode from '../DataNode';
import assert from '../utils/assert';

export type DfsVisitor =
  | ((node: DataNode, stack: DataNode[]) => void)
  | ((node: DataNode, stack: DataNode[]) => boolean);

/**
 * Traverses the graph in depth-first order. Every node reachable from `startingNodes` will
 * be visited exactly once. If a cycle is detected, the node is still visited but the search
 * will only visit the nodes around the cycle once.
 *
 * @param startingNodes A starting collection of nodes to iterate from
 * @param visitor function that receives each node as well as the path from one of the starting
 * nodes up to but not including the current node. If this is a boolean function, the return value
 * indicated whether the search should continue traversing from this node.
 * @param direction Forward goes node -> dependents (direction of data). Backward goes node -> dependencies
 */
export default function dfs(
  startingNodes: DataNode[],
  visitor: DfsVisitor,
  direction: 'forward' | 'backward' = 'forward',
): void {
  const visited = new Set<DataNode>();

  const stack: DataNode[] = [];

  function visitHelperer(node: DataNode) {
    if (visited.has(node)) return;

    // Deleted nodes aren't automatically removed, but they're not part of the graph
    // and so shouldn't be traversed.
    if (node.isDeleted()) return;

    const result = visitor(node, stack);

    if (stack.includes(node)) {
      // Short circuit search if we've found a cycle
      return;
    }

    if (typeof result === 'undefined' || result == true) {
      // Recurse
      stack.push(node);
      (direction === 'forward' ? node.dependents : node.dependencies).forEach(visitHelperer);
      assert(stack.pop() === node, 'Stack in bad state');
    }
    visited.add(node);
  }

  for (const startingNode of startingNodes) {
    visitHelperer(startingNode);
  }
}
