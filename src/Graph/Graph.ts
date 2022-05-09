import assert from 'assert';
import defaults from 'lodash/defaults';
import DataNode, { DataNodesOf } from '../DataNode/DataNode';
import { CalculateFunction, NodeStatus } from '../DataNode/NodeTypes';
import { Deferred } from '../utils/Deferred';
import { assertRunOnce, someIterable, takeFromSet, takeFromSetIf } from '../utils/utils';
import dfs from './dfs';
import { defaultOptions, GraphOptions } from './options';
import { AsyncTransactionCompletion, ReevaluationGraphState, TransactionResult } from './types';

class Graph implements Iterable<DataNode> {
  private readonly nodes: Map<string, DataNode> = new Map();
  private readonly options: GraphOptions;

  private isInMutationPhase = false;
  // Incrementing counter corresponding to most recent transaction
  public transactionId = 0;
  // Set of nodes that still needed to be evaluated in most recent transaction
  private nodesPendingExecution = new Set<DataNode>();

  constructor(options: Partial<GraphOptions> = {}) {
    this.options = defaults(defaultOptions, options);
  }

  public addNode<TArgs extends unknown[], TResult>(
    id: string,
    dependencies: DataNodesOf<TArgs>,
    fn: (...args: TArgs) => TResult,
  ): DataNode<TResult> {
    return this.addNodeInner(id, dependencies, { fn, sync: true });
  }

  public addAsyncNode<TArgs extends unknown[], TResult>(
    id: string,
    dependencies: DataNodesOf<TArgs>,
    fn: (...args: TArgs) => Promise<TResult>,
  ): DataNode<TResult> {
    return this.addNodeInner<TArgs, TResult>(id, dependencies, { fn, sync: false });
  }

  private addNodeInner<TArgs extends unknown[], TResult>(
    id: string,
    dependencies: DataNodesOf<TArgs>,
    calculate: CalculateFunction<TResult, TArgs>,
  ): DataNode<TResult> {
    this.assertTransaction('Graph.addNode()');

    if (this.nodes.has(id)) {
      throw new Error(`Node with id ${id} already exists`);
    }

    const newNode = new DataNode(
      this,
      id,
      dependencies,
      calculate as CalculateFunction<TResult, unknown[]>,
    );

    for (const dep of dependencies) {
      dep.dependents.add(newNode);
    }

    this.nodes.set(id, newNode);

    return newNode;
  }

  public deleteNodeInternal(node: DataNode): void {
    this.assertTransaction('Graph.deleteNode()');

    this.nodes.delete(node.id);
  }

  //#region evaluation

  private makeReevaluationGraph(): ReevaluationGraphState {
    const observed = Array.from(this).filter((node) => node.hasObserver());

    const unevaluated = new Set<DataNode>();
    const observedSet = new Set<DataNode>();

    // Traverse observed subgraph looking for unevaluated nodes and detecting cycles
    // TODO Future optimization: whether or not each node is directly or indirectly observed can be cached
    // based on the set of observed nodes and graph topology
    dfs(
      observed,
      (node, stack) => {
        observedSet.add(node);
        // Look for cycles
        const priorNodeIndex = stack.indexOf(node);
        if (priorNodeIndex >= 0) {
          // Found cycle, set error on all cycle nodes
          const cycle = stack.slice(priorNodeIndex);
          for (const cycleNode of cycle) {
            cycleNode.state = { status: NodeStatus.CicularDependencyError };
            // Remove cycle nodes from unevaluated
            unevaluated.delete(cycleNode);
          }

          return;
        }

        // Check if node needs to be evaluated
        if (node.state.status === NodeStatus.Unevaluated) {
          unevaluated.add(node);
        } else if (this.nodesPendingExecution.has(node)) {
          // Carry over nodes that were supposed to be executed last transaction but weren't
          unevaluated.add(node);
        }
      },
      'backward',
    );

    // Traverse forwards, recursively making nodes as unevaluated
    dfs(
      Array.from(unevaluated),
      (node) => {
        if (node.state.status !== NodeStatus.CicularDependencyError) {
          unevaluated.add(node);
        }
      },
      'forward',
    );

    const reevaluationGraph: ReevaluationGraphState = { ready: new Set(), waiting: new Map() };

    // For all observed and unevaluated nodes, decide whether it's ready or is waiting on dependencies
    for (const node of observedSet) {
      if (unevaluated.has(node)) {
        let numUnevaluatedDeps = 0;
        for (const dep of node.dependencies) {
          if (unevaluated.has(dep)) numUnevaluatedDeps++;
        }
        if (numUnevaluatedDeps) {
          reevaluationGraph.waiting.set(node, numUnevaluatedDeps);
        } else {
          reevaluationGraph.ready.add(node);
        }
      }
    }

    return reevaluationGraph;
  }

  private evaluateSync({ ready, waiting }: ReevaluationGraphState): void {
    let readyNode: DataNode | undefined;
    const notificationQueue = new Set<DataNode>();
    // Create a new empty set. It can remain empty since synchronous evaluation should never carry nodes over to future transactions
    this.nodesPendingExecution = new Set<DataNode>();

    // eslint-disable-next-line no-cond-assign
    while ((readyNode = takeFromSet(ready))) {
      const shouldNotify = readyNode.evaluate();
      if (shouldNotify) {
        notificationQueue.add(readyNode);
      }

      for (const dependent of readyNode.dependents) {
        const dependentCounter = waiting.get(dependent);
        if (dependentCounter !== undefined) {
          if (dependentCounter === 1) {
            waiting.delete(dependent);
            ready.add(dependent);
          } else if (dependentCounter > 1) {
            // Signal
            waiting.set(dependent, dependentCounter - 1);
          }
        }
      }
    }

    assert(!waiting.size, 'Exhausted ready queue with nodes still waiting');

    // Notify
    if (notificationQueue.size) {
      assertRunOnce(this.options.observationBatcher)(() => {
        for (const node of notificationQueue) {
          node.notifyObservers();
        }
      });
    }
  }

  // TODO: pull out to helper class - Evaluation
  private evaluateAsync({
    ready,
    waiting,
  }: ReevaluationGraphState): Promise<AsyncTransactionCompletion> {
    // Add ready and waiting nodes to new set of nodesPendingExecution
    // Create a new object and capture it in the closure so we can safely delete nodes from it after async execution
    // without fear of clobbering future transactions.
    const nodesPendingExecution = (this.nodesPendingExecution = new Set<DataNode>([
      ...ready.keys(),
      ...waiting.keys(),
    ]));

    const completionDeferred = new Deferred<AsyncTransactionCompletion>();

    const notificationQueue = new Set<DataNode>();
    const running = new Set<DataNode>();
    const currentTransactionId = this.transactionId;

    function signalDependents(node: DataNode) {
      for (const dependent of node.dependents) {
        const dependentCounter = waiting.get(dependent);
        if (dependentCounter !== undefined) {
          if (dependentCounter === 1) {
            waiting.delete(dependent);
            ready.add(dependent);
          } else if (dependentCounter > 1) {
            // Signal
            waiting.set(dependent, dependentCounter - 1);
          }
        }
      }
    }

    // We want to defer calling this in synchronous execution blocks  as long as possible to get as much batching as possible
    const flushNotificationQueue = () => {
      if (notificationQueue.size) {
        assertRunOnce(this.options.observationBatcher)(() => {
          for (const node of notificationQueue) {
            node.notifyObservers();
          }
        });
        notificationQueue.clear();
      }
    };

    const doWork = (): void => {
      // Check for cancellation
      if (currentTransactionId !== this.transactionId) {
        flushNotificationQueue();
        completionDeferred.resolve({ wasCancelled: true });
        return;
      }
      // Check for completion
      if (!ready.size && !running.size) {
        assert(!waiting.size, 'Exhausted ready queue with nodes still waiting');
        assert(!nodesPendingExecution.size, 'Found nodes pending execution after evaluation ended');
        flushNotificationQueue();
        completionDeferred.resolve({ wasCancelled: false });
        return;
      }
      // Evaluate all synchronous ready nodes
      let readyNode: DataNode | undefined;

      while ((readyNode = takeFromSetIf(ready, (node) => !node.isAsync()))) {
        const shouldNotify = readyNode.evaluate();
        nodesPendingExecution.delete(readyNode);
        if (shouldNotify) notificationQueue.add(readyNode);
        signalDependents(readyNode);
      }

      // Flush notification queue
      flushNotificationQueue();

      // ALL THE CODE ABOVE IN THIS POINT MUST RUN SYNCHRONOUSLY

      if (ready.size) {
        // At this point, all remaining ready nodes are async
        while ((readyNode = takeFromSet(ready))) {
          const node = readyNode;
          running.add(node);
          node.evaluateAsync().then(
            (shouldNotify) => {
              running.delete(node);
              nodesPendingExecution.delete(node);
              if (shouldNotify) notificationQueue.add(node);
              signalDependents(node);
              // Run work loop again
              doWork();
            },
            (err) => {
              // TODO: better error handling
              console.error(err);
            },
          );
        }
      } else if (!ready.size && !running.size) {
        // TODO: reduce duplication with Evaluation class
        assert(!waiting.size, 'Exhausted ready queue with nodes still waiting');
        assert(!nodesPendingExecution.size, 'Found nodes pending execution after evaluation ended');
        flushNotificationQueue();
        completionDeferred.resolve({ wasCancelled: false });
        return;
      }
    };

    doWork();

    return completionDeferred.promise;
  }

  //#endregion evaluation

  getNode(id: string): DataNode | undefined {
    return this.nodes.get(id);
  }

  [Symbol.iterator](): IterableIterator<DataNode> {
    return this.nodes.values();
  }

  //#region transaction support
  public assertTransaction(name = 'method'): void {
    if (!this.isInMutationPhase) {
      throw new Error(`${name} must be called inside a transaction`);
    }
  }

  /**
   * Run mutations inside an action
   * @returns TransactionResult, only for outermost act() call
   */
  public act(mutator: () => void): TransactionResult | undefined {
    if (this.isInMutationPhase) {
      // If already inside a transaction, can just call callback
      mutator();
      return undefined;
    }

    this.isInMutationPhase = true;
    this.transactionId++;

    try {
      mutator();
    } finally {
      this.isInMutationPhase = false;
    }

    const reevaluationGraph = this.makeReevaluationGraph();

    const hasAsyncReevaluation =
      someIterable(reevaluationGraph.ready.keys(), (node) => node.isAsync()) ||
      someIterable(reevaluationGraph.waiting.keys(), (node) => node.isAsync());

    if (hasAsyncReevaluation) {
      // Async evaluation

      return { sync: false, completion: this.evaluateAsync(reevaluationGraph) };
    } else {
      // Sync evaluation
      this.evaluateSync(reevaluationGraph);

      return { sync: true };
    }
  }
  //#endregion transaction support
}

export default Graph;
