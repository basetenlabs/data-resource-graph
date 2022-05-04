export type BatchFunction = (callback: () => void) => void;

export interface GraphOptions {
  observationBatcher: BatchFunction;
}

const defaultBatchFunction: BatchFunction = (callback) => callback();

export const defaultOptions: GraphOptions = {
  observationBatcher: defaultBatchFunction,
};
