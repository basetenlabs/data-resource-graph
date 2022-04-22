import { unreachable } from '../utils';
import { NodeState, NodeStatus } from './NodeTypes';

export function areStatesEqual<TResult>(
  state1: NodeState<TResult>,
  state2: NodeState<TResult>,
): boolean {
  return (
    state1.status === state2.status &&
    (state1.status !== NodeStatus.Resolved ||
      state2.status !== NodeStatus.Resolved ||
      state1.value === state2.value)
  );
}

export function isErrorStatus(status: NodeStatus): boolean {
  switch (status) {
    case NodeStatus.Unevaluated:
    case NodeStatus.Pending:
    case NodeStatus.Running:
    case NodeStatus.Resolved:
      return false;
    case NodeStatus.OwnError:
    case NodeStatus.DependencyError:
    case NodeStatus.CicularDependencyError:
    case NodeStatus.MissingDependencyError:
    case NodeStatus.InternalError:
      return true;
    default:
      unreachable(status);
  }
}
