import { Autosave, Economy, Game, Generator, Resource, WebSaveStorage, format } from 'portojs';

const HOUR = 3_600_000;

// Offline progress: up to 8 hours are credited when the player comes back, at half speed.
const game = new Game({ offline: { maxMs: 8 * HOUR, efficiency: 0.5 } });
game.createObject('Economy').addComponent(Economy);

const gold = game.createObject('Gold').addComponent(Resource);
const miner = game.createObject('Miner').addComponent(Generator, {
  cost: { resource: gold, base: 10, growth: 1.15 },
  produces: gold,
  rate: 1,
});

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Missing #${id}`);
  return found;
}

const goldText = element('gold');
const rateText = element('rate');
const buyButton = element('buy') as HTMLButtonElement;
const awayText = element('away');

element('click').addEventListener('click', () => gold.add(1));
buyButton.addEventListener('click', () => miner.buy(1));

game.on('tick', () => {
  goldText.textContent = `${format(gold.amount, { notation: 'suffix' })} gold`;
  rateText.textContent = `${format(gold.rate, { notation: 'suffix' })} per second`;
  buyButton.textContent = `Buy miner (${miner.count.toString()}) for ${format(miner.nextCost, { notation: 'suffix' })}`;
  buyButton.disabled = !miner.canBuy(1);
});

Economy.of(game).offlineSummary.addListener(({ source, status, elapsedMs, gains }) => {
  const earned = gains.get(gold);
  if (source !== 'load' || earned === undefined || earned.isZero()) return;
  const minutes = Math.round(elapsedMs / 60_000);
  const capped = status === 'capped' ? ' (the maximum)' : '';
  awayText.textContent = `Welcome back! In ${minutes} minutes${capped} you earned ${format(earned, { notation: 'suffix' })} gold.`;
  awayText.hidden = false;
});

// Save every 10 seconds, keep two backups, and save when the tab is hidden.
const autosave = new Autosave(game, new WebSaveStorage(localStorage), {
  key: '{{name}}-save',
  intervalMs: 10_000,
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void autosave.save();
});

try {
  await autosave.load();
} catch (error) {
  console.warn('Starting a new game: the save could not be read.', error);
}
autosave.start();
game.start();
