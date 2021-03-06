import DataNode from '../DataNode';
import { NodeStatus } from '../DataNode/NodeState';
import assert from '../utils/assert';
import { Deferred } from '../utils/Deferred';
import { assertRunOnce, someIterable, takeFromSet, takeFromSetIf } from '../utils/utils';
import dfs from './dfs';
import Graph from './Graph';
import { AsyncTransactionCompletion, TransactionResult } from './types';

/**
 * Each instance of this class represents a single graph transaction
 *
 * @internal
 */
export class GraphTransaction {
  private readonly transactionId: number;

  /**
   * Set of nodes whose observers are waiting for notification. This queue should always be flushed
   * in the current execution stack
   */
  private readonly notificationQueue = new Set<DataNode>();
  /**
   * Set of nodes which should be notified by the end of the transaction, either as they're re-evaluated
   * or at the very end of a non-cancelled transaction.
   */
  private readonly nodesPendingNotification: Set<DataNode> = new Set();

  public readonly result: TransactionResult;
  private readonly completionDeferred = new Deferred<AsyncTransactionCompletion>();

  //#region node evaluation states
  private readonly ready = new Set<DataNode>();
  /**
   * Map of nodes with unfinished dependencies to the number of dependencies, like a semaphore
   */
  private readonly waiting = new Map<DataNode, number>();
  private readonly running = new Set<DataNode>();
  //#endregion node evaluation states

  constructor(private readonly graph: Graph) {
    this.transactionId = graph.transactionId;
    this.makeReevaluationGraph();

    const nodesPendingExecution = new Set<DataNode>([...this.ready.keys(), ...this.waiting.keys()]);

    const hasAsyncReevaluation = someIterable(nodesPendingExecution, (node) => node.isAsync());

    if (hasAsyncReevaluation) {
      this.result = { sync: false, completion: this.completionDeferred.promise };
    } else {
      this.result = { sync: true };
    }

    this.doWork();
  }

  private makeReevaluationGraph() {
    // Nodes observed directly
    const observed = Array.from(this.graph).filter((node) => node.hasObserver());

    // Nodes that need to be evaluated during the transaction
    const unevaluated = new Set<DataNode>();
    // Nodes observed either directly or indirectly
    const observedSet = new Set<DataNode>();

    const cyclesNodes = new Set<DataNode>();

    const prevCycleNodes = Array.from(this.graph).filter(
      (node) => node.state.status === NodeStatus.CicularDependencyError,
    );

    const handleCycleNode = (cycleNode: DataNode) => {
      const shouldNotify = cycleNode.setCircularDependencyError();
      if (shouldNotify) {
        this.notificationQueue.add(cycleNode);
      }
      cyclesNodes.add(cycleNode);
      // Remove cycle nodes from unevaluated
      unevaluated.delete(cycleNode);
    };

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
          cycle.forEach(handleCycleNode);

          return;
        }

        // Check if node needs to be evaluated
        if (node.state.status === NodeStatus.Unevaluated) {
          unevaluated.add(node);
        } else if (
          node.state.status === NodeStatus.Pending ||
          node.state.status === NodeStatus.Running
        ) {
          // Carry over nodes that were supposed to be executed last transaction but weren't
          unevaluated.add(node);
        }

        // Needs notification
        if (node.hasPendingObservers()) {
          this.nodesPendingNotification.add(node);
        }
      },
      'backward',
    );

    // Mark dependents of cycle nodes as cycle nodes
    dfs(Array.from(cyclesNodes), handleCycleNode, 'forward');

    // Mark nodes that are no longer cycle nodes as unevaluated
    for (const node of prevCycleNodes.filter((node) => !cyclesNodes.has(node))) {
      unevaluated.add(node);
    }

    // Traverse forwards, recursively adding nodes to evaluation set
    dfs(
      Array.from(unevaluated),
      (node) => {
        if (!observedSet.has(node)) {
          return false;
        }
        if (node.state.status !== NodeStatus.CicularDependencyError) {
          unevaluated.add(node);
        }
        return true;
      },
      'forward',
    );

    // For all observed and unevaluated nodes, decide whether it's ready or is waiting on dependencies
    for (const node of observedSet) {
      if (unevaluated.has(node)) {
        if (node.state.status !== NodeStatus.Unevaluated) {
          node.markPending();
        }
        let numUnevaluatedDeps = 0;
        for (const dep of node.dependencies) {
          if (unevaluated.has(dep)) numUnevaluatedDeps++;
        }
        if (numUnevaluatedDeps) {
          this.waiting.set(node, numUnevaluatedDeps);
        } else {
          this.ready.add(node);
        }
      }
    }
  }

  private flushNotificationQueue(flushNodesPendingNotification = false) {
    if (
      this.notificationQueue.size ||
      (flushNodesPendingNotification && this.nodesPendingNotification.size)
    ) {
      assertRunOnce(this.graph.options.observationBatcher)(() => {
        for (const node of this.notificationQueue) {
          node.notifyObservers();
          this.nodesPendingNotification.delete(node);
        }
        if (flushNodesPendingNotification) {
          for (const node of this.nodesPendingNotification) {
            node.notifyObservers();
          }
          this.nodesPendingNotification.clear();
        }
      });
      this.notificationQueue.clear();
    }
  }

  private complete(wasCancelled: boolean) {
    if (!this.result.sync) {
      this.completionDeferred.resolve({ wasCancelled });
    }
  }

  private signalDependents(node: DataNode) {
    for (const dependent of node.dependents) {
      const dependentCounter = this.waiting.get(dependent);
      if (dependentCounter !== undefined) {
        if (dependentCounter === 1) {
          this.waiting.delete(dependent);
          this.ready.add(dependent);
        } else if (dependentCounter > 1) {
          // Signal
          this.waiting.set(dependent, dependentCounter - 1);
        }
      }
    }
  }

  private checkForCompletion(): boolean {
    if (!this.ready.size && !this.running.size) {
      assert(!this.waiting.size, 'Exhausted ready queue with nodes still waiting');
      this.flushNotificationQueue(true);
      this.complete(false);
      return true;
    }

    return false;
  }

  private doWork(): void {
    // Check for cancellation
    if (this.graph.transactionId !== this.transactionId) {
      this.complete(true);
      return;
    }
    // Check for completion
    if (this.checkForCompletion()) {
      return;
    }

    let readyNode: DataNode | undefined;

    // Evaluate all synchronous ready nodes
    while ((readyNode = takeFromSetIf(this.ready, (node) => !node.isAsync()))) {
      readyNode.evaluate();
      this.notificationQueue.add(readyNode);
      this.signalDependents(readyNode);
    }

    // Flush notification queue
    this.flushNotificationQueue();

    // ALL THE CODE ABOVE IN THIS POINT MUST RUN SYNCHRONOUSLY

    if (this.ready.size) {
      // At this point, all remaining ready nodes are async
      while ((readyNode = takeFromSet(this.ready))) {
        const node = readyNode;
        this.running.add(node);
        node.evaluateAsync().then(
          () => {
            this.running.delete(node);
            this.notificationQueue.add(node);
            this.signalDependents(node);
            // Run work loop again
            this.doWork();
          },
          (err) => {
            this.graph.options.onError(err);
          },
        );
      }
    } else if (this.checkForCompletion()) {
      // Evaluation completed with synchronous node runs above
      return;
    } else {
      // Not complete and ready queue is empty, so must have nodes running
      assert(this.running.size);
    }
  }
}
