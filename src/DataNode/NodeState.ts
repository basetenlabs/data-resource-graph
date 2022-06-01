import DataNode from './DataNode';

/**
 * An enum describing the current evaluation state of the node
 * @public
 */
export enum NodeStatus {
  /**
   * Node hasn't been called or has been invalidated
   */
  Unevaluated = 'uneval',
  /**
   * Node is awaiting evaluation. This is differs from `NodeStatus.Unevaluated` in that the last calculation
   * may be reused if it's still valid
   */
  Pending = 'pending',
  /**
   * Calculate function is executing. Async nodes only
   */
  Running = 'running',
  /**
   * Value is computed and current
   */
  Resolved = 'resolved',
  /**
   * Calculate function threw or resolved error
   */
  OwnError = 'ownError',
  /**
   * One of the node's dependencies (direct or indirect) threw an error
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
  /**
   * One of the node's dependencies (direct or indirect) was deleted
   */
  MissingDependencyError = 'missingDepError',
}

/**
 * @public
 */
export type UnevaluatedNodeState = { status: NodeStatus.Unevaluated };

/**
 * @public
 */
export type PendingNodeState = { status: NodeStatus.Pending };

/**
 * @public
 */
export type RunningNodeState = { status: NodeStatus.Running };

/**
 * @public
 */
export type ResolvedNodeState<TResult> = {
  status: NodeStatus.Resolved;
  value: TResult;
};

/**
 * @public
 */
export type ErrorNodeState = {
  status: NodeStatus.OwnError;
  error: unknown;
};

/**
 * @public
 */
export type DependencyErrorNodeState = {
  status: NodeStatus.DependencyError;
  error: unknown;
  /**
   * Path of nodes from originating up to current node
   */
  path: DataNode[];
};

/**
 * @public
 */
export type CircularDependencyNodeState = {
  status: NodeStatus.CicularDependencyError;
  //TODO: add circular dependency path
};

/**
 * @public
 */
export type DeletedNodeState = { status: NodeStatus.Deleted };

/**
 * @public
 */
export type MissingDependencyErrorNodeState = {
  status: NodeStatus.MissingDependencyError;
  /**
   * Path from deleted node up to current node
   */
  path: DataNode[];
};

/**
 * The states of a node which may cause an observer to be notified
 * @public
 */
export type EvaluatedNodeState<TResult> =
  | DeletedNodeState
  | MissingDependencyErrorNodeState
  | CircularDependencyNodeState
  | ResolvedNodeState<TResult>
  | ErrorNodeState
  | DependencyErrorNodeState;

/**
 * The current evaluation state of a node, including states of nodes
 * which are not fully evaluated.
 * @internal
 */
export type NodeState<TResult> =
  | UnevaluatedNodeState
  | PendingNodeState
  | RunningNodeState
  | EvaluatedNodeState<TResult>;
