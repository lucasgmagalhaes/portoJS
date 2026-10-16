/**
 * Runs at most `limit` tasks at a time and queues the rest in order.
 *
 * @internal
 */
export class Limiter {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<A, T>(task: (argument: A) => Promise<T>, argument: A): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>(this.enqueue);
    else this.active += 1;
    try {
      return await task(argument);
    } finally {
      const next = this.queue.shift();
      if (next === undefined) this.active -= 1;
      else next();
    }
  }

  private readonly enqueue = (resolve: () => void): void => {
    this.queue.push(resolve);
  };
}
