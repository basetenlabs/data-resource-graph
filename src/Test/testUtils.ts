import mapValues from 'lodash/mapValues';
import DataNode from '../DataNode';
import { NodeState } from '../DataNode/NodeState';
import Graph from '../Graph';

export type ReplaceNodesWithIds<T> = T extends DataNode
  ? string
  : { [P in keyof T]: ReplaceNodesWithIds<T[P]> };

/**
 * Deeply replaces node referenced with their IDs for simpler assertions
 */
export function mapNodesToIds<T>(val: T): ReplaceNodesWithIds<T>;
export function mapNodesToIds<T>(val: T): unknown {
  if (typeof val !== 'object' || val === null) return val;
  if (val instanceof DataNode) return val.id;
  if (val instanceof Map) {
    return new Map(Array.from(val.entries()).map(([key, value]) => [key, mapNodesToIds(value)]));
  }
  if (val instanceof Map) {
    return new Map(Array.from(val.entries()).map(([key, value]) => [key, mapNodesToIds(value)]));
  }
  if (val instanceof Set) {
    return new Set(Array.from(val.values()).map(mapNodesToIds));
  }
  if (Array.isArray(val)) {
    return val.map(mapNodesToIds);
  }
  if (Object.getPrototypeOf(val) !== Object.prototype) {
    // Don't try to map through foreign non-plain objects
    return val;
  }
  return mapValues(val as Record<string, never>, mapNodesToIds);
}

export function noopObserver(): void {}

export type FlattenedNodeState<T = unknown> = ReplaceNodesWithIds<NodeState<T>>;

export function getNodeStates(g: Graph): Partial<Record<string, NodeState<unknown>>> {
  return Object.fromEntries(Array.from(g).map((node) => [node.id, node.state]));
}
