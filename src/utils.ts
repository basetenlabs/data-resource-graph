import isNil from 'lodash/isNil';

export function takeFromSet<T>(set: Set<T>): T | undefined {
  for (const el of set) {
    set.delete(el);
    return el;
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
