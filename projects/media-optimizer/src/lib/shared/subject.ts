/**
 * Minimal synchronous reactive primitive — a drop-in replacement for RxJS
 * `BehaviorSubject` with zero external dependencies.
 *
 * - Holds the current value and notifies all subscribers synchronously.
 * - New subscribers receive the current value immediately (BehaviorSubject semantics).
 * - The unsubscribe function returned by `subscribe()` is idempotent (safe to call
 *   more than once).
 *
 * @internal
 */
export class Subject<T> {
  private _value: T;
  private readonly _listeners = new Set<(value: T) => void>();

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  /** Returns the current value synchronously. */
  get value(): T {
    return this._value;
  }

  /**
   * Emits a new value and synchronously notifies all active listeners.
   *
   * A snapshot of the listener set is taken before iteration so that an
   * unsubscribe call inside a listener does not mutate the set mid-loop.
   */
  next(value: T): void {
    this._value = value;
    for (const fn of [...this._listeners]) {
      fn(value);
    }
  }

  /**
   * Subscribes to value changes.
   *
   * The callback is invoked **immediately** with the current value
   * (BehaviorSubject semantics), then on every subsequent `next()` call.
   *
   * @returns An unsubscribe function. Calling it more than once is a no-op.
   */
  subscribe(callback: (value: T) => void): () => void {
    this._listeners.add(callback);
    callback(this._value); // eager emit — BehaviorSubject behaviour
    let active = true;
    return (): void => {
      if (active) {
        active = false;
        this._listeners.delete(callback);
      }
    };
  }

  /** Removes all subscribers. */
  complete(): void {
    this._listeners.clear();
  }
}
