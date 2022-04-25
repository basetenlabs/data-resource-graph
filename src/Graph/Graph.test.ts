import fromPairs from 'lodash/fromPairs';
import { NodeState, NodeStatus } from '../DataNode/NodeTypes';
import TestGraphs from '../Test/testGraphs';
import '../Test/testTypes';
import Graph from './Graph';
import { ReevaluationGraphState } from './types';

function getNodeStatuses(g: Graph): Record<string, NodeStatus> {
  return fromPairs(Array.from(g).map((node): [string, NodeStatus] => [node.id, node.state.status]));
}

function getNodeStates(g: Graph): Record<string, NodeState<unknown>> {
  return fromPairs(
    Array.from(g).map((node): [string, NodeState<unknown>] => [node.id, node.state]),
  );
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
    graph.evaluate();
    // Only b and c start unevaluated
    graph.getNode('b')?.invalidate();
    graph.getNode('c')?.invalidate();

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

  it('correctly computes for 3x3 neural net', () => {
    const graph = TestGraphs.make3By3NuralNet();
    graph.evaluate();
    // Only b and c start unevaluated
    graph.getNode('a')?.invalidate();
    graph.getNode('f')?.invalidate();

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

  it('correctly computes for 3x3 neural net 2', () => {
    const graph = TestGraphs.make3By3NuralNet();
    graph.evaluate();
  });

  describe('evaluation', () => {
    it('evaluates 3x3 neural net', () => {
      const graph = TestGraphs.make3By3NuralNet();

      graph.evaluate();

      const expectedNodeStates: Record<string, NodeState<number>> = {
        a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.3) },
        b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.2) },
        c: { status: NodeStatus.Resolved, value: expect.closeTo2(0.1) },
        d: { status: NodeStatus.Resolved, value: expect.closeTo2(0.26) },
        e: { status: NodeStatus.Resolved, value: expect.closeTo2(0.16) },
        f: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.05) },
        g: { status: NodeStatus.Resolved, value: expect.closeTo2(0.17) },
        h: { status: NodeStatus.Resolved, value: expect.closeTo2(0.105) },
        i: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.035) },
      };

      expect(getNodeStates(graph)).toEqual(expectedNodeStates);

      // Only b and c start unevaluated
      graph.getNode('c')?.invalidate();
      graph.getNode('g')?.invalidate();

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
  });
});
