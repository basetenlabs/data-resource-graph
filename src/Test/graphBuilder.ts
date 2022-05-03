import { defaults } from 'lodash';
import DataNode from '../DataNode/DataNode';
import Graph from '../Graph/Graph';

export type GraphBuilder<TValue> = {
  addNode(
    id: string,
    deps: string[],
    calculateFn?: (...args: TValue[]) => TValue,
    partialOptions?: Partial<NodeOptions>,
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

const defaultOptions: NodeOptions = {
  isObserved: false,
};

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
    return (
      (graph.getNode(id) as DataNode<TValue>) ??
      graph.addNode<[], TValue>(id, [], noop as () => TValue)
    );
  }

  const graphBuilder: GraphBuilder<TValue> = {
    graph,
    addNode(id, deps, calculateFn = () => defaultNodeValue, partialOptions = {}) {
      const options: NodeOptions = defaults(partialOptions, defaultOptions);

      const depNodes = deps.map(ensureNode);

      let node = graph.getNode(id);
      if (node) {
        node.replace<TValue[]>(depNodes as DataNode<TValue>[], calculateFn);
      } else {
        node = graph.addNode<TValue[], TValue>(id, depNodes, calculateFn);
      }

      if (options.isObserved) node.addObserver(noop);

      return graphBuilder;
    },
    act(callback) {
      graph.act(() => callback(graphBuilder));
      return graphBuilder;
    },
  };

  return graphBuilder;
}
