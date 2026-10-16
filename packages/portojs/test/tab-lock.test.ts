import { describe, expect, it } from 'vitest';
import { TabLock } from '../src/index.ts';
import type { LockManagerLike } from '../src/index.ts';

/**
 * A fake Web Locks manager shared by "tabs": a lock is held while the callback's promise is
 * pending, and waiting requests are served in order.
 */
class FakeLocks implements LockManagerLike {
  private held = new Set<string>();
  private readonly waiting = new Map<string, (() => void)[]>();

  async request(
    name: string,
    options: { readonly ifAvailable?: boolean },
    callback: (lock: unknown) => Promise<unknown> | undefined,
  ): Promise<unknown> {
    if (this.held.has(name)) {
      if (options.ifAvailable === true) return callback(null);
      await new Promise<void>((resolve) => {
        const queue = this.waiting.get(name) ?? [];
        queue.push(resolve);
        this.waiting.set(name, queue);
      });
    }
    this.held.add(name);
    try {
      return await callback({ name });
    } finally {
      this.held.delete(name);
      this.waiting.get(name)?.shift()?.();
    }
  }
}

describe('TabLock', () => {
  it('lets the first tab in and keeps the second one out', async () => {
    const locks = new FakeLocks();
    const first = new TabLock({ locks });
    const second = new TabLock({ locks });
    expect(await first.acquire()).toBe(true);
    expect(first.held).toBe(true);
    expect(await second.acquire()).toBe(false);
    expect(second.held).toBe(false);
  });

  it('hands the lock over after release', async () => {
    const locks = new FakeLocks();
    const first = new TabLock({ locks });
    const second = new TabLock({ locks });
    await first.acquire();
    first.release();
    first.release();
    expect(first.held).toBe(false);
    await Promise.resolve();
    expect(await second.acquire()).toBe(true);
  });

  it('can wait for the other tab to let go', async () => {
    const locks = new FakeLocks();
    const first = new TabLock({ locks });
    const second = new TabLock({ locks });
    await first.acquire();
    const waiting = second.acquire({ wait: true });
    let granted = false;
    void waiting.then(() => (granted = true));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(granted).toBe(false);
    first.release();
    expect(await waiting).toBe(true);
    expect(second.held).toBe(true);
  });

  it('is idempotent while held and separates different names', async () => {
    const locks = new FakeLocks();
    const a = new TabLock({ locks, name: 'a' });
    const b = new TabLock({ locks, name: 'b' });
    expect(await a.acquire()).toBe(true);
    expect(await a.acquire()).toBe(true);
    expect(await b.acquire()).toBe(true);
  });

  it('always succeeds where the Web Locks API is missing', async () => {
    const lock = new TabLock({ locks: undefined });
    expect(lock.supported).toBe(false);
    expect(await lock.acquire()).toBe(true);
    expect(lock.held).toBe(true);
    lock.release();
    expect(lock.held).toBe(false);
  });

  it('reads navigator.locks by default', () => {
    expect(new TabLock().supported).toBe(
      (globalThis as { navigator?: { locks?: unknown } }).navigator?.locks !== undefined,
    );
  });
});
