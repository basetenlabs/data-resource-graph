import fromPairs from 'lodash/fromPairs';
import mapValues from 'lodash/mapValues';
import DataNode from '../DataNode/DataNode';
import { NodeState } from '../DataNode/NodeTypes';
import Graph from '../Graph/Graph';

/**
 * Deeply replaces node referenced with their IDs for simpler assertions
 */
export function mapNodesToIds(val: unknown): unknown {
  if (typeof val !== 'object') return val;
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
  } else {
    return mapValues(val, mapNodesToIds);
  }
}

export function noopObserver(): void {}

export function getNodeStates(g: Graph): Record<string, NodeState<unknown>> {
  return fromPairs(
    Array.from(g).map((node): [string, NodeState<unknown>] => [node.id, node.state]),
  );
}
