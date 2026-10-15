import { describe, expect, it, vi } from 'vitest';
import {
  Component,
  Game,
  GameEvent,
  Generator,
  ManualClock,
  Resource,
  SaveCorruptedError,
  format,
} from '../src/index.js';
import type { JsonValue } from '../src/index.js';

describe('README examples', () => {
  it('runs the minimal example as written', () => {
    const store = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    const clock = new ManualClock(0);
    const logs: string[] = [];
    const log = (message: string): void => void logs.push(message);

    const make = () => {
      const game = new Game({ clock, offline: { maxMs: 8 * 3_600_000, efficiency: 0.5 } });
      const gold = game.createObject('Gold').addComponent(Resource, { initial: 10 });
      const miner = game.createObject('Miner').addComponent(Generator, {
        cost: { resource: gold, base: 10, growth: 1.15 },
        produces: gold,
        rate: 1,
      });
      return { game, gold, miner };
    };

    const first = make();
    first.miner.buy('max');
    localStorage.setItem('save', first.game.exportSave());

    clock.advance(3_600_000);
    const { game, gold } = make();
    game.on('offline', ({ appliedMs }) => log(`Welcome back! +${appliedMs / 1000}s of progress`));
    const saved = localStorage.getItem('save');
    if (saved) game.importSave(saved);
    expect(logs).toEqual(['Welcome back! +1800s of progress']);

    const spy = vi.fn();
    game.on('tick', spy);
    clock.advance(100);
    game.update();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(format(gold.amount, { notation: 'suffix' })).toMatch(/^[\d.]+[A-Za-z]*$/);
  });

  it('runs the custom component example as written', () => {
    class Health extends Component {
      static override typeId = 'Health';
      readonly died = new GameEvent();
      hp = 100;

      override fixedUpdate(deltaTime: number): void {
        this.hp -= 5 * deltaTime;
        if (this.hp <= 0) this.died.invoke();
      }

      override onSave() {
        return this.hp;
      }

      override onLoad(data?: JsonValue) {
        if (data !== undefined && typeof data !== 'number') {
          throw new SaveCorruptedError('Health: expected a number');
        }
        this.hp = data ?? 100;
      }
    }

    const clock = new ManualClock(0);
    const game = new Game({ clock, stepMs: 1000 });
    const health = game.createObject('Player').addComponent(Health);
    let deaths = 0;
    health.died.addListener(() => {
      deaths++;
    });
    game.advance(10_000);
    expect(health.hp).toBeCloseTo(50, 9);
    const save = game.save();
    health.hp = 1;
    game.load(save, { offline: false });
    expect(health.hp).toBeCloseTo(50, 9);
    game.advance(10_000);
    game.advance(10_000);
    expect(deaths).toBeGreaterThan(0);
  });
});
