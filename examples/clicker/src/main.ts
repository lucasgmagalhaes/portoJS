import {
  Achievement,
  Economy,
  Game,
  Generator,
  Prestige,
  Resource,
  SaveCorruptedError,
  SaveVersionError,
  Upgrade,
  format,
} from 'portojs';
import type { BigNum, BulkAmount } from 'portojs';
import './style.css';

const SAVE_KEY = 'portojs-clicker-save';
const HOUR = 3_600_000;

const game = new Game({ offline: { maxMs: 8 * HOUR, efficiency: 0.5 } });
const gold = game.createObject('Gold').addComponent(Resource);

const generatorSpecs = [
  ['Cursor', 15, 0.2],
  ['Grandma', 100, 1],
  ['Farm', 1_100, 8],
  ['Mine', 12_000, 47],
  ['Factory', 130_000, 260],
] as const;

const generators = generatorSpecs.map(([name, base, rate]) =>
  game.createObject(name).addComponent(Generator, {
    cost: { resource: gold, base, growth: 1.15 },
    produces: gold,
    rate,
  }),
);
const [cursor, grandma, farm, mine] = generators as [Generator, Generator, Generator, Generator];

const upgradeSpecs = [
  ['Steel cursors', 'Cursors produce twice as much', 100, cursor],
  ['Secret recipes', 'Grandmas produce twice as much', 1_000, grandma],
  ['Fertilizer', 'Farms produce twice as much', 11_000, farm],
  ['Deep drills', 'Mines produce twice as much', 120_000, mine],
] as const;

const upgrades = upgradeSpecs.map(([name, , price, target]) =>
  game.createObject(name).addComponent(Upgrade, {
    cost: { resource: gold, base: price, growth: 1 },
    effects: [{ generator: target, multiplier: 2 }],
  }),
);
upgrades.push(
  game.createObject('Synergy').addComponent(Upgrade, {
    cost: { resource: gold, base: 500, growth: 5 },
    maxLevel: 6,
    effects: [{ all: true, multiplier: 1.25 }],
  }),
);
const upgradeDescriptions = [
  ...upgradeSpecs.map(([, description]) => description),
  'All production +25% per level',
];

const prestige = game.createObject('Ascension').addComponent(Prestige, {
  basedOn: gold,
  gain: { threshold: 1e6 },
  bonuses: [{ all: true, perPoint: 0.1 }],
});

const achievementSpecs = [
  ['First gold', () => gold.earned.gte(1)],
  ['Earn 100 gold in a run', () => gold.earned.gte(100)],
  ['Earn 1 million gold in a run', () => gold.earned.gte(1e6)],
  ['Earn 1 billion gold in a run', () => gold.earned.gte(1e9)],
  ['Own 10 grandmas', () => grandma.bought.gte(10)],
  ['Ascend for the first time', () => prestige.count >= 1],
] as const;

const achievements = achievementSpecs.map(([name, condition]) =>
  game.createObject(name).addComponent(Achievement, { condition, checkIntervalMs: 500 }),
);

const economy = Economy.of(game);

type Props = { className?: string; text?: string; id?: string };

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className !== undefined) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.id !== undefined) node.id = props.id;
  node.append(...children);
  return node;
}

const fmt = (n: BigNum): string => format(n, { notation: 'suffix', precision: 2 });

let toastTimer: number | undefined;
const toastEl = h('div', { id: 'toast' });
function toast(message: string): void {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3500);
}

const goldEl = h('div', { className: 'gold' });
const rateEl = h('div', { className: 'rate' });
const clickBtn = h('button', { id: 'click', text: 'Mine gold' });

let mode: BulkAmount = 1;
const modes: Array<[string, BulkAmount]> = [
  ['x1', 1],
  ['x10', 10],
  ['Max', 'max'],
];
const modeButtons = modes.map(([label, value]) => {
  const button = h('button', { text: label });
  button.addEventListener('click', () => {
    mode = value;
    render();
  });
  return { button, value };
});

const generatorRows = generators.map((generator) => {
  const name = h('strong');
  const meta = h('div', { className: 'meta' });
  const buy = h('button');
  buy.addEventListener('click', () => {
    generator.buy(mode);
    render();
  });
  return {
    generator,
    name,
    meta,
    buy,
    row: h('div', { className: 'row' }, [h('div', {}, [name, meta]), buy]),
  };
});

const upgradeRows = upgrades.map((upgrade, index) => {
  const meta = h('div', { className: 'meta' });
  const buy = h('button');
  buy.addEventListener('click', () => {
    upgrade.buy();
    render();
  });
  return {
    upgrade,
    meta,
    buy,
    row: h('div', { className: 'row' }, [
      h('div', {}, [
        h('strong', { text: upgrade.gameObject.name }),
        h('div', { className: 'meta', text: upgradeDescriptions[index] ?? '' }),
        meta,
      ]),
      buy,
    ]),
  };
});

const prestigeInfo = h('div', { className: 'meta' });
const prestigeBtn = h('button');
prestigeBtn.addEventListener('click', () => {
  const question = `Ascend now for ${fmt(prestige.pending)} prestige points? Your run resets.`;
  if (!window.confirm(question)) return;
  prestige.perform();
  render();
});

const achievementRows = achievements.map((achievement) => {
  const mark = h('span');
  const row = h('div', { className: 'achievement' }, [
    h('span', { text: achievement.gameObject.name }),
    mark,
  ]);
  return { achievement, mark, row };
});

const saveText = h('textarea');
saveText.placeholder = 'Exported save appears here. Paste a save and press Import.';
const exportBtn = h('button', { text: 'Export' });
const importBtn = h('button', { text: 'Import' });
const resetBtn = h('button', { text: 'Wipe save' });

const app = document.querySelector<HTMLElement>('#app');
if (app === null) throw new Error('#app not found');
app.append(
  h('section', { className: 'hero' }, [
    h('h1', { text: 'PortoJS clicker' }),
    goldEl,
    rateEl,
    clickBtn,
  ]),
  h('section', {}, [
    h('h2', { text: 'Generators' }),
    h(
      'div',
      { className: 'modes' },
      modeButtons.map((m) => m.button),
    ),
    ...generatorRows.map((g) => g.row),
  ]),
  h('section', {}, [h('h2', { text: 'Upgrades' }), ...upgradeRows.map((u) => u.row)]),
  h('section', {}, [
    h('h2', { text: 'Prestige' }),
    prestigeInfo,
    h('div', { className: 'tools' }, [prestigeBtn]),
  ]),
  h('section', {}, [h('h2', { text: 'Achievements' }), ...achievementRows.map((a) => a.row)]),
  h('section', {}, [
    h('h2', { text: 'Save' }),
    saveText,
    h('div', { className: 'tools' }, [exportBtn, importBtn, resetBtn]),
  ]),
  toastEl,
);

function render(): void {
  goldEl.textContent = fmt(gold.amount);
  rateEl.textContent = `${fmt(gold.rate)} per second`;

  for (const { button, value } of modeButtons) {
    button.setAttribute('aria-pressed', String(value === mode));
  }
  for (const g of generatorRows) {
    const { generator } = g;
    g.name.textContent = `${generator.gameObject.name} (${fmt(generator.count)})`;
    g.meta.textContent = `Next: ${fmt(generator.costOf(mode))}`;
    g.buy.textContent = mode === 'max' ? `Buy ${fmt(generator.maxAffordable)}` : `Buy ${mode}`;
    g.buy.disabled = !generator.canBuy(mode);
  }
  for (const u of upgradeRows) {
    const { upgrade } = u;
    const cost = upgrade.cost;
    u.meta.textContent = `Level ${upgrade.level}${cost === undefined ? ' (max)' : ` · ${fmt(cost)}`}`;
    u.buy.textContent = cost === undefined ? 'Maxed' : 'Buy';
    u.buy.disabled = !upgrade.canBuy();
  }
  prestigeInfo.textContent =
    `Points: ${fmt(prestige.points)} (+${(prestige.points.toNumber() * 10).toFixed(0)}% production). ` +
    `Ascending now grants ${fmt(prestige.pending)}.`;
  prestigeBtn.textContent = 'Ascend';
  prestigeBtn.disabled = !prestige.canPrestige;
  for (const a of achievementRows) {
    const done = a.achievement.isUnlocked;
    a.row.classList.toggle('unlocked', done);
    a.mark.textContent = done ? 'Unlocked' : 'Locked';
  }
}

game.on('tick', render);
for (const achievement of achievements) {
  achievement.unlocked.addListener(() => toast(`Achievement: ${achievement.gameObject.name}`));
}
prestige.performed.addListener(({ gained }) => toast(`Ascended! +${fmt(gained)} prestige points`));
economy.offlineGains.addListener(({ elapsedMs, gains }) => {
  const earned = gains.get(gold);
  if (earned === undefined || earned.isZero()) return;
  toast(`Welcome back! ${(elapsedMs / 60_000).toFixed(0)} min away earned ${fmt(earned)} gold.`);
});

clickBtn.addEventListener('click', () => {
  gold.add(economy.multiplierOf({ all: true }));
  render();
});

function persist(): void {
  localStorage.setItem(SAVE_KEY, game.exportSave());
}

function describe(error: unknown): string {
  if (error instanceof SaveCorruptedError) return 'That save is damaged or was edited.';
  if (error instanceof SaveVersionError) return 'That save comes from a different game version.';
  return 'Could not load that save.';
}

exportBtn.addEventListener('click', () => {
  saveText.value = game.exportSave();
  saveText.select();
});
importBtn.addEventListener('click', () => {
  try {
    game.importSave(saveText.value);
    persist();
    toast('Save imported');
  } catch (error) {
    toast(describe(error));
  }
  render();
});
resetBtn.addEventListener('click', () => {
  if (!window.confirm('Wipe your save and start over?')) return;
  game.reset();
  localStorage.removeItem(SAVE_KEY);
  render();
});

window.setInterval(persist, 5000);
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
});

const stored = localStorage.getItem(SAVE_KEY);
if (stored !== null) {
  try {
    game.importSave(stored);
  } catch (error) {
    toast(`${describe(error)} Starting fresh.`);
  }
}

render();
game.start();
