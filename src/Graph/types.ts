import DataNode from '../DataNode/DataNode';

export interface ReevaluationGraphState {
  ready: Set<DataNode>;
  /**
   * Map of nodes with unfinished dependencies to the number of dependencies, like a semaphore
   */
  waiting: Map<DataNode, number>;
}

export interface Transaction {
  /**
   * Set of nodes whose state has changed during the transaction
   */
  notificationQueue: Set<DataNode>;
}

export type TransactionResult =
  | {
      sync: true;
    }
  | {
      sync: false;
      completion: Promise<{ wasCancelled: boolean }>;
    };
