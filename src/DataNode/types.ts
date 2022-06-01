import DataNode from './DataNode';
import { EvaluatedNodeState } from './NodeState';

/**
 * An observer is a function which when registered on a node gets called every time the node is updated.
 * Observers are keyed by reference. A single observer may be registered on multiple nodes, but can only
 * be registered once per node.
 * @public
 */
export type Observer<TResult> = (state: EvaluatedNodeState<TResult>) => void;

/**
 * @internal
 */
export type CalculateFunction<TResult, TArgs extends unknown[]> =
  | { sync: true; fn: (...args: TArgs) => TResult }
  | { sync: false; fn: (...args: TArgs) => Promise<TResult> };

/**
 * Constructs a tuple of typed DataNodes from a tuple of result types
 * @public
 */
export type DataNodesOf<TArgs extends unknown[]> = { [Key in keyof TArgs]: DataNode<TArgs[Key]> };
