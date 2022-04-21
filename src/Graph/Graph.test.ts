import fromPairs from 'lodash/fromPairs';
import { NodeStatus } from '../DataNode/NodeTypes';
import TestGraphs from '../Test/testGraphs';
import Graph from './Graph';
import { ReevaluationGraphState } from './types';

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

describe('makeReevaluationGraph', () => {
  type ReevaluationGraphStateById = {
    ready: Set<string>;
    waiting: Map<string, number>;
  };
  function convertNodesToIds(state: ReevaluationGraphState): ReevaluationGraphStateById {
    return {
      ready: new Set(Array.from(state.ready).map((node) => node.id)),
      waiting: new Map(
        Array.from(state.waiting.entries()).map<[string, number]>(([node, count]) => [
          node.id,
          count,
        ]),
      ),
    };
  }

  it('correctly computes for medium DAG', () => {
    const graph = TestGraphs.makeMediumDAG();
    // Only b and c start unevaluated
    for (const resolvedNodeId of ['a', 'b', 'e', 'f', 'g']) {
      // TODO: figure out less hacky way
      graph.getNode(resolvedNodeId).state = { status: NodeStatus.Resolved };
    }
    const reevalGraph = graph.makeReevaluationGraph();
    const expectedReevalGraph: ReevaluationGraphStateById = {
      ready: new Set(['c']),
      waiting: new Map<string, number>([
        ['b', 1],
        ['d', 1],
        ['e', 2],
      ]),
    };
    expect(convertNodesToIds(reevalGraph)).toEqual(expectedReevalGraph);
  });
});
