import fromPairs from 'lodash/fromPairs';
import DataNode from '../DataNode/DataNode';
import { NodeStatus } from '../DataNode/NodeTypes';
import Graph from './Graph';

const noop = () => {};

function getNodeStatuses(g: Graph): Record<string, NodeStatus> {
  return fromPairs(Array.from(g).map((node): [string, NodeStatus] => [node.id, node.state.status]));
}

type GraphBuilder = {
  addNode(id: string, deps: string[], isObserved?: boolean): GraphBuilder;
  graph: Graph;
};

/**
 * Utility for building declarative, as opposed to constructive, graphs
 * @returns
 */
function graphBuilder(): GraphBuilder {
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
        node.replace(depNodes, noop);
      } else {
        node = graph.addNode<DataNode[], void>(id, depNodes, noop);
      }

      if (isObserved) node.addObserver(noop);

      return graphBuilder;
    },
  };

  return graphBuilder;
}

describe('cycle detection', () => {
  it('Detects self-reference', () => {
    const { graph } = graphBuilder().addNode('a', ['a']).addNode('b', []);

    graph.analyze();

    expect(getNodeStatuses(graph)).toEqual({
      a: NodeStatus.CicularDependencyError,
      b: NodeStatus.Unevaluated,
    });
  });

  it('Detects no cycle in acyclic graph', () => {
    const { graph } = graphBuilder()
      .addNode('a', [])
      .addNode('b', [])
      .addNode('c', ['a', 'b'])
      .addNode('d', ['b'])
      .addNode('e', ['a', 'd']);

    graph.analyze();

    expect(getNodeStatuses(graph)).toEqual({
      a: NodeStatus.Unevaluated,
      b: NodeStatus.Unevaluated,
      c: NodeStatus.Unevaluated,
      d: NodeStatus.Unevaluated,
      e: NodeStatus.Unevaluated,
    });
  });

  it('Detects 3-node cycle', () => {
    const { graph } = graphBuilder()
      .addNode('a', ['b', 'd'])
      .addNode('b', ['c'])
      .addNode('c', ['a'])
      .addNode('d', ['e'])
      .addNode('e', []);

    graph.analyze();

    expect(getNodeStatuses(graph)).toEqual({
      a: NodeStatus.CicularDependencyError,
      b: NodeStatus.CicularDependencyError,
      c: NodeStatus.CicularDependencyError,
      d: NodeStatus.Unevaluated,
      e: NodeStatus.Unevaluated,
    });
  });

  it('Detects figure-eight cycle', () => {
    const { graph } = graphBuilder()
      .addNode('a', ['b', 'd'])
      .addNode('b', ['c'])
      .addNode('c', ['a'])
      .addNode('d', ['e'])
      .addNode('e', ['a']);

    graph.analyze();

    expect(getNodeStatuses(graph)).toEqual({
      a: NodeStatus.CicularDependencyError,
      b: NodeStatus.CicularDependencyError,
      c: NodeStatus.CicularDependencyError,
      d: NodeStatus.CicularDependencyError,
      e: NodeStatus.CicularDependencyError,
    });
  });
});
