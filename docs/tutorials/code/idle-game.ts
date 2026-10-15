import { Game, Generator, ManualClock, Prestige, Resource, Upgrade, format } from 'portojs';

const HOUR = 3_600_000;

/**
 * Step 1: a game, a resource and one generator that produces it.
 */
export function createIdleGame(clock = new ManualClock(0)) {
  const game = new Game({ clock, offline: { maxMs: 8 * HOUR, efficiency: 0.5 } });

  const gold = game.createObject('Gold').addComponent(Resource, { initial: 10 });

  const miner = game.createObject('Miner').addComponent(Generator, {
    cost: { resource: gold, base: 10, growth: 1.15 },
    produces: gold,
    rate: 1,
  });

  const mine = game.createObject('Mine').addComponent(Generator, {
    cost: { resource: gold, base: 200, growth: 1.2 },
    produces: miner,
    rate: 0.1,
  });

  const pickaxe = game.createObject('Pickaxe').addComponent(Upgrade, {
    cost: { resource: gold, base: 100, growth: 3 },
    maxLevel: 5,
    effects: [{ generator: miner, multiplier: 2 }],
  });

  const rebirth = game.createObject('Rebirth').addComponent(Prestige, {
    basedOn: gold,
    gain: { threshold: 1e6 },
    bonuses: [{ generator: miner, perPoint: 0.1 }],
  });

  return { game, clock, gold, miner, mine, pickaxe, rebirth };
}

/**
 * Step 2: show numbers the way players read them.
 */
export function label(amount: Parameters<typeof format>[0]): string {
  return format(amount, { notation: 'suffix' });
}

/**
 * Step 3: play for a while with a simple strategy, then leave and come back.
 */
export function playSession() {
  const { game, clock, gold, miner, pickaxe } = createIdleGame();
  miner.buy();

  for (let second = 0; second < 120; second++) {
    clock.advance(1000);
    game.update();
    if (pickaxe.canBuy()) pickaxe.buy();
    if (miner.canBuy()) miner.buy('max');
  }
  const beforeLeaving = gold.amount;
  const save = game.exportSave();

  const later = new ManualClock(clock.now() + 2 * HOUR);
  const returning = createIdleGame(later);
  returning.game.importSave(save);
  return {
    beforeLeaving: label(beforeLeaving),
    afterReturning: label(returning.gold.amount),
    minersOwned: returning.miner.count.toNumber(),
    pickaxeLevel: returning.pickaxe.level,
  };
}
