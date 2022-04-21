import fromPairs from 'lodash/fromPairs';
import { NodeStatus } from '../DataNode/NodeTypes';
import TestGraphs from '../Test/testGraphs';
import Graph from './Graph';

function getNodeStatuses(g: Graph): Record<string, NodeStatus> {
  return fromPairs(Array.from(g).map((node): [string, NodeStatus] => [node.id, node.state.status]));
}

describe('cycle detection', () => {
  it('Detects self-reference', () => {
    const graph = TestGraphs.makeSmallSelfCycle();

    graph.makeReevaluationGraph();

    expect(getNodeStatuses(graph)).toEqual({
      a: NodeStatus.CicularDependencyError,
      b: NodeStatus.Unevaluated,
    });
  });

  it('Detects no cycle in acyclic graph', () => {
    const graph = TestGraphs.makeMediumAcylic();

    graph.makeReevaluationGraph();

    expect(getNodeStatuses(graph)).toEqual({
      a: NodeStatus.Unevaluated,
      b: NodeStatus.Unevaluated,
      c: NodeStatus.Unevaluated,
      d: NodeStatus.Unevaluated,
      e: NodeStatus.Unevaluated,
    });
  });

  it('Detects 3-node cycle', () => {
    const graph = TestGraphs.makeMedium3NodeCycle();

    graph.makeReevaluationGraph();

    expect(getNodeStatuses(graph)).toEqual({
      a: NodeStatus.CicularDependencyError,
      b: NodeStatus.CicularDependencyError,
      c: NodeStatus.CicularDependencyError,
      d: NodeStatus.Unevaluated,
      e: NodeStatus.Unevaluated,
    });
  });

  it('Detects figure-eight cycle', () => {
    const graph = TestGraphs.makeMediumFigureEightCycle();

    graph.makeReevaluationGraph();

    expect(getNodeStatuses(graph)).toEqual({
      a: NodeStatus.CicularDependencyError,
      b: NodeStatus.CicularDependencyError,
      c: NodeStatus.CicularDependencyError,
      d: NodeStatus.CicularDependencyError,
      e: NodeStatus.CicularDependencyError,
    });
  });
});
