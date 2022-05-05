/**
 * Simple wrapper on promise allowing resolution and rejection from outside the object
 */
export class Deferred<T> {
  private _reject!: (err?: unknown) => void;
  private _resolve!: (value: T | PromiseLike<T>) => void;
  private _isCompleted = false;
  public readonly promise: Promise<T>;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  public resolve(val: T | PromiseLike<T>): void {
    if (!this._isCompleted) {
      this._resolve(val);
      this._isCompleted = true;
    }
  }

  public reject(err?: unknown): void {
    if (!this._isCompleted) {
      this._reject(err);
      this._isCompleted = true;
    }
  }

  public get isCompleted(): boolean {
    return this._isCompleted;
  }
}
