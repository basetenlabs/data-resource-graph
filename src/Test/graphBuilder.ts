import DataNode from '../DataNode/DataNode';
import Graph from '../Graph/Graph';

export type GraphBuilder = {
  addNode(id: string, deps: string[], isObserved?: boolean): GraphBuilder;
  graph: Graph;
};

const noop = () => {};

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
    addNode(id: string, deps: string[], isObserved = true) {
      const depNodes = deps.map(ensureNode);

      let node = graph.getNode(id);
      if (node) {
        node.replace<unknown[]>(depNodes, noop);
      } else {
        node = graph.addNode<DataNode[], void>(id, depNodes, noop);
      }

      if (isObserved) node.addObserver(noop);

      return graphBuilder;
    },
  };

  return graphBuilder;
}
