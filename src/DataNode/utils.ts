import { shallowEquals } from '../utils/utils';
import { NodeState, NodeStatus } from './NodeState';

function assertSameStateType<Substate extends NodeState<unknown>>(
  _state: NodeState<unknown>,
): asserts _state is Substate {}

export function areStatesEqual<TResult>(
  state1: NodeState<TResult>,
  state2: NodeState<TResult>,
): boolean {
  if (state1.status !== state2.status) return false;

  switch (state1.status) {
    case NodeStatus.Unevaluated:
      return true;
    case NodeStatus.Resolved:
      assertSameStateType<typeof state1>(state2);
      return state1.value === state2.value;
    case NodeStatus.Pending:
      return true;
    case NodeStatus.Running:
      return true;
    case NodeStatus.OwnError:
      assertSameStateType<typeof state1>(state2);
      return state1.error === state2.error;
    case NodeStatus.DependencyError:
      assertSameStateType<typeof state1>(state2);
      return state1.error === state2.error && shallowEquals(state1.path, state2.path);
    case NodeStatus.CicularDependencyError:
      assertSameStateType<typeof state1>(state2);
      return true;
    case NodeStatus.Deleted:
      return true;
    case NodeStatus.MissingDependencyError:
      assertSameStateType<typeof state1>(state2);
      return shallowEquals(state1.path, state2.path);
  }
}

export function areArraysEqual<T>(
  arrA: T[],
  arrB: T[],
  comparator: (a: T, b: T) => boolean,
): boolean {
  return arrA.length === arrB.length && arrA.every((a, idx) => comparator(a, arrB[idx]));
}
