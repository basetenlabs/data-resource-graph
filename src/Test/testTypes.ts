// Temporarily needed until @types/jest@28 comes out, at which point we can use built-in expect.close2
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Expect {
      closeTo2(number: number, numDigits?: number): number;
    }
  }
}

export {};

expect.extend({
  closeTo2: (received: number, val: number) => {
    const pass = Math.abs(received - val) < 0.0000001;
    return {
      pass,
      message: () => `${received} !== ${val}`,
    };
  },
});
