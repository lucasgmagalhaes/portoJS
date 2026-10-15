import { describe, expect, it, vi } from 'vitest';
import { ManualClock, createGame, format } from '../src/index.js';

/**
 * Keeps the README example honest: it must keep compiling and behaving as documented.
 */
describe('README example', () => {
  it('runs as written', () => {
    const store = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    const clock = new ManualClock(0);
    const logs: string[] = [];
    const log = (message: string): void => void logs.push(message);

    const make = () =>
      createGame({
        clock,
        resources: { gold: { initial: 10 } },
        generators: {
          miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 1 },
        },
        offline: { maxMs: 8 * 3_600_000, efficiency: 0.5 },
      });

    const first = make();
    first.buy('miner', 'max');
    localStorage.setItem('save', first.exportSave());

    clock.advance(3_600_000);
    const game = make();
    game.on('offline', ({ appliedMs }) => log(`Welcome back! +${appliedMs / 1000}s of progress`));
    const saved = localStorage.getItem('save');
    if (saved) game.importSave(saved);
    expect(logs).toEqual(['Welcome back! +1800s of progress']);

    const spy = vi.fn();
    game.on('tick', spy);
    clock.advance(100);
    game.update();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(format(game.amount('gold'), { notation: 'suffix' })).toMatch(/^[\d.]+[A-Za-z]*$/);
  });
});
