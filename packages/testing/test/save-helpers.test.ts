import { Generator, Resource } from '@portojs/idle';
import { Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { createTestGame, roundTrip, stableSave } from '../src/index.ts';

function build(): { game: Game; gold: Resource } {
  const { game } = createTestGame();
  const gold = game.createObject('Gold').addComponent(Resource);
  game.createObject('Miner').addComponent(Generator, {
    cost: { resource: gold, base: 10, growth: 1.15 },
    produces: gold,
    rate: 1,
    initial: 1,
  });
  return { game, gold };
}

describe('stableSave', () => {
  it('is the same for the same state at different times', () => {
    const a = createTestGame();
    const b = createTestGame();
    for (const test of [a, b]) {
      test.game.createObject('Gold').addComponent(Resource, { initial: 5 });
    }
    a.clock.advance(12_345);
    expect(stableSave(a.game)).toEqual(stableSave(b.game));
  });

  it('changes when the state changes', () => {
    const { game, gold } = build();
    const before = stableSave(game);
    gold.add(10);
    expect(stableSave(game)).not.toEqual(before);
  });
});

describe('roundTrip', () => {
  it('rebuilds the state in a fresh game', () => {
    const { game, gold } = build();
    game.advance(5000);
    gold.add(100);
    const copy = roundTrip(game, () => build().game);
    expect(stableSave(copy)).toEqual(stableSave(game));
    expect(copy).not.toBe(game);
  });

  it('does not credit offline time while copying', () => {
    const { game } = build();
    const { clock } = createTestGame();
    clock.advance(1_000_000);
    const copy = roundTrip(game, () => build().game);
    expect(stableSave(copy)).toEqual(stableSave(game));
  });
});
