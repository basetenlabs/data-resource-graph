import DataNode from '../DataNode';
import Graph from '../Graph';

export type GraphBuilder<TValue> = {
  addNode(
    id: string,
    deps: string[],
    calculateFn?: (...args: TValue[]) => TValue,
  ): GraphBuilder<TValue>;
  addNodeAsync(
    id: string,
    deps: string[],
    calculateFn?: (...args: TValue[]) => Promise<TValue>,
  ): GraphBuilder<TValue>;
  act(callback: (graphBuilder: GraphBuilder<TValue>) => void): GraphBuilder<TValue>;
  graph: Graph;
};

export type NodeOptions = {
  /**
   * @default false
   */
  isObserved: boolean;
};

const noop = () => {};

/**
 * Utility for building declarative, as opposed to constructive, graphs
 */
export function graphBuilder<TValue extends undefined>(
  defaultNodeValue?: undefined,
): GraphBuilder<TValue>;
export function graphBuilder<TValue = unknown>(defaultNodeValue: TValue): GraphBuilder<TValue>;
export function graphBuilder<TValue = unknown>(defaultNodeValue: TValue): GraphBuilder<TValue> {
  const graph = new Graph();

  function ensureNode(id: string): DataNode<TValue> {
    return (graph.getNode(id) ?? graph.addNode(id, [], noop)) as DataNode<TValue>;
  }

  const graphBuilder: GraphBuilder<TValue> = {
    graph,
    addNode(id, deps, calculateFn = () => defaultNodeValue) {
      const depNodes = deps.map(ensureNode);

      let node = graph.getNode(id);
      if (node) {
        node.replace<TValue[]>(depNodes as DataNode<TValue>[], calculateFn);
      } else {
        node = graph.addNode<TValue[], TValue>(id, depNodes, calculateFn);
      }

      return graphBuilder;
    },
    addNodeAsync(id, deps, calculateFn = () => Promise.resolve(defaultNodeValue)) {
      const depNodes = deps.map(ensureNode);

      let node = graph.getNode(id);
      if (node) {
        node.replaceWithAsync<TValue[]>(depNodes as DataNode<TValue>[], calculateFn);
      } else {
        node = graph.addAsyncNode<TValue[], TValue>(id, depNodes, calculateFn);
      }

      return graphBuilder;
    },
    act(callback) {
      graph.act(() => callback(graphBuilder));
      return graphBuilder;
    },
  };

  return graphBuilder;
}
