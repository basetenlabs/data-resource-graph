enum NodeStatus {
  // No dependencies, hasn't been called
  Unevaluated,
  // Waiting for dependencies to resolve
  Pending,
  // Calculating, async only
  Running,
  // Value is computed and current
  Resolved,
  // Calculate function threw or resolved error
  OwnError,
  // One of the node's ancestors threw an error
  DependencyError,
  // Node is involved in a circular dependency
  CicularDependencyError,
  // Node has dependency which no longer exists
  MissingDependencyError,
}

type NodeState<TResult> =
  | {
      status:
        | NodeStatus.Unevaluated
        | NodeStatus.Pending
        // | NodeStatus.Running comment out for now
        | NodeStatus.Resolved
        | NodeStatus.OwnError
        // TODO: include error info like dependency path and error
        | NodeStatus.DependencyError
        // TODO: include cycle
        | NodeStatus.CicularDependencyError
        // TODO: include dependency path
        | NodeStatus.MissingDependencyError;
    }
  | {
      status: NodeStatus.Resolved;
      value: TResult;
    };

export { NodeStatus, NodeState };
