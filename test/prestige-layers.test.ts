import { describe, expect, it } from 'vitest';
import { ManualClock, SaveCorruptedError, createCore, createSave } from '../src/core/index.js';
import { prestigeLayers, resources } from '../src/mechanics/index.js';

function build() {
  const clock = new ManualClock(0);
  const game = createCore({
    clock,
    plugins: [
      resources({
        resources: { gold: { initial: 0 } },
        generators: {
          miner: { cost: { resource: 'gold', base: 1, growth: 1 }, produces: 'gold', rate: 1 },
        },
      }),
      prestigeLayers<'gold', 'miner', never, 'ascension' | 'transcendence'>({
        layers: {
          ascension: {
            basedOn: 'gold',
            gain: { threshold: 100 },
            bonuses: [{ target: { all: true }, perPoint: 1 }],
          },
          transcendence: {
            basedOn: { layer: 'ascension' },
            gain: { threshold: 4 },
            bonuses: [{ target: { all: true }, perPoint: 10 }],
          },
        },
      }),
    ],
  });
  return { clock, game };
}

describe('prestigeLayers', () => {
  it('lists layers lowest first and computes pending points per layer', () => {
    const { game } = build();
    expect(game.layerIds).toEqual(['ascension', 'transcendence']);
    expect(game.canAscend('ascension')).toBe(false);
    game.add('gold', 400); // sqrt(400 / 100) = 2
    expect(game.pendingLayer('ascension').toNumber()).toBe(2);
    expect(game.canAscend('ascension')).toBe(true);
    expect(game.canAscend('transcendence')).toBe(false);
  });

  it('ascending resets the run and grants points', () => {
    const { game } = build();
    const events: Array<[string, string, number]> = [];
    game.on('ascended', (e) => events.push([e.layer, e.gained.toString(), e.count]));
    game.add('gold', 400);
    game.buy('miner');
    expect(game.ascend('ascension')?.toNumber()).toBe(2);
    expect(game.layerPoints('ascension').toNumber()).toBe(2);
    expect(game.layerCount('ascension')).toBe(1);
    expect(game.amount('gold').isZero()).toBe(true);
    expect(game.bought('miner').isZero()).toBe(true);
    expect(events).toEqual([['ascension', '2e0', 1]]);
    expect(game.ascend('ascension')).toBeUndefined(); // nothing earned in the new run
  });

  it('a higher layer is based on what the lower one produced', () => {
    const { game } = build();
    for (let i = 0; i < 2; i++) {
      game.add('gold', 400);
      game.ascend('ascension'); // 2 + 2 points gained
    }
    // transcendence basis = 4 points gained, threshold 4 => sqrt(4 / 4) = 1
    expect(game.pendingLayer('transcendence').toNumber()).toBe(1);
    expect(game.ascend('transcendence')?.toNumber()).toBe(1);
    expect(game.layerPoints('transcendence').toNumber()).toBe(1);
  });

  it('ascending a higher layer wipes lower points but keeps their lifetime and count', () => {
    const { game } = build();
    for (let i = 0; i < 2; i++) {
      game.add('gold', 400);
      game.ascend('ascension');
    }
    expect(game.layerPoints('ascension').toNumber()).toBe(4);
    game.ascend('transcendence');
    expect(game.layerPoints('ascension').isZero()).toBe(true);
    expect(game.layerLifetime('ascension').toNumber()).toBe(4);
    expect(game.layerCount('ascension')).toBe(2);
    expect(game.pendingLayer('transcendence').isZero()).toBe(true); // basis was reset too
  });

  it('applies the bonuses of every layer to production', () => {
    const { game } = build();
    game.add('gold', 400);
    game.ascend('ascension'); // 2 points => x(1 + 2)
    game.add('gold', 1);
    game.buy('miner');
    expect(game.rate('gold').toNumber()).toBeCloseTo(3, 9);
  });

  it('can spend points without touching lifetime', () => {
    const { game } = build();
    game.add('gold', 400);
    game.ascend('ascension');
    expect(game.spendLayerPoints('ascension', 5)).toBe(false);
    expect(game.spendLayerPoints('ascension', 1)).toBe(true);
    expect(game.layerPoints('ascension').toNumber()).toBe(1);
    expect(game.layerLifetime('ascension').toNumber()).toBe(2);
    expect(() => game.spendLayerPoints('ascension', -1)).toThrow(RangeError);
  });

  it('honours resetsLower: false', () => {
    const game = createCore({
      clock: new ManualClock(0),
      plugins: [
        resources({ resources: { gold: {} } }),
        prestigeLayers<'gold', never, never, 'low' | 'high'>({
          layers: {
            low: { basedOn: 'gold', gain: { threshold: 1 } },
            high: { basedOn: 'gold', gain: { threshold: 1 }, resetsLower: false },
          },
        }),
      ],
    });
    game.add('gold', 4);
    game.ascend('low');
    game.add('gold', 4);
    game.ascend('high');
    expect(game.layerPoints('low').toNumber()).toBe(2);
  });

  it('round-trips through a save, bonuses included', () => {
    const a = build();
    a.game.add('gold', 400);
    a.game.ascend('ascension');
    a.game.add('gold', 1);
    a.game.buy('miner');
    const save = JSON.parse(JSON.stringify(a.game.save()));

    const b = build();
    b.game.load(save, { offline: false });
    expect(b.game.layerPoints('ascension').toNumber()).toBe(2);
    expect(b.game.layerCount('ascension')).toBe(1);
    expect(b.game.rate('gold').eq(a.game.rate('gold'))).toBe(true);
  });

  it('validates configuration, ids and saves', () => {
    const { game } = build();
    expect(() => game.layerPoints('nope' as 'ascension')).toThrow(/unknown layer/);
    expect(() =>
      createCore({
        plugins: [
          resources({ resources: { gold: {} } }),
          prestigeLayers({
            layers: {
              a: { basedOn: { layer: 'b' }, gain: { threshold: 1 } },
              b: { basedOn: 'gold', gain: { threshold: 1 } },
            },
          }),
        ],
      }),
    ).toThrow(/must be listed before/);
    const bad = [
      { ascension: 'x' },
      { ascension: { count: -1 } },
      { ascension: { points: 'nope' } },
      { ascension: { points: '-3' } },
      5,
    ];
    for (const entry of bad) {
      expect(() =>
        game.load(createSave(1, 0, { prestigeLayers: entry as never }), { offline: false }),
      ).toThrow(SaveCorruptedError);
    }
  });

  it('reset() clears every layer', () => {
    const { game } = build();
    game.add('gold', 400);
    game.ascend('ascension');
    game.reset();
    expect(game.layerPoints('ascension').isZero()).toBe(true);
    expect(game.layerCount('ascension')).toBe(0);
  });
});
