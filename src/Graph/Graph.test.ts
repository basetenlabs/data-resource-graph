import assert from 'assert';
import fromPairs from 'lodash/fromPairs';
import mapValues from 'lodash/mapValues';
import DataNode from '../DataNode/DataNode';
import { NodeState, NodeStatus } from '../DataNode/NodeTypes';
import TestGraphs from '../Test/testGraphs';
import '../Test/testTypes';
import { noopObserver } from '../Test/testUtils';
import { assertDefined } from '../utils';
import Graph from './Graph';

function getNodeStates(g: Graph): Record<string, NodeState<unknown>> {
  return fromPairs(
    Array.from(g).map((node): [string, NodeState<unknown>] => [node.id, node.state]),
  );
}

function expectNodeStates(graph: Graph, expectedNodeStates: Record<string, NodeState<unknown>>) {
  expect(getNodeStates(graph)).toEqual(expectedNodeStates);
}

describe('evaluation', () => {
  let calculateSpies: Record<string, jest.SpyInstance> | undefined;

  beforeEach(() => {
    calculateSpies = undefined;
  });

  // Allows us to see how many times each evaluate function was called
  function spyOnCalculates(g: Graph): void {
    calculateSpies = {};
    for (const node of g) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      calculateSpies[node.id] = jest.spyOn(node as any, 'calculateFunction');
    }
  }

  function expectToHaveRecalculated(recalculatedIds: string[]) {
    assert(!!calculateSpies);
    expect(mapValues(calculateSpies, (spy: jest.SpyInstance) => spy.mock.calls.length)).toEqual(
      mapValues(calculateSpies, (_value, id) => (recalculatedIds.includes(id) ? 1 : 0)),
    );
  }

  function observeAll(graph: Graph) {
    graph.act(() => {
      for (const node of graph) {
        node.addObserver(noopObserver);
      }
    });
  }

  it('does first evaluation', () => {
    // Arrange
    const graph = TestGraphs.make3By3NuralNet();

    // Act
    observeAll(graph);

    // assert
    expectNodeStates(graph, {
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.3) },
      b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.2) },
      c: { status: NodeStatus.Resolved, value: expect.closeTo2(0.1) },
      d: { status: NodeStatus.Resolved, value: expect.closeTo2(0.26) },
      e: { status: NodeStatus.Resolved, value: expect.closeTo2(0.16) },
      f: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.05) },
      g: { status: NodeStatus.Resolved, value: expect.closeTo2(0.17) },
      h: { status: NodeStatus.Resolved, value: expect.closeTo2(0.105) },
      i: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.035) },
    });
  });

  it("first layer node's replacement causes downstream re-render", () => {
    // Arrange
    const graph = TestGraphs.make3By3NuralNet();
    observeAll(graph);

    // Act

    graph.act(() => {
      // Replace value of c
      graph.getNode('c')?.replace([], () => 0.3);
      spyOnCalculates(graph);
    });

    // Assert
    expectToHaveRecalculated(['c', 'e', 'f', 'g', 'h', 'i']);

    expectNodeStates(graph, {
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.3) },
      b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.2) },
      c: { status: NodeStatus.Resolved, value: expect.closeTo2(0.3) },
      d: { status: NodeStatus.Resolved, value: expect.closeTo2(0.26) },
      e: { status: NodeStatus.Resolved, value: expect.closeTo2(0.2) },
      f: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.03) },
      g: { status: NodeStatus.Resolved, value: expect.closeTo2(0.206) },
      h: { status: NodeStatus.Resolved, value: expect.closeTo2(0.115) },
      i: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.021) },
    });
  });

  it('replacement of two nodes in different layers causes downstream re-render', () => {
    // Arrange
    const graph = TestGraphs.make3By3NuralNet();
    observeAll(graph);

    // Act

    graph.act(() => {
      // Replace value of c
      graph.getNode('a')?.replace([], () => -0.4);
      graph
        .getNode('f')
        ?.replace(
          [
            assertDefined(graph.getNode('b') as DataNode<number>),
            assertDefined(graph.getNode('c') as DataNode<number>),
          ],
          (b: number, c: number) => 0.3 * b + 0.1 * c,
        );
      spyOnCalculates(graph);
    });

    // Assert
    expectToHaveRecalculated(['a', 'd', 'e', 'f', 'g', 'h', 'i']);

    expectNodeStates(graph, {
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.4) },
      b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.2) },
      c: { status: NodeStatus.Resolved, value: expect.closeTo2(0.1) },
      d: { status: NodeStatus.Resolved, value: expect.closeTo2(0.34) },
      e: { status: NodeStatus.Resolved, value: expect.closeTo2(0.24) },
      f: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.05) },
      g: { status: NodeStatus.Resolved, value: expect.closeTo2(0.25) },
      h: { status: NodeStatus.Resolved, value: expect.closeTo2(0.145) },
      i: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.035) },
    });
  });

  it('replacement of nodes in first and last layers causes downstream re-render', () => {
    // Arrange
    const graph = TestGraphs.make3By3NuralNet();
    observeAll(graph);

    // Act

    graph.act(() => {
      // Replace value of c
      graph.getNode('a')?.replace([], () => -0.4);
      graph.getNode('i')?.invalidate();
      spyOnCalculates(graph);
    });

    // Assert
    expectToHaveRecalculated(['a', 'd', 'e', 'g', 'h', 'i']);

    expectNodeStates(graph, {
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.4) },
      b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.2) },
      c: { status: NodeStatus.Resolved, value: expect.closeTo2(0.1) },
      d: { status: NodeStatus.Resolved, value: expect.closeTo2(0.34) },
      e: { status: NodeStatus.Resolved, value: expect.closeTo2(0.24) },
      f: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.05) },
      g: { status: NodeStatus.Resolved, value: expect.closeTo2(0.25) },
      h: { status: NodeStatus.Resolved, value: expect.closeTo2(0.145) },
      i: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.035) },
    });
  });

  it("when invalidated node returns same result, dependents aren't reevaluated ", () => {
    // Arrange
    const graph = TestGraphs.make3By3NuralNet();
    observeAll(graph);

    // Act

    graph.act(() => {
      // 'c' gets reevaluated but returns same result, so dependents aren't reevaluated
      graph.getNode('c')?.invalidate();

      // Re-evaluate
      spyOnCalculates(graph);
    });

    // Assert
    expect(mapValues(calculateSpies, (spy: jest.SpyInstance) => spy.mock.calls.length)).toEqual({
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
    // Arrange
    const graph = TestGraphs.make3By3NuralNet();
    observeAll(graph);

    // Act
    graph.act(() => {
      // Replace value of c
      graph.getNode('c')?.replace([], () => {
        throw new Error();
      });
    });

    // Assert
    expectNodeStates(graph, {
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.3) },
      b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.2) },
      c: { status: NodeStatus.OwnError },
      d: { status: NodeStatus.Resolved, value: expect.closeTo2(0.26) },
      e: { status: NodeStatus.DependencyError },
      f: { status: NodeStatus.DependencyError },
      g: { status: NodeStatus.DependencyError },
      h: { status: NodeStatus.DependencyError },
      i: { status: NodeStatus.DependencyError },
    });
  });

  it('Evaluates for medium acyclic', () => {
    // Arrange
    const graph = TestGraphs.makeMediumAcylic();

    // Act
    observeAll(graph);

    // Assert
    expectNodeStates(graph, {
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.4) },
      b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.5) },
      c: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.16) },
      d: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.1) },
      e: { status: NodeStatus.Resolved, value: expect.closeTo2(0.01) },
    });
  });

  it('Evaluates non-cycle node in graph with cycle', () => {
    // Arrange
    const graph = TestGraphs.makeSmallSelfCycle();

    // Act
    observeAll(graph);

    // Assert
    expectNodeStates(graph, {
      a: { status: NodeStatus.CicularDependencyError },
      b: { status: NodeStatus.Resolved, value: 1 },
    });
  });

  it('Evaluates successfully after breaking a self-cycle', () => {
    // Arrange
    const graph = TestGraphs.makeSmallSelfCycle();
    observeAll(graph);

    // Act

    graph.act(() => {
      graph.getNode('a')?.replace([], () => 2);
      spyOnCalculates(graph);
    });

    // Assert
    expectNodeStates(graph, {
      a: { status: NodeStatus.Resolved, value: 2 },
      b: { status: NodeStatus.Resolved, value: 1 },
    });

    expectToHaveRecalculated(['a']);
  });

  it('Evaluates non-cycle nodes of medium 3-node cycle', () => {
    // Arrange
    const graph = TestGraphs.makeMedium3NodeCycle();

    // Act
    observeAll(graph);

    // Assert
    expectNodeStates(graph, {
      a: { status: NodeStatus.CicularDependencyError },
      b: { status: NodeStatus.CicularDependencyError },
      c: { status: NodeStatus.CicularDependencyError },
      d: { status: NodeStatus.Resolved, value: 5 },
      e: { status: NodeStatus.Resolved, value: 1 },
    });
  });

  it('Evaluates after breaking a 3-node cycle', () => {
    // Arrange
    const graph = TestGraphs.makeMedium3NodeCycle();

    // Act
    observeAll(graph);

    // Assert

    graph.act(() => {
      graph.getNode('a')?.replace([], () => 2);
      spyOnCalculates(graph);
    });

    expectNodeStates(graph, {
      a: { status: NodeStatus.Resolved, value: 2 },
      b: { status: NodeStatus.Resolved, value: 1 },
      c: { status: NodeStatus.Resolved, value: 3 },
      d: { status: NodeStatus.Resolved, value: 5 },
      e: { status: NodeStatus.Resolved, value: 1 },
    });

    expectToHaveRecalculated(['a', 'b', 'c']);
  });

  it('Nodes are unevaluated if unobserved', () => {
    // Arrange
    const graph = TestGraphs.makeSmallAcyclic();

    // Assert
    expectNodeStates(graph, {
      a: { status: NodeStatus.Unevaluated },
      b: { status: NodeStatus.Unevaluated },
      c: { status: NodeStatus.Unevaluated },
    });
  });

  it('Detects figure-eight cycle', () => {
    // Arrange
    const graph = TestGraphs.makeMediumFigureEightCycle();

    // Act
    observeAll(graph);

    expectNodeStates(graph, {
      a: { status: NodeStatus.CicularDependencyError },
      b: { status: NodeStatus.CicularDependencyError },
      c: { status: NodeStatus.CicularDependencyError },
      d: { status: NodeStatus.CicularDependencyError },
      e: { status: NodeStatus.CicularDependencyError },
    });
  });

  // TODO: add test for nested act()s
});
