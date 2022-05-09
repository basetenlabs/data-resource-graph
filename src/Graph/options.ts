/**
 * @public
 */
export type BatchFunction = (callback: () => void) => void;

/**
 * @public
 */
export interface GraphOptions {
  /**
   * Function with the ability to batch all observations that take place in the same transaction and execution stack. This can
   * improve the performance of any side effects that happen as a result of node changes.
   *
   * If you're rendering data in React, this should probably be React's `batch()` function.
   */
  observationBatcher: BatchFunction;
}

const defaultBatchFunction: BatchFunction = (callback) => callback();

export const defaultOptions: GraphOptions = {
  observationBatcher: defaultBatchFunction,
};
