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
      graph.getNode(resolvedNodeId).state = { status: NodeStatus.Resolved, value: null };
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

  it('correctly computes for 3x3 Net', () => {
    const graph = TestGraphs.make3By3Net();
    // a and f start unevaluated
    for (const resolvedNodeId of ['b', 'c', 'd', 'e', 'g', 'h', 'i']) {
      // TODO: figure out less hacky way
      graph.getNode(resolvedNodeId).state = { status: NodeStatus.Resolved, value: null };
    }
    const reevalGraph = graph.makeReevaluationGraph();
    const expectedReevalGraph: ReevaluationGraphStateById = {
      ready: new Set(['a', 'f']),
      waiting: new Map<string, number>([
        ['d', 1],
        ['e', 1],
        ['g', 2],
        ['h', 3],
        ['i', 2],
      ]),
    };
    expect(convertNodesToIds(reevalGraph)).toEqual(expectedReevalGraph);
  });

  it('correctly computes for 3x3 Net 2', () => {
    const graph = TestGraphs.make3By3Net();
    // c and g start unevaluated
    for (const resolvedNodeId of ['a', 'b', 'd', 'e', 'f', 'h', 'i']) {
      // TODO: figure out less hacky way
      graph.getNode(resolvedNodeId).state = { status: NodeStatus.Resolved, value: null };
    }
    const reevalGraph = graph.makeReevaluationGraph();
    const expectedReevalGraph: ReevaluationGraphStateById = {
      ready: new Set(['c']),
      waiting: new Map<string, number>([
        ['e', 1],
        ['f', 1],
        ['g', 1],
        ['h', 2],
        ['i', 2],
      ]),
    };
    expect(convertNodesToIds(reevalGraph)).toEqual(expectedReevalGraph);
  });

  describe('evaluation', () => {});
});
