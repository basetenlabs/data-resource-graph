import DataNode from '../DataNode';
import { NodeStatus } from '../DataNode/NodeState';
import { graphBuilder } from '../Test/graphBuilder';
import { GraphTracker } from '../Test/GraphTracker';
import { default as testGraphs, default as TestGraphs } from '../Test/testGraphs';
import '../Test/testTypes';
import { noopObserver } from '../Test/testUtils';
import assert from '../utils/assert';
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

    tracker.expectObservationBatch([
      ['c', { status: NodeStatus.Resolved, value: expect.closeTo2(0.3) }],
      ['e', { status: NodeStatus.Resolved, value: expect.closeTo2(0.2) }],
      ['f', { status: NodeStatus.Resolved, value: expect.closeTo2(-0.03) }],
      ['g', { status: NodeStatus.Resolved, value: expect.closeTo2(0.206) }],
      ['h', { status: NodeStatus.Resolved, value: expect.closeTo2(0.115) }],
      ['i', { status: NodeStatus.Resolved, value: expect.closeTo2(-0.021) }],
    ]);
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
    graph.act(() =>
      // Replace value of c
      graph.getNode('c')?.replace([], () => {
        throw 'Error!';
      }),
    );

    // Assert
    tracker.expectNodeStateChanges({
      c: { status: NodeStatus.OwnError, error: 'Error!' },
      e: { status: NodeStatus.DependencyError, error: 'Error!', path: ['c'] },
      f: { status: NodeStatus.DependencyError, error: 'Error!', path: ['c'] },
      g: { status: NodeStatus.DependencyError, error: 'Error!', path: ['c', 'e'] },
      h: { status: NodeStatus.DependencyError, error: 'Error!', path: ['c', 'e'] },
      i: { status: NodeStatus.DependencyError, error: 'Error!', path: ['c', 'e'] },
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

    it('notifies effected nodes when cycle formed', () => {
      // Arrange
      const graph = TestGraphs.makeSmallChain();
      const tracker = new GraphTracker(graph);
      tracker.observeAll();
      tracker.resetExpectations();

      // Act
      graph.act(() => {
        const nodeA = assertDefined(graph.getNode('a'));
        const nodeB = assertDefined(graph.getNode('b')) as DataNode<number>;

        nodeA.replace([nodeB], (b: number) => b + 1);
      });

      tracker.expectObservationBatch([
        ['a', { status: NodeStatus.CicularDependencyError }],
        ['b', { status: NodeStatus.CicularDependencyError }],
        ['c', { status: NodeStatus.CicularDependencyError }],
      ]);
    });

    it('node added downstream of cycle enters error state', () => {
      // Arrange
      const graph = TestGraphs.makeSmallSelfCycle();
      const tracker = new GraphTracker(graph);
      tracker.observeAll();
      tracker.resetExpectations();

      // Act
      graph.act(() => {
        const nodeA = assertDefined(graph.getNode('a'));

        const nodeC = graph.addNode('c', [nodeA], (a) => a);
        tracker.observe([nodeC]);
      });

      tracker.expectObservationBatch([['c', { status: NodeStatus.CicularDependencyError }]]);
    });

    it('recalculates downstream nodes when cycle broken', () => {
      // Arrange
      const graph = TestGraphs.makeSmallCycleWithDownstreams();
      const tracker = new GraphTracker(graph);
      tracker.observeAll();
      tracker.resetExpectations();

      // Act
      graph.act(() => {
        graph.getNode('b')?.replace([], () => 0);
      });

      tracker.expectObservationBatch([
        ['b', { status: NodeStatus.Resolved, value: 0 }],
        ['a', { status: NodeStatus.Resolved, value: 1 }],
        ['e', { status: NodeStatus.Resolved, value: 4 }],
        ['c', { status: NodeStatus.Resolved, value: 3 }],
        ['d', { status: NodeStatus.Resolved, value: 6 }],
      ]);
    });

    it('recalculates when cycle broken and node deleted', () => {
      // Arrange
      const graph = graphBuilder(0).act((graph) =>
        graph
          .addNode('a', ['c'], (c) => c + 1)
          .addNode('b', ['d'], (d) => d + 2)
          .addNode('c', ['b'], (b) => b + 3)
          .addNode('d', ['a'], (a) => a + 4),
      ).graph;
      const tracker = new GraphTracker(graph);
      tracker.observeAll();
      tracker.resetExpectations();

      // Act
      graph.act(() => {
        assertDefined(graph.getNode('d')).delete();
        assertDefined(graph.getNode('b')).replace([], () => 0);
      });

      tracker.expectObservationBatch([
        ['b', { status: NodeStatus.Resolved, value: 0 }],
        ['c', { status: NodeStatus.Resolved, value: 3 }],
        ['a', { status: NodeStatus.Resolved, value: 4 }],
      ]);
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

    it('correctly evaluates after reverts to pre-cycle state', () => {
      // Arrange
      const graph = testGraphs.makeSmallChevron();
      const tracker = new GraphTracker(graph);
      const nodeA = assertDefined(graph.getNode('a'));
      const nodeC = assertDefined(graph.getNode('c')) as DataNode<number>;
      // Evaluate once before cycle
      tracker.observeAll();
      // Create cycle and evaluate
      graph.act(() => nodeA.replace([nodeC], (c) => 1 + c));
      tracker.resetExpectations();

      // Act
      // Revert to pre-cycle graph
      graph.act(() => {
        nodeA.replace([], () => 1);
      });

      // Assert
      tracker.expectNodeStateChanges({
        a: { status: NodeStatus.Resolved, value: 1 },
        c: { status: NodeStatus.Resolved, value: 3 },
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

    function makeNodeAsync(
      graph: Graph,
      nodeId: string,
      calculate: (...args: unknown[]) => Promise<unknown>,
    ): TransactionResult | undefined {
      return graph.act(() => {
        const node = assertDefined(graph.getNode(nodeId));

        node.replaceWithAsync<unknown[]>(node.dependencies, calculate);
      });
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
      const deferredResult = new Deferred<((...deps: unknown[]) => unknown) | unknown>();

      const transactionResult = makeNodeAsync(graph, nodeId, async (...deps) => {
        const result = await deferredResult.promise;
        return typeof result === 'function' ? result(...deps) : result;
      });

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
      expect(graph.getNode('b')?.state).toEqual({ status: NodeStatus.Running });

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

    it("Node's async execution canceled by replacement of dependency", async () => {
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

      expect(graph.getNode('b')?.state).toEqual({ status: NodeStatus.Running });

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
      const graph = TestGraphs.makeSmallChain();
      const tracker = new GraphTracker(graph);

      // Run first transaction, evaluating graph fully
      await getCompletion(
        graph.act(() => {
          makeNodeAsync(
            graph,
            'b',
            jest
              .fn()
              // First calculate returns 3
              .mockResolvedValueOnce(3)
              // second calculate returns a promise that never resolves
              .mockReturnValueOnce(new Promise(() => {}))
              // Third calculate returns 4
              .mockResolvedValueOnce(4),
          );
          tracker.observeAll();
        }),
      );

      // Start second transaction, replacing a
      graph.act(() => {
        assertDefined(graph.getNode('a')).replace([], () => 2);
      });
      await tick();
      tracker.resetExpectations();

      // Third transaction While b is calculating, e in added and observed, causing second transaction to be cancelled
      const thirdTransaction = graph.act(() => {
        // Add a disconnected node
        graph.addNode('e', [], () => 0);
        tracker.observe(['e']);
      });

      await expect(getCompletion(thirdTransaction)).resolves.toEqual({ wasCancelled: false });

      tracker.expectNodeStateChanges({
        e: { status: NodeStatus.Resolved, value: 0 },
        b: { status: NodeStatus.Resolved, value: 4 },
        c: { status: NodeStatus.Resolved, value: 11 },
      });

      // Ensure that after third transaction, b and c are updated
      tracker.expectObservationBatches([
        // Third transaction
        [['e', { status: NodeStatus.Resolved, value: 0 }]],
        [
          ['b', { status: NodeStatus.Resolved, value: 4 }],
          ['c', { status: NodeStatus.Resolved, value: 11 }],
        ],
      ]);
    });

    it("does't reexecute async node if dependency invalidated", async () => {
      // Arrange
      const graph = TestGraphs.makeSmallChain();
      const tracker = new GraphTracker(graph);
      await getCompletion(
        graph.act(() => {
          makeNodeAsync(graph, 'b', async (a: unknown) => (a as number) + 2);
          tracker.observeAll();
          tracker.spyOnCalculates();
        }),
      );
      tracker.resetExpectations();

      // Act: invalidate node a
      await getCompletion(graph.act(() => assertDefined(graph.getNode('a')).invalidate()));

      // Assert
      // Only a, not b, recalculated
      tracker.expectToHaveCalculated(['a']);
    });

    it("Runs sync if recalculation graph doesn't contain async nodes", async () => {
      // Arrange
      const graph = TestGraphs.makeSmallChain();
      const tracker = new GraphTracker(graph);
      await getCompletion(
        graph.act(() => {
          makeNodeAsync(graph, 'b', async (a: unknown) => (a as number) + 2);
          tracker.observeAll();
          tracker.spyOnCalculates();
        }),
      );
      tracker.resetExpectations();

      // Act: invalidate node a
      const transactionResult = graph.act(() => assertDefined(graph.getNode('c')).invalidate());

      // Assert: Transaction in synchronous and only c recalculated
      expect(transactionResult).toEqual(syncTransactionResult);
      tracker.expectToHaveCalculated(['c']);
    });

    it('async node rejects with error', async () => {
      // Arrange
      const graph = TestGraphs.makeSmallChain();
      const [deferredResultB] = makeNodeDeferred(graph, 'b');
      const tracker = new GraphTracker(graph);

      // Act: Observe all nodes
      const completionPromise = getCompletion(tracker.observeAll());

      // Assert
      tracker.expectObservationBatch([['a', { status: NodeStatus.Resolved, value: 1 }]]);

      // Resolve B, which resolves C
      const error = new Error('Error!');
      deferredResultB.reject(error);

      await tick();

      tracker.expectObservationBatch([
        ['b', { status: NodeStatus.OwnError, error }],
        ['c', { status: NodeStatus.DependencyError, error, path: ['b'] }],
      ]);

      await expect(completionPromise).resolves.toEqual({ wasCancelled: false });
    });

    it('chained async using addAsyncNode()', async () => {
      const graph = new Graph();
      graph.act(() => {
        const nodeA = graph.addAsyncNode('a', [], async () => 1);
        graph.addAsyncNode('b', [nodeA], async (a) => a + 3);
      });

      const tracker = new GraphTracker(graph);
      tracker.spyOnCalculates();

      // Observe all nodes
      await getCompletion(tracker.observeAll());

      tracker.expectObservationBatches([
        [['a', { status: NodeStatus.Resolved, value: 1 }]],
        [['b', { status: NodeStatus.Resolved, value: 4 }]],
      ]);
    });
  });
});

describe('delete nodes', () => {
  it('deletes first node', () => {
    // Arrange
    const graph = TestGraphs.makeMediumAcylic();
    const tracker = new GraphTracker(graph);
    tracker.observeAll();
    tracker.resetExpectations();

    // Act
    graph.act(() => {
      graph.getNode('b')?.delete();
    });

    // Assert
    tracker.expectNodeStateChanges({
      c: { status: NodeStatus.MissingDependencyError, path: ['b'] },
      d: { status: NodeStatus.MissingDependencyError, path: ['b'] },
      e: { status: NodeStatus.MissingDependencyError, path: ['b', 'd'] },
      // b deleted
      b: null,
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

  it('deletes middle node', () => {
    // Arrange
    const graph = TestGraphs.makeMediumAcylic();
    const nodeD = assertDefined(graph.getNode('d'));
    graph.act(() => nodeD.delete());

    expect(() => graph.act(() => nodeD.replace([], () => 1))).toThrowError(
      'Operation on deleted node',
    );
  });

  it('Must delete node inside transaction', () => {
    // Arrange
    const graph = TestGraphs.makeMediumAcylic();
    const nodeD = assertDefined(graph.getNode('d'));

    expect(() => nodeD.delete()).toThrowError(
      'DataNode.delete() must be called inside a transaction',
    );
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

describe('observers', () => {
  it('Calls first observer observer on previously observed node', () => {
    const observer = jest.fn();

    const graph = TestGraphs.makeSmallChain();
    const nodeC = assertDefined(graph.getNode('c'));

    graph.act(() => nodeC.addObserver(observer));
    expect(observer.mock.calls).toEqual([[{ status: NodeStatus.Resolved, value: 15 }]]);
  });

  it('Calls new observer on previously observed node', () => {
    const newObserver = jest.fn();

    const graph = TestGraphs.makeSmallChain();
    const nodeC = assertDefined(graph.getNode('c'));

    graph.act(() => nodeC.addObserver(noopObserver));

    graph.act(() => nodeC.addObserver(newObserver));

    expect(newObserver.mock.calls).toEqual([[{ status: NodeStatus.Resolved, value: 15 }]]);
  });

  it('Calls observer on indirectly observed node', () => {
    const observer = jest.fn();

    const graph = TestGraphs.makeSmallChain();
    const nodeC = assertDefined(graph.getNode('c'));
    const nodeA = assertDefined(graph.getNode('a'));

    graph.act(() => nodeC.addObserver(noopObserver));

    graph.act(() => {
      nodeA.addObserver(observer);
    });

    expect(observer.mock.calls).toEqual([[{ status: NodeStatus.Resolved, value: 1 }]]);
  });

  it('Calls observer after removed and added back', () => {
    const observer = jest.fn();

    const graph = TestGraphs.makeSmallChain();
    const nodeC = assertDefined(graph.getNode('c'));
    graph.act(() => nodeC.addObserver(observer));
    graph.act(() => nodeC.removeObserver(observer));
    observer.mockClear();
    graph.act(() => nodeC.addObserver(observer));

    expect(observer.mock.calls).toEqual([[{ status: NodeStatus.Resolved, value: 15 }]]);
  });

  it('Calls second observer after first throws', () => {
    const observer2 = jest.fn();

    const graph = TestGraphs.makeSmallChain();
    graph.options.onError = jest.fn().mockImplementationOnce((err) => {
      expect(err?.message).toBe('Fail');
      // Make sure observer2 is called after the error
      expect(observer2).not.toHaveBeenCalled();
    });
    const nodeC = assertDefined(graph.getNode('c'));

    graph.act(() => {
      nodeC.addObserver(() => {
        throw new Error('Fail');
      });

      nodeC.addObserver(observer2);
    });

    expect(graph.options.onError).toHaveBeenCalledTimes(1);
    expect(observer2).toHaveBeenCalledTimes(1);
  });
});

describe('addNode', () => {
  it('fails trying to add duplicate node', () => {
    const graph = TestGraphs.makeSmallAcyclic();
    expect(() => graph.act(() => graph.addNode('a', [], () => 1))).toThrowError(
      'Node with id a already exists',
    );
  });
});
