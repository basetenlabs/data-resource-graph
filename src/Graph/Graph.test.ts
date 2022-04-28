import fromPairs from 'lodash/fromPairs';
import mapValues from 'lodash/mapValues';
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

  it('correctly computes for 3x3 neural net, first and second layer invalidated', () => {
    const graph = TestGraphs.make3By3NuralNet();
    graph.evaluate();

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

  it('Correctly computes for small graph with cycle', () => {
    const graph = TestGraphs.makeSmallSelfCycle();

    const reevalGraph = graph.makeReevaluationGraph();

    const expectedReevalGraph: ReevaluationGraphStateById = {
      ready: new Set(['b']),
      waiting: new Map<string, number>(),
    };

    expect(convertNodesToIds(reevalGraph)).toEqual(expectedReevalGraph);
  });

  it('Correctly computes for small graph with cycle after breaking cycle', () => {
    const graph = TestGraphs.makeSmallSelfCycle();
    graph.evaluate();

    graph.getNode('a')?.replace([], () => 2);
    const reevalGraph = graph.makeReevaluationGraph();

    const expectedReevalGraph: ReevaluationGraphStateById = {
      ready: new Set(['a']),
      waiting: new Map<string, number>(),
    };

    expect(convertNodesToIds(reevalGraph)).toEqual(expectedReevalGraph);
  });

  it('Correctly computes for 3-node cycle graph after breaking cycle', () => {
    const graph = TestGraphs.makeMedium3NodeCycle();
    // TODO: break up?
    const expectedOrigReevalGraph: ReevaluationGraphStateById = {
      ready: new Set(['e']),
      waiting: new Map<string, number>([['d', 1]]),
    };

    expect(convertNodesToIds(graph.makeReevaluationGraph())).toEqual(expectedOrigReevalGraph);

    graph.evaluate();

    graph.getNode('a')?.replace([], () => 2);

    const expectedReevalGraph: ReevaluationGraphStateById = {
      ready: new Set(['a']),
      waiting: new Map<string, number>([
        ['b', 1],
        ['c', 1],
      ]),
    };

    expect(convertNodesToIds(graph.makeReevaluationGraph())).toEqual(expectedReevalGraph);
  });
});

describe('evaluation', () => {
  function spyOnCalculates(g: Graph): Record<string, jest.SpyInstance> {
    const spies: Record<string, jest.SpyInstance> = {};
    for (const node of g) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spies[node.id] = jest.spyOn(node as any, 'calculateFunction');
    }
    return spies;
  }

  it('does first evaluation', () => {
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
  });

  it("first layer node's replacement causes downstream re-render", () => {
    const graph = TestGraphs.make3By3NuralNet();
    graph.evaluate();

    // Replace value of c
    graph.getNode('c')?.replace([], () => 0.3);

    const spies = spyOnCalculates(graph);

    // 'c' gets reevaluated, returns different result, downstream nodes re-evaluated
    graph.evaluate();

    expect(mapValues(spies, (spy: jest.SpyInstance) => spy.mock.calls.length)).toEqual({
      a: 0,
      b: 0,
      c: 1,
      d: 0,
      e: 1,
      f: 1,
      g: 1,
      h: 1,
      i: 1,
    });

    const expectedNodeStates: Record<string, NodeState<number>> = {
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.3) },
      b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.2) },
      c: { status: NodeStatus.Resolved, value: expect.closeTo2(0.3) },
      d: { status: NodeStatus.Resolved, value: expect.closeTo2(0.26) },
      e: { status: NodeStatus.Resolved, value: expect.closeTo2(0.2) },
      f: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.03) },
      g: { status: NodeStatus.Resolved, value: expect.closeTo2(0.206) },
      h: { status: NodeStatus.Resolved, value: expect.closeTo2(0.115) },
      i: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.021) },
    };

    expect(getNodeStates(graph)).toEqual(expectedNodeStates);
  });

  it("when invalidated node returns same result, dependents aren't reevaluated ", () => {
    const graph = TestGraphs.make3By3NuralNet();

    graph.evaluate();

    // Only b and c start unevaluated
    graph.getNode('c')?.invalidate();

    // Re-evaluate
    const spies = spyOnCalculates(graph);

    // 'c' gets reevaluated but returns same result, so dependents aren't reevaluated
    graph.evaluate();

    expect(mapValues(spies, (spy: jest.SpyInstance) => spy.mock.calls.length)).toEqual({
      a: 0,
      b: 0,
      c: 1,
      d: 0,
      e: 0,
      f: 0,
      g: 0,
      h: 0,
      i: 0,
    });
  });

  it('propagates evaluation errors', () => {
    const graph = TestGraphs.make3By3NuralNet();
    graph.evaluate();

    // Replace value of c
    graph.getNode('c')?.replace([], () => {
      throw new Error();
    });

    // 'c' gets reevaluated, returns different result, downstream nodes re-evaluated
    graph.evaluate();

    const expectedNodeStates: Record<string, NodeState<number>> = {
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.3) },
      b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.2) },
      c: { status: NodeStatus.OwnError },
      d: { status: NodeStatus.Resolved, value: expect.closeTo2(0.26) },
      e: { status: NodeStatus.DependencyError },
      f: { status: NodeStatus.DependencyError },
      g: { status: NodeStatus.DependencyError },
      h: { status: NodeStatus.DependencyError },
      i: { status: NodeStatus.DependencyError },
    };

    expect(getNodeStates(graph)).toEqual(expectedNodeStates);
  });

  it('Evaluates non-cycle node in graph with cycle', () => {
    const graph = TestGraphs.makeSmallSelfCycle();
    graph.evaluate();

    const expectedNodeStates: Record<string, NodeState<number>> = {
      a: { status: NodeStatus.CicularDependencyError },
      b: { status: NodeStatus.Resolved, value: 1 },
    };

    expect(getNodeStates(graph)).toEqual(expectedNodeStates);
  });

  it('Evaluates successfully after breaking a self-cycle', () => {
    const graph = TestGraphs.makeSmallSelfCycle();
    graph.evaluate();

    graph.getNode('a')?.replace([], () => 2);
    graph.evaluate();

    const expectedNodeStates: Record<string, NodeState<number>> = {
      a: { status: NodeStatus.Resolved, value: 2 },
      b: { status: NodeStatus.Resolved, value: 1 },
    };

    expect(getNodeStates(graph)).toEqual(expectedNodeStates);
  });

  it('Evaluates non-cycle nodes of medium 3-node cycle', () => {
    const graph = TestGraphs.makeMedium3NodeCycle();
    graph.evaluate();

    const expectedNodeStates: Record<string, NodeState<number>> = {
      a: { status: NodeStatus.CicularDependencyError },
      b: { status: NodeStatus.CicularDependencyError },
      c: { status: NodeStatus.CicularDependencyError },
      d: { status: NodeStatus.Resolved, value: 5 },
      e: { status: NodeStatus.Resolved, value: 1 },
    };

    expect(getNodeStates(graph)).toEqual(expectedNodeStates);
  });

  it('Evaluates after breaking a 3-node cycle', () => {
    const graph = TestGraphs.makeMedium3NodeCycle();
    graph.evaluate();

    graph.getNode('a')?.replace([], () => 2);
    graph.evaluate();

    const expectedNodeStates: Record<string, NodeState<number>> = {
      a: { status: NodeStatus.Resolved, value: 2 },
      b: { status: NodeStatus.Resolved, value: 1 },
      c: { status: NodeStatus.Resolved, value: 3 },
      d: { status: NodeStatus.Resolved, value: 5 },
      e: { status: NodeStatus.Resolved, value: 1 },
    };

    expect(getNodeStates(graph)).toEqual(expectedNodeStates);
  });
});
