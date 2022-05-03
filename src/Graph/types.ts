import DataNode from '../DataNode/DataNode';

export interface ReevaluationGraphState {
  ready: Set<DataNode>;
  /**
   * Map of nodes with unfinished dependencies to the number of dependencies, like a semaphore
   */
  waiting: Map<DataNode, number>;
}

export interface Transaction {
  observedNodesChanged: Set<DataNode>;
}
