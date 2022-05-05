import assert from 'assert';
import mapValues from 'lodash/mapValues';
import DataNode from '../DataNode/DataNode';
import { NodeState, NodeStatus } from '../DataNode/NodeTypes';
import { graphBuilder } from '../Test/graphBuilder';
import { GraphTracker } from '../Test/GraphTracker';
import TestGraphs from '../Test/testGraphs';
import '../Test/testTypes';
import { getNodeStates, noopObserver } from '../Test/testUtils';
import { Deferred } from '../utils/Deferred';
import { assertDefined } from '../utils/utils';
import Graph from './Graph';
import { AsyncTransactionCompletion, TransactionResult } from './types';

function expectNodeStates(graph: Graph, expectedNodeStates: Record<string, NodeState<unknown>>) {
  expect(getNodeStates(graph)).toEqual(expectedNodeStates);
}

function observeAll(graph: Graph) {
  return graph.act(() => {
    for (const node of graph) {
      node.addObserver(noopObserver);
    }
  });
}

let calculateSpies: Record<string, jest.SpyInstance> | undefined;

const syncTransactionResult: TransactionResult = { sync: true };

beforeEach(() => {
  calculateSpies = undefined;
});

// Allows us to see how many times each evaluate function was called
function spyOnCalculates(g: Graph): void {
  calculateSpies = {};
  for (const node of g) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calculateFunction = (node as any).calculateFunction;
    calculateSpies[node.id] = jest.spyOn(calculateFunction, 'fn');
  }
}

function expectToHaveRecalculated(recalculatedIds: string[]) {
  assert(!!calculateSpies);
  expect(mapValues(calculateSpies, (spy: jest.SpyInstance) => spy.mock.calls.length)).toEqual(
    mapValues(calculateSpies, (_value, id) => (recalculatedIds.includes(id) ? 1 : 0)),
  );
  for (const spy of Object.values(calculateSpies)) {
    spy.mockClear();
  }
}

describe('evaluation', () => {
  it('does first evaluation', () => {
    // Arrange
    const graph = TestGraphs.make3By3NuralNet();

    // Act
    const transactionResult = observeAll(graph);

    // assert

    expect(transactionResult).toEqual(syncTransactionResult);
    expectNodeStates(graph, {
      // TODO: use integers
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

  it("first layer node's replacement causes downstream recalculation", () => {
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

  it('replacement of two nodes in different layers causes downstream recalculation', () => {
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

  it('replacement of nodes in first and last layers causes downstream recalculation', () => {
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
    expectToHaveRecalculated(['c']);
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

  it('evaluates for medium acyclic', () => {
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

  describe('cyclical graphs', () => {
    it('evaluates non-cycle node in graph with cycle', () => {
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

    it('evaluates successfully after breaking a self-cycle', () => {
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

    it('evaluates non-cycle nodes of medium 3-node cycle', () => {
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

    it('evaluates after breaking a 3-node cycle', () => {
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

    it('detects figure-eight cycle', () => {
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
  });

  describe('partial evaluation', () => {
    it('nodes are unevaluated if unobserved', () => {
      // Arrange
      const graph = TestGraphs.makeSmallAcyclic();

      // Assert
      expectNodeStates(graph, {
        a: { status: NodeStatus.Unevaluated },
        b: { status: NodeStatus.Unevaluated },
        c: { status: NodeStatus.Unevaluated },
      });
    });

    it('only observed subgraph evaluated', () => {
      // Arrange
      const graph = TestGraphs.make3By3NuralNet();

      // Act
      graph.act(() => graph.getNode('g')?.addObserver(noopObserver));

      // assert
      expectNodeStates(graph, {
        a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.3) },
        b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.2) },
        c: { status: NodeStatus.Resolved, value: expect.closeTo2(0.1) },
        d: { status: NodeStatus.Resolved, value: expect.closeTo2(0.26) },
        e: { status: NodeStatus.Resolved, value: expect.closeTo2(0.16) },
        f: { status: NodeStatus.Unevaluated },
        g: { status: NodeStatus.Resolved, value: expect.closeTo2(0.17) },
        h: { status: NodeStatus.Unevaluated },
        i: { status: NodeStatus.Unevaluated },
      });
    });

    it('only observed subgraph evaluated after observers removed', () => {
      // Arrange
      const graph = TestGraphs.make3By3NuralNet();

      // Act
      graph.act(() => {
        graph.getNode('g')?.addObserver(noopObserver);
        graph.getNode('i')?.addObserver(noopObserver);
      });

      graph.act(() => {
        // I becomes unobserved
        graph.getNode('i')?.removeObserver(noopObserver);
        // Update first layer
        graph.getNode('a')?.replace([], () => 0.3);
        graph.getNode('b')?.replace([], () => 0.2);
        graph.getNode('c')?.replace([], () => -0.1);
        spyOnCalculates(graph);
      });

      // assert

      // Only nodes that feed into G are recalculated
      expectToHaveRecalculated(['a', 'b', 'c', 'd', 'e', 'g']);

      expectNodeStates(graph, {
        a: { status: NodeStatus.Resolved, value: expect.closeTo2(0.3) },
        b: { status: NodeStatus.Resolved, value: expect.closeTo2(0.2) },
        c: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.1) },
        d: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.26) },
        e: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.16) },
        f: expect.anything(),
        g: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.17) },
        h: expect.anything(),
        i: expect.anything(),
      });
    });
  });

  describe('async', () => {
    function getCompletion(
      result: TransactionResult | undefined,
    ): Promise<AsyncTransactionCompletion> {
      assert(result?.sync === false);

      return result.completion;
    }

    async function tick() {
      // Takes two promise resolutions to complete continuation code within evaluation
      await Promise.resolve();
      await Promise.resolve();
    }

    it('single async node', async () => {
      const deferredResultB = new Deferred<number>();
      const graph = graphBuilder(0).act((builder) =>
        builder
          .addNode('a', [], () => 1)
          .addNodeAsync('b', ['a'], (_a) => deferredResultB.promise)
          .addNode('c', ['b'], (b) => 4 * b - 5),
      ).graph;

      const graphTracker = new GraphTracker(graph);

      // Observe all nodes
      const completionPromise = getCompletion(graphTracker.observeAll());

      // A evaluted immediately
      graphTracker.expectObservationBatch([['a', { status: NodeStatus.Resolved, value: 1 }]]);

      // Resolve B, which resolves C
      deferredResultB.resolve(3);

      await tick();

      // Their observers
      graphTracker.expectObservationBatch([
        ['b', { status: NodeStatus.Resolved, value: 3 }],
        ['c', { status: NodeStatus.Resolved, value: 7 }],
      ]);

      await expect(completionPromise).resolves.toEqual({ wasCancelled: false });
    });

    it('chained async', async () => {
      const deferredResultA = new Deferred<number>();
      const deferredResultB = new Deferred<number>();
      const graph = graphBuilder(0).act((builder) =>
        builder
          .addNodeAsync('a', [], () => deferredResultA.promise)
          .addNodeAsync('b', ['a'], (_a) => deferredResultB.promise)
          .addNode('c', ['b'], (b) => 4 * b - 5),
      ).graph;

      const graphTracker = new GraphTracker(graph);

      // Observe all nodes
      const completionPromise = getCompletion(graphTracker.observeAll());

      // Resolve A
      deferredResultA.resolve(1);

      await tick();

      graphTracker.expectObservationBatch([['a', { status: NodeStatus.Resolved, value: 1 }]]);

      // Resolve B
      deferredResultB.resolve(3);

      await tick();

      graphTracker.expectObservationBatch([
        ['b', { status: NodeStatus.Resolved, value: 3 }],
        ['c', { status: NodeStatus.Resolved, value: 7 }],
      ]);

      await expect(completionPromise).resolves.toEqual({ wasCancelled: false });
    });

    it('parallel async', async () => {
      const deferredResultA = new Deferred<number>();
      const deferredResultB = new Deferred<number>();

      const graph = graphBuilder(0).act((builder) =>
        builder
          .addNodeAsync('a', [], () => deferredResultA.promise)
          .addNodeAsync('b', [], () => deferredResultB.promise)
          .addNode('c', ['a', 'b'], (a, b) => a + b),
      ).graph;

      const graphTracker = new GraphTracker(graph);
      spyOnCalculates(graph);

      // Observe all nodes
      const completionPromise = getCompletion(graphTracker.observeAll());

      // a and b invoked immediately in parallel, but not resolved
      expectToHaveRecalculated(['a', 'b']);

      // Resolve A
      deferredResultA.resolve(1);

      await tick();

      graphTracker.expectObservationBatch([['a', { status: NodeStatus.Resolved, value: 1 }]]);

      // Resolve B
      deferredResultB.resolve(3);

      await tick();

      // B notified and c notified too synchronously
      graphTracker.expectObservationBatch([
        ['b', { status: NodeStatus.Resolved, value: 3 }],
        ['c', { status: NodeStatus.Resolved, value: 4 }],
      ]);

      await expect(completionPromise).resolves.toEqual({ wasCancelled: false });
    });
  });
});

describe('delete nodes', () => {
  it('deletes middle node', () => {
    // Arrange
    const graph = TestGraphs.makeMediumAcylic();
    observeAll(graph);

    // Act
    graph.act(() => {
      graph.getNode('d')?.delete();
    });

    // Assert
    expectNodeStates(graph, {
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.4) },
      b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.5) },
      c: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.16) },
      e: { status: NodeStatus.DependencyError },
    });
  });

  it('deletes leaf node', () => {
    // Arrange
    const graph = TestGraphs.makeMediumAcylic();
    observeAll(graph);

    // Act
    graph.act(() => {
      graph.getNode('c')?.delete();
    });

    // Assert
    expectNodeStates(graph, {
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.4) },
      b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.5) },
      d: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.1) },
      e: { status: NodeStatus.Resolved, value: expect.closeTo2(0.01) },
    });
  });

  it('recovers after node with missing dependency replaced', () => {
    // Arrange
    const graph = TestGraphs.makeMediumAcylic();
    observeAll(graph);

    // Act
    graph.act(() => {
      graph.getNode('d')?.delete();
    });

    graph.act(() => {
      graph
        .getNode('e')
        ?.replace([assertDefined(graph.getNode('a') as DataNode<number>)], (a) => 0.2 * a);
    });

    // Assert
    expectNodeStates(graph, {
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.4) },
      b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.5) },
      c: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.16) },
      e: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.08) },
    });
  });
});

describe('act', () => {
  it("nested acts don't trigger recalculation", () => {
    // Arrange
    const graph = TestGraphs.makeSmallSelfCycle();

    // Act
    graph.act(() => {
      observeAll(graph);
      expectNodeStates(graph, {
        a: { status: NodeStatus.Unevaluated },
        b: { status: NodeStatus.Unevaluated },
      });
      graph.act(() => {
        graph.getNode('a')?.replace([], () => 2);
      });
      expectNodeStates(graph, {
        a: { status: NodeStatus.Unevaluated },
        b: { status: NodeStatus.Unevaluated },
      });
    });

    // Assert
    expectNodeStates(graph, {
      a: { status: NodeStatus.Resolved, value: 2 },
      b: { status: NodeStatus.Resolved, value: 1 },
    });
  });

  it("empty acts don't cause any updates", () => {
    // Arrange
    const graph = TestGraphs.makeSmallSelfCycle();
    graph.act(() => observeAll(graph));

    // Act

    spyOnCalculates(graph);
    graph.act(() => {});

    // Assert
    expectToHaveRecalculated([]);
  });
});

// TODO: add assertions for observer being called
// TOOD: add test for multiple observers
// TODO: add tests for observer batching
