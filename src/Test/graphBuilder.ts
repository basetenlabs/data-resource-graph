import { defaults } from 'lodash';
import DataNode from '../DataNode/DataNode';
import Graph from '../Graph/Graph';

export type GraphBuilder<TValue> = {
  addNode(id: string, deps: string[], options?: Partial<NodeOptions<TValue>>): GraphBuilder<TValue>;
  graph: Graph;
};

export type NodeOptions<TValue> = {
  /**
   * @default true
   */
  isObserved: boolean;
  /**
   * Calculate fn
   * @default noop
   */
  fn(...args: TValue[]): TValue;
};

const noop = () => {};

const defaultOptions: NodeOptions<unknown> = {
  isObserved: true,
  fn: noop,
};

/**
 * Utility for building declarative, as opposed to constructive, graphs
 */
export function graphBuilder<TValue = unknown>(): GraphBuilder<TValue> {
  const graph = new Graph();

  function ensureNode(id: string): DataNode<TValue> {
    return (
      (graph.getNode(id) as DataNode<TValue>) ??
      graph.addNode<[], TValue>(id, [], noop as () => TValue)
    );
  }

  const graphBuilder: GraphBuilder<TValue> = {
    graph,
    addNode(id: string, deps: string[], partialOptions = {}) {
      const options: NodeOptions<TValue> = defaults(partialOptions, defaultOptions);

      const depNodes = deps.map(ensureNode);

      let node = graph.getNode(id);
      if (node) {
        node.replace<TValue[]>(depNodes as DataNode<TValue>[], options.fn);
      } else {
        node = graph.addNode<TValue[], TValue>(id, depNodes, options.fn);
      }

      if (options.isObserved) node.addObserver(noop);

      return graphBuilder;
    },
  };

  return graphBuilder;
}
