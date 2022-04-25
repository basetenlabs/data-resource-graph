import { defaults } from 'lodash';
import DataNode from '../DataNode/DataNode';
import Graph from '../Graph/Graph';

export type GraphBuilder = {
  addNode(id: string, deps: string[], options?: Partial<NodeOptions>): GraphBuilder;
  graph: Graph;
};

export type NodeOptions = {
  /**
   * @default true
   */
  isObserved: boolean;
  /**
   * Calculate fn
   * @default noop
   */
  fn(...args: unknown[]): unknown;
};

const noop = () => {};

const defaultOptions: NodeOptions = {
  isObserved: true,
  fn: noop,
};

/**
 * Utility for building declarative, as opposed to constructive, graphs
 */
export function graphBuilder(): GraphBuilder {
  const graph = new Graph();

  function ensureNode(id: string): DataNode<unknown> {
    return graph.getNode(id) ?? graph.addNode(id, [], noop);
  }

  const graphBuilder: GraphBuilder = {
    graph,
    addNode(id: string, deps: string[], partialOptions = {}) {
      const options: NodeOptions = defaults(partialOptions, defaultOptions);

      const depNodes = deps.map(ensureNode);

      let node = graph.getNode(id);
      if (node) {
        node.replace<unknown[]>(depNodes, options.fn);
      } else {
        node = graph.addNode<DataNode[], void>(id, depNodes, options.fn);
      }

      if (options.isObserved) node.addObserver(noop);

      return graphBuilder;
    },
  };

  return graphBuilder;
}
