import DataNode from './DataNode';

/**
 * An enum describing the current evaluation state of the node
 * @public
 */
enum NodeStatus {
  /**
   * No dependencies, hasn't been called
   */
  Unevaluated = 'uneval',
  /**
   * Value is computed and current
   */
  Resolved = 'resolved',
  /**
   * Calculate function threw or resolved error
   */
  OwnError = 'ownError',
  /**
   * One of the node's ancestors threw an error
   */
  DependencyError = 'depError',
  /**
   * Node is involved in a circular dependency
   */
  CicularDependencyError = 'circularDepError',
  /**
   * Node is deleted
   */
  Deleted = 'deleted',
}

/**
 * The current evaluation state of a node
 * @public
 */
type NodeState<TResult> =
  | {
      status:
        | NodeStatus.Unevaluated
        | NodeStatus.OwnError
        // TODO: include error info like dependency path and error
        | NodeStatus.DependencyError
        // TODO: include cycle
        | NodeStatus.CicularDependencyError
        // TODO: include dependency path
        | NodeStatus.Deleted;
    }
  | {
      status: NodeStatus.Resolved;
      value: TResult;
    };

/**
 * An observer is a function which when registered on a node gets called every time the node is updated.
 * Observers are keyed by reference. A single observer may be registered on multiple nodes, but can only
 * be registered once per node.
 * @public
 */
type Observer<TResult> = (state: NodeState<TResult>) => void;

/**
 * @internal
 */
type CalculateFunction<TResult, TArgs extends unknown[]> =
  | { sync: true; fn: (...args: TArgs) => TResult }
  | { sync: false; fn: (...args: TArgs) => Promise<TResult> };

/**
 * Constructs a tuple of typed DataNodes from a tuple of result types
 * @public
 */
export type DataNodesOf<TArgs extends unknown[]> = { [Key in keyof TArgs]: DataNode<TArgs[Key]> };

export { NodeStatus, NodeState, Observer, CalculateFunction };
