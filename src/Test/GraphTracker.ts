import assert from 'assert';
import omitBy from 'lodash/omitBy';
import DataNode from '../DataNode/DataNode';
import { NodeState, Observer } from '../DataNode/NodeTypes';
import Graph from '../Graph/Graph';
import { BatchFunction, GraphOptions } from '../Graph/options';
import { TransactionResult } from '../Graph/types';
import { assertDefined } from '../utils/utils';
import { getNodeStates } from './testUtils';

type Observation = [nodeId: string, state: NodeState<unknown>];

/**
 * Jest test helper to track the observations and state changes of the nodes in a Graph
 */
export class GraphTracker {
  private observers: Map<string, Observer<unknown>> = new Map();
  private currentObservationBatches: Observation[][] = [];
  private currentObservationBatch: Observation[] | undefined;
  private lastNodeStates: Record<string, NodeState<unknown>>;

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

  public expectNodeStateChanges(changes: Record<string, NodeState<unknown> | null>): void {
    const currNodeStates = getNodeStates(this.graph);
    const newExpectedNodeStates = omitBy(
      { ...this.lastNodeStates, ...changes },
      // Treat nulls as deleted nodes
      (_, value) => value === undefined,
    );
    expect(currNodeStates).toEqual(newExpectedNodeStates);
    this.lastNodeStates = currNodeStates;
  }
}
