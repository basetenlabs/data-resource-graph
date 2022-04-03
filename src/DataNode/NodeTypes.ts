enum NodeStatus {
  // No dependencies, hasn't been called
  Unevaluated = 'uneval',
  // Waiting for dependencies to resolve
  Pending = 'pending',
  // Calculating, async only
  Running = 'running',
  // Value is computed and current
  Resolved = 'resolved',
  // Calculate function threw or resolved error
  OwnError = 'ownError',
  // One of the node's ancestors threw an error
  DependencyError = 'depError',
  // Node is involved in a circular dependency
  CicularDependencyError = 'circularDepError',
  // Node has dependency which no longer exists
  MissingDependencyError = 'missingDepError',
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
