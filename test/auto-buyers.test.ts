import { describe, expect, it } from 'vitest';
import { ManualClock, SaveCorruptedError, createCore, createSave } from '../src/core/index.js';
import { autoBuyers, resources, unlocks } from '../src/mechanics/index.js';

function build() {
  const clock = new ManualClock(0);
  const game = createCore({
    clock,
    plugins: [
      resources({
        resources: { gold: { initial: 1000 } },
        generators: {
          miner: { cost: { resource: 'gold', base: 10, growth: 1 }, produces: 'gold', rate: 1 },
          drill: { cost: { resource: 'gold', base: 10, growth: 1 }, produces: 'gold', rate: 5 },
        },
      }),
      unlocks<'gold', 'drill', never, 'tier2'>({
        definitions: {
          tier2: { condition: (g) => g.earned('gold').gte(1e9), generators: ['drill'] },
        },
      }),
      autoBuyers({
        buyers: {
          minerBot: { generator: 'miner', amount: 2, everyMs: 1000, enabled: true },
          drillBot: { generator: 'drill', everyMs: 500 },
        },
      }),
    ],
  });
  return { clock, game };
}

describe('autoBuyers', () => {
  it('buys on its own interval while enabled', () => {
    const { clock, game } = build();
    const events: string[] = [];
    game.on('autoBuy', (e) => events.push(`${e.id}:${e.amount.toNumber()}`));
    clock.advance(999);
    game.update();
    expect(game.bought('miner').isZero()).toBe(true);
    clock.advance(1);
    game.update();
    expect(game.bought('miner').toNumber()).toBe(2);
    clock.advance(3000);
    game.update();
    expect(game.bought('miner').toNumber()).toBe(8);
    expect(events).toEqual(['minerBot:2', 'minerBot:2', 'minerBot:2', 'minerBot:2']);
  });

  it('can be switched on and off, with typed ids', () => {
    const { clock, game } = build();
    expect(game.isAutoBuyerEnabled('drillBot')).toBe(false);
    clock.advance(2000);
    game.update();
    expect(game.bought('drill').isZero()).toBe(true);
    game.setAutoBuyer('minerBot', false);
    clock.advance(5000);
    const before = game.bought('miner');
    game.update();
    expect(game.bought('miner').eq(before)).toBe(true);
    expect(game.autoBuyerIds).toEqual(['minerBot', 'drillBot']);
    expect(() => game.setAutoBuyer('nope' as 'minerBot', true)).toThrow(/unknown auto-buyer/);
  });

  it('respects purchase guards from other plugins', () => {
    const { clock, game } = build();
    game.setAutoBuyer('drillBot', true);
    clock.advance(2000);
    game.update();
    expect(game.bought('drill').isZero()).toBe(true); // locked by "tier2"
    expect(game.bought('miner').toNumber()).toBe(4);
  });

  it('stops quietly when it cannot afford anything', () => {
    const { clock, game } = build();
    game.spend('gold', 1000);
    let bought = 0;
    game.on('autoBuy', () => bought++);
    clock.advance(5000);
    game.update();
    expect(bought).toBe(0);
  });

  it('persists switches and timers', () => {
    const a = build();
    a.game.setAutoBuyer('drillBot', true);
    a.game.setAutoBuyer('minerBot', false);
    a.clock.advance(300);
    a.game.update();
    const save = JSON.parse(JSON.stringify(a.game.save()));

    const b = build();
    b.game.load(save, { offline: false });
    expect(b.game.isAutoBuyerEnabled('drillBot')).toBe(true);
    expect(b.game.isAutoBuyerEnabled('minerBot')).toBe(false);
  });

  it('resets to configured defaults', () => {
    const { game } = build();
    game.setAutoBuyer('minerBot', false);
    game.reset();
    expect(game.isAutoBuyerEnabled('minerBot')).toBe(true);
  });

  it('does not act while the player is away', () => {
    const { game } = build();
    game.simulateOffline(60_000);
    expect(game.bought('miner').isZero()).toBe(true);
  });

  it('rejects corrupted data and bad options', () => {
    const { game } = build();
    const bad = [
      { minerBot: { enabled: 'yes', elapsed: 0 } },
      { minerBot: { enabled: true, elapsed: -1 } },
      5,
    ];
    for (const entry of bad) {
      expect(() =>
        game.load(createSave(1, 0, { autoBuyers: entry as never }), { offline: false }),
      ).toThrow(SaveCorruptedError);
    }
    expect(() =>
      createCore({
        plugins: [
          resources({ resources: { gold: {} } }),
          autoBuyers({ buyers: { b: { generator: 'x', everyMs: 0 } } }),
        ],
      }),
    ).toThrow(RangeError);
  });
});
