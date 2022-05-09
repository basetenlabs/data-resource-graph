import assert from 'assert';
import fromPairs from 'lodash/fromPairs';
import omitBy from 'lodash/omitBy';
import DataNode from '../DataNode/DataNode';
import { NodeState, Observer } from '../DataNode/NodeTypes';
import { areStatesEqual } from '../DataNode/utils';
import Graph from '../Graph/Graph';
import { BatchFunction, GraphOptions } from '../Graph/options';
import { TransactionResult } from '../Graph/types';
import { assertDefined } from '../utils/utils';
import { getNodeStates } from './testUtils';

type Observation = [nodeId: string, state: NodeState<unknown>];

const spiedOnFlag = Symbol('spiedOn');

type SpiableNode = {
  calculateFunction: { fn: { (...args: unknown[]): unknown; [spiedOnFlag]?: true } };
};

/**
 * Jest test helper to track the observations and state changes of the nodes in a Graph
 */
export class GraphTracker {
  private observers: Map<string, Observer<unknown>> = new Map();
  private currentObservationBatches: Observation[][] = [];
  private currentObservationBatch: Observation[] | undefined;
  private lastNodeStates: Record<string, NodeState<unknown>>;
  private currentCalculatedNodes: string[] = [];

  constructor(public readonly graph: Graph) {
    // Inject own observationBatcher. A little hacky
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((graph as any).options as GraphOptions).observationBatcher = this.batchObservations;
    this.lastNodeStates = getNodeStates(graph);
  }

  observe(nodes: (DataNode<unknown> | string)[]): TransactionResult | undefined {
    return this.graph.act(() => {
      for (const nodeLike of nodes) {
        const node =
          typeof nodeLike === 'string' ? assertDefined(this.graph.getNode(nodeLike)) : nodeLike;
        if (!this.observers.has(node.id)) {
          const observer: Observer<unknown> = (state) => this.handleObservation(node, state);
          node.addObserver(observer);
          this.observers.set(node.id, observer);
        }
      }
    });
  }

  stopObserving(nodes: (DataNode<unknown> | string)[]): TransactionResult | undefined {
    return this.graph.act(() => {
      for (const nodeLike of nodes) {
        const node =
          typeof nodeLike === 'string' ? assertDefined(this.graph.getNode(nodeLike)) : nodeLike;
        const observer = this.observers.get(node.id);
        if (observer) {
          node.removeObserver(observer);
          this.observers.delete(node.id);
        }
      }
    });
  }

  observeAll(): TransactionResult | undefined {
    return this.observe(Array.from(this.graph));
  }

  stopObservingAll(): TransactionResult | undefined {
    return this.stopObserving(Array.from(this.graph));
  }

  /**
   * Instruments all node calculate function with spy that allows assertion calculation order
   * via `expectToHaveCalculated`
   */
  public spyOnCalculates(): void {
    // Spy on calculate functions at end of batch since new calculate functions might have been added
    // Use a custom spy function, not jest's, so we can instrument the call with custom logic
    for (const node of this.graph) {
      const { calculateFunction } = node as unknown as SpiableNode;
      const original = calculateFunction.fn;
      if (!original[spiedOnFlag]) {
        calculateFunction.fn = (...args: unknown[]) => {
          this.currentCalculatedNodes.push(node.id);
          return original(...args);
        };
        calculateFunction.fn[spiedOnFlag] = true;
      }
    }
  }

  private batchObservations: BatchFunction = (callback) => {
    this.currentObservationBatch = [];
    callback();

    this.currentObservationBatches.push(this.currentObservationBatch);
    this.currentObservationBatch = undefined;
  };

  private handleObservation(node: DataNode, state: NodeState<unknown>) {
    assert(this.currentObservationBatch, 'Expected observation inside a batch function');

    this.currentObservationBatch.push([node.id, state]);
  }

  /**
   * Asserts that the observation batches (meaning the lists of synchronous observer calls) since the last time
   * `expectObservationBatches` was called match the passed in expectedBatches.
   */
  public expectObservationBatches(expectedBatches: Observation[][]): void {
    expect(this.currentObservationBatches).toEqual(expectedBatches);
    // Clear array
    this.currentObservationBatches = [];
  }

  public expectObservationBatch(expectedBatch: Observation[]): void {
    this.expectObservationBatches([expectedBatch]);
  }

  /**
   * Asserts that the set of changes node states between the last call to `expectNodeStateChanges()`
   * (or `GraphTracker` construction if this is the first call) matches the parameter.
   * @param expectedChanges - A partial mapping of nodes to node states and checks
   */
  public expectNodeStateChanges(expectedChanges: Record<string, NodeState<unknown> | null>): void {
    const currNodeStates = getNodeStates(this.graph);

    const observedNodeStateDiff: Record<string, NodeState<unknown> | null> = {
      ...omitBy(
        currNodeStates,
        (value, key) =>
          !this.lastNodeStates[key] || areStatesEqual(value, this.lastNodeStates[key]),
      ),
      ...fromPairs(
        Object.keys(this.lastNodeStates)
          .filter((oldNodeId) => !currNodeStates[oldNodeId])
          .map((key) => [key, null]),
      ),
    };

    expect(observedNodeStateDiff).toEqual(expectedChanges);
    this.lastNodeStates = currNodeStates;
  }

  /**
   * Expect a certain mapping of node states for all nodes in the graph. It's usually cleaner to call
   * `expectNodeStateChanges()`, but `expectNodeStates()` may be useful to checking the initial unevaluated graph state.
   * @param expectedChanges
   */
  public expectNodeStates(expectedChanges: Record<string, NodeState<unknown>>): void {
    const currNodeStates = getNodeStates(this.graph);

    expect(currNodeStates).toEqual(expectedChanges);
    this.lastNodeStates = currNodeStates;
  }

  /**
   * Refreshes the last observed node states to the current node states. Equivalent to calling
   * `expectNodeStateChanges` without making any assertions. Often used with the following formula:
   * ```
   * // Arrange
   * // Some graph mutation, like tracker.observeAll()
   * tracker.clearNodeStateChanges() // Tracker has fresh node states
   *
   * // Act
   * // Some other graph mutation
   *
   * // Assert
   * tracker.expectNodeStateChanges({...});
   * ```
   */
  public clearNodeStateChanges(): void {
    this.lastNodeStates = getNodeStates(this.graph);
  }

  /**
   * Asserts that a certain set of node ids have been recalculated since the last call to
   * `expectToHaveCalculated`.
   */
  public expectToHaveCalculated(expectedNodeIds: string[]): void {
    expect(this.currentCalculatedNodes).toEqual(expectedNodeIds);
    // Clear array
    this.currentCalculatedNodes = [];
  }
}
