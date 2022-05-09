import { unreachable } from '../utils/utils';
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

export function areArraysEqual<T>(
  arrA: T[],
  arrB: T[],
  comparator: (a: T, b: T) => boolean,
): boolean {
  return arrA.length === arrB.length && arrA.every((a, idx) => comparator(a, arrB[idx]));
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
    case NodeStatus.InternalError:
    case NodeStatus.Deleted:
      return true;
    default:
      unreachable(status);
  }
}
