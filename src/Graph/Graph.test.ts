import assert from 'assert';
import DataNode from '../DataNode/DataNode';
import { NodeStatus } from '../DataNode/NodeTypes';
import { GraphTracker } from '../Test/GraphTracker';
import TestGraphs from '../Test/testGraphs';
import '../Test/testTypes';
import { Deferred } from '../utils/Deferred';
import { assertDefined } from '../utils/utils';
import Graph from './Graph';
import { AsyncTransactionCompletion, TransactionResult } from './types';

const syncTransactionResult: TransactionResult = { sync: true };

describe('evaluation', () => {
  it('does first evaluation', () => {
    // Arrange
    const graph = TestGraphs.make3By3NuralNet();
    const tracker = new GraphTracker(graph);

    // Act
    const transactionResult = tracker.observeAll();

    // Assert

    expect(transactionResult).toEqual(syncTransactionResult);
    tracker.expectNodeStateChanges({
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
    const tracker = new GraphTracker(graph);
    tracker.observeAll();
    tracker.resetExpectations();

    // Act
    graph.act(() => {
      // Replace value of c
      graph.getNode('c')?.replace([], () => 0.3);
      tracker.spyOnCalculates();
    });

    // Assert
    tracker.expectToHaveCalculated(['c', 'e', 'f', 'g', 'h', 'i']);

    tracker.expectNodeStateChanges({
      c: { status: NodeStatus.Resolved, value: expect.closeTo2(0.3) },
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
    const tracker = new GraphTracker(graph);
    tracker.observeAll();
    tracker.resetExpectations();

    // Act

    graph.act(() => {
      // Replace value of c
      graph.getNode('a')?.replace([], () => -0.4);
      const nodeF = assertDefined(graph.getNode('f'));

      nodeF.replace(
        nodeF.dependencies as [DataNode<number>, DataNode<number>],
        (b: number, c: number) => 0.3 * b + 0.1 * c,
      );
      tracker.spyOnCalculates();
    });

    // Assert
    tracker.expectToHaveCalculated(['a', 'f', 'd', 'e', 'g', 'h', 'i']);

    tracker.expectNodeStateChanges({
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.4) },
      d: { status: NodeStatus.Resolved, value: expect.closeTo2(0.34) },
      e: { status: NodeStatus.Resolved, value: expect.closeTo2(0.24) },
      g: { status: NodeStatus.Resolved, value: expect.closeTo2(0.25) },
      h: { status: NodeStatus.Resolved, value: expect.closeTo2(0.145) },
    });
  });

  it('replacement of nodes in first and last layers causes downstream recalculation', () => {
    // Arrange
    const graph = TestGraphs.make3By3NuralNet();
    const tracker = new GraphTracker(graph);
    tracker.observeAll();
    tracker.resetExpectations();

    // Act

    graph.act(() => {
      // Replace value of c
      graph.getNode('a')?.replace([], () => -0.4);
      graph.getNode('i')?.invalidate();
      tracker.spyOnCalculates();
    });

    // Assert
    tracker.expectToHaveCalculated(['a', 'd', 'e', 'g', 'h', 'i']);

    tracker.expectNodeStateChanges({
      a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.4) },
      d: { status: NodeStatus.Resolved, value: expect.closeTo2(0.34) },
      e: { status: NodeStatus.Resolved, value: expect.closeTo2(0.24) },
      g: { status: NodeStatus.Resolved, value: expect.closeTo2(0.25) },
      h: { status: NodeStatus.Resolved, value: expect.closeTo2(0.145) },
    });
  });

  it("when invalidated node returns same result, dependents aren't reevaluated ", () => {
    // Arrange
    const graph = TestGraphs.make3By3NuralNet();
    const tracker = new GraphTracker(graph);
    tracker.observeAll();

    // Act

    graph.act(() => {
      // 'c' gets reevaluated but returns same result, so dependents aren't reevaluated
      graph.getNode('c')?.invalidate();

      // Re-evaluate
      tracker.spyOnCalculates();
    });

    // Assert
    tracker.expectToHaveCalculated(['c']);
  });

  it('propagates evaluation errors', () => {
    // Arrange
    const graph = TestGraphs.make3By3NuralNet();
    const tracker = new GraphTracker(graph);
    tracker.observeAll();
    tracker.resetExpectations();

    // Act
    graph.act(() => {
      // Replace value of c
      graph.getNode('c')?.replace([], () => {
        throw new Error();
      });
    });

    // Assert
    tracker.expectNodeStateChanges({
      c: { status: NodeStatus.OwnError },
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
    const tracker = new GraphTracker(graph);

    // Act
    tracker.observeAll();

    // Assert
    tracker.expectNodeStateChanges({
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
      const tracker = new GraphTracker(graph);

      // Act
      tracker.observeAll();

      // Assert
      tracker.expectNodeStateChanges({
        a: { status: NodeStatus.CicularDependencyError },
        b: { status: NodeStatus.Resolved, value: 1 },
      });
    });

    it('evaluates successfully after breaking a self-cycle', () => {
      // Arrange
      const graph = TestGraphs.makeSmallSelfCycle();
      const tracker = new GraphTracker(graph);
      tracker.observeAll();
      tracker.resetExpectations();

      // Act

      graph.act(() => {
        graph.getNode('a')?.replace([], () => 2);
        tracker.spyOnCalculates();
      });

      // Assert
      tracker.expectNodeStateChanges({
        a: { status: NodeStatus.Resolved, value: 2 },
      });

      tracker.expectToHaveCalculated(['a']);
    });

    it('evaluates non-cycle nodes of medium 3-node cycle', () => {
      // Arrange
      const graph = TestGraphs.makeMedium3NodeCycle();
      const tracker = new GraphTracker(graph);

      // Act
      tracker.observeAll();

      // Assert
      tracker.expectNodeStateChanges({
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
      const tracker = new GraphTracker(graph);

      // Act
      tracker.observeAll();

      // Assert

      graph.act(() => {
        graph.getNode('a')?.replace([], () => 2);
        tracker.spyOnCalculates();
      });

      tracker.expectNodeStateChanges({
        a: { status: NodeStatus.Resolved, value: 2 },
        b: { status: NodeStatus.Resolved, value: 1 },
        c: { status: NodeStatus.Resolved, value: 3 },
        d: { status: NodeStatus.Resolved, value: 5 },
        e: { status: NodeStatus.Resolved, value: 1 },
      });

      tracker.expectToHaveCalculated(['a', 'c', 'b']);
    });

    it('detects figure-eight cycle', () => {
      // Arrange
      const graph = TestGraphs.makeMediumFigureEightCycle();
      const tracker = new GraphTracker(graph);

      // Act
      tracker.observeAll();

      tracker.expectNodeStateChanges({
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
      const tracker = new GraphTracker(graph);

      // Assert
      tracker.expectNodeStates({
        a: { status: NodeStatus.Unevaluated },
        b: { status: NodeStatus.Unevaluated },
        c: { status: NodeStatus.Unevaluated },
      });
    });

    it('only observed subgraph evaluated', () => {
      // Arrange
      const graph = TestGraphs.make3By3NuralNet();
      const tracker = new GraphTracker(graph);

      // Act
      tracker.observe(['g']);

      // assert
      tracker.expectNodeStateChanges({
        a: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.3) },
        b: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.2) },
        c: { status: NodeStatus.Resolved, value: expect.closeTo2(0.1) },
        d: { status: NodeStatus.Resolved, value: expect.closeTo2(0.26) },
        e: { status: NodeStatus.Resolved, value: expect.closeTo2(0.16) },
        g: { status: NodeStatus.Resolved, value: expect.closeTo2(0.17) },
      });

      tracker.expectObservationBatch([
        ['g', { status: NodeStatus.Resolved, value: expect.closeTo2(0.17) }],
      ]);
    });

    it('only observed subgraph evaluated after observers removed', () => {
      // Arrange
      const graph = TestGraphs.make3By3NuralNet();
      const tracker = new GraphTracker(graph);
      tracker.observe(['g', 'i']);
      tracker.resetExpectations();

      // Act

      graph.act(() => {
        // I becomes unobserved
        tracker.stopObserving(['i']);
        // Update first layer
        graph.getNode('a')?.replace([], () => 0.3);
        graph.getNode('b')?.replace([], () => 0.2);
        graph.getNode('c')?.replace([], () => -0.1);
        tracker.spyOnCalculates();
      });

      // assert

      // Only nodes that feed into G are recalculated
      tracker.expectToHaveCalculated(['a', 'b', 'c', 'd', 'e', 'g']);

      tracker.expectNodeStateChanges({
        a: { status: NodeStatus.Resolved, value: expect.closeTo2(0.3) },
        b: { status: NodeStatus.Resolved, value: expect.closeTo2(0.2) },
        c: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.1) },
        d: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.26) },
        e: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.16) },
        g: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.17) },
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

    /**
     * Replace a data node with an async function
     * @returns a tuple with the deferred object and a transaction result. The deferred promise may
     * either resolve with the node value or resolve to a calculate function taking in dependency values
     * and returning the node value.
     */
    function makeNodeDeferred(
      graph: Graph,
      nodeId: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): [Deferred<((...deps: any[]) => unknown) | unknown>, TransactionResult | undefined] {
      const node = assertDefined(graph.getNode(nodeId));
      const deferredResult = new Deferred<((...deps: unknown[]) => unknown) | unknown>();

      const transactionResult = graph.act(() =>
        node.replaceWithAsync<unknown[]>(node.dependencies, async (...deps) => {
          const result = await deferredResult.promise;
          return typeof result === 'function' ? result(...deps) : result;
        }),
      );

      return [deferredResult, transactionResult];
    }

    it('single async node', async () => {
      // Arrange
      const graph = TestGraphs.makeSmallChain();
      const [deferredResultB] = makeNodeDeferred(graph, 'b');
      const tracker = new GraphTracker(graph);

      // Act: Observe all nodes
      const completionPromise = getCompletion(tracker.observeAll());

      // Assert
      // A evaluted immediately
      tracker.expectObservationBatch([['a', { status: NodeStatus.Resolved, value: 1 }]]);

      // Resolve B, which resolves C
      deferredResultB.resolve(3);

      await tick();

      tracker.expectObservationBatch([
        ['b', { status: NodeStatus.Resolved, value: 3 }],
        ['c', { status: NodeStatus.Resolved, value: 7 }],
      ]);

      await expect(completionPromise).resolves.toEqual({ wasCancelled: false });
    });

    it('chained async', async () => {
      const graph = TestGraphs.makeSmallChain();
      const [deferredResultA] = makeNodeDeferred(graph, 'a');
      const [deferredResultB] = makeNodeDeferred(graph, 'b');

      const tracker = new GraphTracker(graph);
      tracker.spyOnCalculates();

      // Observe all nodes
      const completionPromise = getCompletion(tracker.observeAll());

      // Resolve A
      deferredResultA.resolve(1);

      await tick();

      tracker.expectObservationBatch([['a', { status: NodeStatus.Resolved, value: 1 }]]);

      // Resolve B
      deferredResultB.resolve(3);

      await tick();

      tracker.expectObservationBatch([
        ['b', { status: NodeStatus.Resolved, value: 3 }],
        ['c', { status: NodeStatus.Resolved, value: 7 }],
      ]);

      await expect(completionPromise).resolves.toEqual({ wasCancelled: false });
    });

    it('parallel async', async () => {
      const graph = TestGraphs.makeSmallChevron();
      const [deferredResultA] = makeNodeDeferred(graph, 'a');
      const [deferredResultB] = makeNodeDeferred(graph, 'b');

      const tracker = new GraphTracker(graph);
      tracker.spyOnCalculates();

      // Observe all nodes
      const completionPromise = getCompletion(tracker.observeAll());

      // a and b invoked immediately in parallel, but not resolved
      tracker.expectToHaveCalculated(['a', 'b']);

      // Resolve A
      deferredResultA.resolve(1);

      await tick();

      tracker.expectObservationBatch([['a', { status: NodeStatus.Resolved, value: 1 }]]);

      // Resolve B
      deferredResultB.resolve(3);

      await tick();

      // B notified and c notified synchronously
      tracker.expectObservationBatch([
        ['b', { status: NodeStatus.Resolved, value: 3 }],
        ['c', { status: NodeStatus.Resolved, value: 4 }],
      ]);

      tracker.expectToHaveCalculated(['c']);

      await expect(completionPromise).resolves.toEqual({ wasCancelled: false });
    });

    it("Node's async exection canceled by replacement", async () => {
      const graph = TestGraphs.makeSmallChain();
      const [firstDeferredResult] = makeNodeDeferred(graph, 'b');
      const tracker = new GraphTracker(graph);
      const firstTransaction = tracker.observeAll();

      await tick();

      // B is replaced while it's still being evaluated
      const [secondDeferredResult, secondTransaction] = makeNodeDeferred(graph, 'b');

      await tick();

      // Assert b still unevaluated
      expect(graph.getNode('b')?.state).toEqual({ status: NodeStatus.Unevaluated });

      firstDeferredResult.resolve(5);

      // Complete both calls to b
      secondDeferredResult.resolve(3);

      await tick();

      await expect(getCompletion(firstTransaction)).resolves.toEqual({ wasCancelled: true });
      await expect(getCompletion(secondTransaction)).resolves.toEqual({ wasCancelled: false });

      tracker.expectObservationBatches([
        // First transaction only calculates a before getting cancelled
        [['a', { status: NodeStatus.Resolved, value: 1 }]],
        // Second transaction re-calculates b and c
        [
          ['b', { status: NodeStatus.Resolved, value: 3 }],
          ['c', { status: NodeStatus.Resolved, value: 7 }],
        ],
      ]);
    });

    it("Node's async exection canceled by replacement of dependency", async () => {
      const graph = TestGraphs.makeSmallChain();
      const [firstDeferredResult] = makeNodeDeferred(graph, 'b');
      const tracker = new GraphTracker(graph);
      const firstTransaction = tracker.observeAll();

      await tick();

      // B is replaced while it's still being evaluated
      let secondDeferredResult: Deferred<unknown> | undefined;
      const secondTransaction = graph.act(() => {
        [secondDeferredResult] = makeNodeDeferred(graph, 'b');
        graph.getNode('a')?.replace([], () => 2);
      });

      await tick();

      // B is still not evaluated
      expect(graph.getNode('b')?.state).toEqual({ status: NodeStatus.Unevaluated });

      // Complete both calls to b
      firstDeferredResult.resolve(7);
      assertDefined(secondDeferredResult).resolve((a: number) => {
        expect(a).toBe(2);
        return a * 2 - 1;
      });

      await expect(getCompletion(firstTransaction)).resolves.toEqual({ wasCancelled: true });
      await expect(getCompletion(secondTransaction)).resolves.toEqual({ wasCancelled: false });

      tracker.expectObservationBatches([
        // First transaction calculates a
        [['a', { status: NodeStatus.Resolved, value: 1 }]],
        // Second transaction re-calculates a
        [['a', { status: NodeStatus.Resolved, value: 2 }]],
        // Then calculates b and c
        [
          ['b', { status: NodeStatus.Resolved, value: 3 }],
          ['c', { status: NodeStatus.Resolved, value: 7 }],
        ],
      ]);
    });

    it('Waiting nodes from cancelled transaction recalculated in next transaction', async () => {
      // Arrange
      const graph = TestGraphs.makeSmallChain();
      const tracker = new GraphTracker(graph);
      tracker.observeAll();
      tracker.resetExpectations();

      const [deferredResultB, firstTransaction] = makeNodeDeferred(graph, 'b');

      // While b is calculating, e in added and observed, causing first transaction to be cancelled
      const secondTransaction = graph.act(() => {
        // Add a disconnected node
        graph.addNode('e', [], () => 0);
        tracker.observe(['e']);
      });

      await tick();

      assertDefined(deferredResultB).resolve(3);

      await tick();

      tracker.expectObservationBatches([
        [['e', { status: NodeStatus.Resolved, value: 0 }]],
        [
          ['b', { status: NodeStatus.Resolved, value: 3 }],
          ['c', { status: NodeStatus.Resolved, value: 7 }],
        ],
      ]);

      await expect(getCompletion(firstTransaction)).resolves.toEqual({ wasCancelled: true });
      await expect(getCompletion(secondTransaction)).resolves.toEqual({ wasCancelled: false });
    });
  });
});

describe('delete nodes', () => {
  it('deletes middle node', () => {
    // Arrange
    const graph = TestGraphs.makeMediumAcylic();
    const tracker = new GraphTracker(graph);
    tracker.observeAll();
    tracker.resetExpectations();

    // Act
    graph.act(() => {
      graph.getNode('d')?.delete();
    });

    // Assert
    tracker.expectNodeStateChanges({
      e: { status: NodeStatus.DependencyError },
      // d deleted
      d: null,
    });
  });

  it('deletes leaf node', () => {
    // Arrange
    const graph = TestGraphs.makeMediumAcylic();
    const tracker = new GraphTracker(graph);
    tracker.observeAll();
    tracker.resetExpectations();

    // Act
    graph.act(() => {
      graph.getNode('c')?.delete();
    });

    // Assert
    tracker.expectNodeStateChanges({
      c: null, // c deleted
    });
  });

  it('recovers after node with missing dependency replaced', () => {
    // Arrange
    const graph = TestGraphs.makeMediumAcylic();
    const tracker = new GraphTracker(graph);
    tracker.observeAll();
    tracker.resetExpectations();

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
    tracker.expectNodeStateChanges({
      d: null, // d deleted
      e: { status: NodeStatus.Resolved, value: expect.closeTo2(-0.08) },
    });
  });
});

describe('act', () => {
  it("nested acts don't trigger recalculation", () => {
    // Arrange
    const graph = TestGraphs.makeSmallSelfCycle();
    const tracker = new GraphTracker(graph);

    // Act
    graph.act(() => {
      tracker.observeAll();
      // No nodes updated
      tracker.expectNodeStateChanges({});
      graph.act(() => {
        graph.getNode('a')?.replace([], () => 2);
      });
      // Still no nodes updated
      tracker.expectNodeStateChanges({});
    });

    // Assert
    tracker.expectObservationBatch([
      ['a', { status: NodeStatus.Resolved, value: 2 }],
      ['b', { status: NodeStatus.Resolved, value: 1 }],
    ]);
  });

  it("empty acts don't cause any updates", () => {
    // Arrange
    const graph = TestGraphs.makeSmallSelfCycle();
    const tracker = new GraphTracker(graph);
    tracker.observeAll();

    // Act

    tracker.spyOnCalculates();
    graph.act(() => {});

    // Assert
    tracker.expectToHaveCalculated([]);
  });
});

// TODO: add assertions for observer being called
// TOOD: add test for multiple observers
// TODO: add tests for observer batching
