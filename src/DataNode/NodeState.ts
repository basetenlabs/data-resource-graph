import DataNode from './DataNode';

/**
 * An enum describing the current evaluation state of the node
 * @public
 */
export enum NodeStatus {
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
 * The current evaluation state of a node
 * @public
 */
export type NodeState<TResult> =
  | UnevaluatedNodeState
  | DeletedNodeState
  | MissingDependencyErrorNodeState
  | CircularDependencyNodeState
  | ResolvedNodeState<TResult>
  | ErrorNodeState
  | DependencyErrorNodeState;
