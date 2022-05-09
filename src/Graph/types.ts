/**
 * @public
 */
export type AsyncTransactionCompletion = {
  /**
   * Indicates whether the transaction was cancelled, meaning another transaction started while this transaction
   * was still evaluating.
   */
  wasCancelled: boolean;
};

/**
 * Describes the execution that takes place after a transaction
 * @public
 */
export type TransactionResult =
  | {
      sync: true;
    }
  | {
      sync: false;
      /**
       * Promise fulfilled when the graph's evaluation finished
       */
      completion: Promise<AsyncTransactionCompletion>;
    };
