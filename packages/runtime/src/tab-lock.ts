/**
 * The part of the Web Locks API that {@link TabLock} uses (`navigator.locks`).
 */
export interface LockManagerLike {
  request(
    name: string,
    options: { readonly ifAvailable?: boolean },
    callback: (lock: unknown) => Promise<unknown> | undefined,
  ): Promise<unknown>;
}

/**
 * Options of a {@link TabLock}.
 */
export interface TabLockOptions {
  /**
   * The lock name, shared by every tab of the same game. Default `portojs-game`.
   */
  readonly name?: string;
  /**
   * Replaces `navigator.locks`, for tests.
   */
  readonly locks?: LockManagerLike | undefined;
}

function defaultLocks(): LockManagerLike | undefined {
  const navigatorLike = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator;
  return navigatorLike?.locks;
}

/**
 * Lets only one tab play a game at a time, so two tabs do not overwrite each other's saves. The
 * first tab to {@link TabLock.acquire} gets it; the lock is released when the tab closes or when
 * you call {@link TabLock.release}. Built on the Web Locks API; where it is missing the lock
 * cannot be enforced and `acquire` always succeeds.
 *
 * @example
 * const lock = new TabLock({ name: 'my-game' });
 * if (!(await lock.acquire())) {
 *   showMessage('The game is open in another tab.');
 *   await lock.acquire({ wait: true }); // continue when the other tab closes
 * }
 * startGame();
 */
export class TabLock {
  private readonly name: string;
  private readonly locks: LockManagerLike | undefined;
  private release_: (() => void) | undefined;

  constructor(options: TabLockOptions = {}) {
    this.name = options.name ?? 'portojs-game';
    this.locks = 'locks' in options ? options.locks : defaultLocks();
  }

  /**
   * Whether the Web Locks API is available, so the lock can really be enforced.
   */
  get supported(): boolean {
    return this.locks !== undefined;
  }

  /**
   * Whether this tab holds the lock now.
   */
  get held(): boolean {
    return this.release_ !== undefined;
  }

  /**
   * Tries to take the lock.
   *
   * @param options `wait: true` waits until the other tab lets go instead of giving up.
   * @returns `true` when this tab holds the lock, `false` when another tab does.
   */
  acquire(options: { readonly wait?: boolean } = {}): Promise<boolean> {
    if (this.held) return Promise.resolve(true);
    const locks = this.locks;
    if (locks === undefined) {
      this.release_ = noop;
      return Promise.resolve(true);
    }
    return new Promise(this.requester(locks, options.wait !== true));
  }

  /**
   * Lets go of the lock so another tab can take it. Does nothing if this tab does not hold it.
   */
  release(): void {
    const release = this.release_;
    this.release_ = undefined;
    release?.();
  }

  private requester(
    locks: LockManagerLike,
    onlyIfAvailable: boolean,
  ): (resolve: (held: boolean) => void) => void {
    return (resolve) => {
      void locks.request(this.name, { ifAvailable: onlyIfAvailable }, this.grant(resolve));
    };
  }

  private grant(resolve: (held: boolean) => void): (lock: unknown) => Promise<void> | undefined {
    return (lock) => {
      if (lock === null || lock === undefined) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise<void>(this.keep);
    };
  }

  private readonly keep = (resolve: () => void): void => {
    this.release_ = resolve;
  };
}

function noop(): void {
  return;
}
