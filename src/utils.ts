import assert from 'assert';
import isNil from 'lodash/isNil';
import { BatchFunction } from './Graph/options';

export function takeFromSet<T>(set: Set<T>): T | undefined {
  for (const el of set) {
    set.delete(el);
    return el;
  }

  return undefined;
}

export function takeFromSetIf<T>(set: Set<T>, predicate: (el: T) => boolean): T | undefined {
  for (const el of set) {
    if (predicate(el)) {
      set.delete(el);
      return el;
    }
  }

  return undefined;
}

export function shallowEquals<T>(arr1: T[], arr2: T[]): boolean {
  if (arr1 === arr2) return true;

  if (arr1.length !== arr2.length) return false;

  return arr1.every((val, idx) => val === arr2[idx]);
}

/**
 * This function should be called to ensure all possible cases have been exhausted according to type information,
 * e.g. in the default case of a switch statement
 * @param condition The exhausted expression
 */
export function unreachable(condition: never): never {
  throw new Error(`Not expecting condition: ${condition}`);
}

export function assertDefined<T>(val: T | null | undefined): T {
  if (isNil(val)) {
    throw new Error(`Expected defined but got ${val}`);
  }

  return val;
}

export const assertRunOnce =
  (batcher: BatchFunction): BatchFunction =>
  (callback: () => void) => {
    let wasRunTimes = 0;
    batcher(() => {
      wasRunTimes++;
      callback();
    });
    assert(wasRunTimes === 1, 'Expected batcher to run callback exactly 1 time');
  };

export function someIterable<T>(iterable: Iterable<T>, predicate: (t: T) => boolean): boolean {
  for (const t of iterable) {
    if (predicate(t)) return true;
  }

  return false;
}

/**
 * Simple wrapper on promise allowing resolution and rejection from outside the object
 */
export class DeferredPromise<T> extends Promise<T> {
  public reject!: (err?: unknown) => void;
  public resolve!: (value: T) => void;

  constructor() {
    let resolve: any;
    let reject: any;
    super((resolve1, reject1) => {
      resolve = resolve1;
      reject = reject1;
    });

    this.resolve = resolve;
    this.reject = reject;
  }
}
