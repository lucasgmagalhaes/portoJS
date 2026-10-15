import { SaveCorruptedError, SaveVersionError, createGame, format } from 'portojs';
import type { BigNum, BulkAmount } from 'portojs';
import './style.css';

const SAVE_KEY = 'portojs-clicker-save';
const HOUR = 3_600_000;

const game = createGame({
  resources: { gold: { initial: 0 } },
  generators: {
    cursor: { cost: { resource: 'gold', base: 15, growth: 1.15 }, produces: 'gold', rate: 0.2 },
    grandma: { cost: { resource: 'gold', base: 100, growth: 1.15 }, produces: 'gold', rate: 1 },
    farm: { cost: { resource: 'gold', base: 1_100, growth: 1.15 }, produces: 'gold', rate: 8 },
    mine: { cost: { resource: 'gold', base: 12_000, growth: 1.15 }, produces: 'gold', rate: 47 },
    factory: {
      cost: { resource: 'gold', base: 130_000, growth: 1.15 },
      produces: 'gold',
      rate: 260,
    },
  },
  upgrades: {
    steelCursors: {
      cost: { resource: 'gold', base: 100, growth: 1 },
      effects: [{ generator: 'cursor', multiplier: 2 }],
    },
    secretRecipes: {
      cost: { resource: 'gold', base: 1_000, growth: 1 },
      effects: [{ generator: 'grandma', multiplier: 2 }],
    },
    fertilizer: {
      cost: { resource: 'gold', base: 11_000, growth: 1 },
      effects: [{ generator: 'farm', multiplier: 2 }],
    },
    deepDrills: {
      cost: { resource: 'gold', base: 120_000, growth: 1 },
      effects: [{ generator: 'mine', multiplier: 2 }],
    },
    synergy: {
      cost: { resource: 'gold', base: 500, growth: 5 },
      maxLevel: 6,
      effects: [{ all: true, multiplier: 1.25 }],
    },
  },
  prestige: {
    basedOn: 'gold',
    gain: { threshold: 1e6 },
    bonuses: [{ target: { all: true }, perPoint: 0.1 }],
  },
  achievements: {
    firstGold: { condition: (g) => g.earned('gold').gte(1) },
    hundred: { condition: (g) => g.earned('gold').gte(100) },
    million: { condition: (g) => g.earned('gold').gte(1e6) },
    billion: { condition: (g) => g.earned('gold').gte(1e9) },
    bakery: { condition: (g) => g.bought('grandma').gte(10) },
    ascended: { condition: (g) => g.prestigeCount() >= 1 },
  },
  achievementCheckIntervalMs: 500,
  offline: { maxMs: 8 * HOUR, efficiency: 0.5 },
});

const generatorLabels = {
  cursor: 'Cursor',
  grandma: 'Grandma',
  farm: 'Farm',
  mine: 'Mine',
  factory: 'Factory',
} as const;

const upgradeLabels = {
  steelCursors: ['Steel cursors', 'Cursors produce twice as much'],
  secretRecipes: ['Secret recipes', 'Grandmas produce twice as much'],
  fertilizer: ['Fertilizer', 'Farms produce twice as much'],
  deepDrills: ['Deep drills', 'Mines produce twice as much'],
  synergy: ['Synergy', 'All production +25% per level'],
} as const;

const achievementLabels = {
  firstGold: 'First gold',
  hundred: 'Earn 100 gold in a run',
  million: 'Earn 1 million gold in a run',
  billion: 'Earn 1 billion gold in a run',
  bakery: 'Own 10 grandmas',
  ascended: 'Ascend for the first time',
} as const;

type Props = { className?: string; text?: string; id?: string; type?: string };

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className !== undefined) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.id !== undefined) node.id = props.id;
  if (props.type !== undefined) node.setAttribute('type', props.type);
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

const generatorRows = game.generatorIds.map((id) => {
  const name = h('strong');
  const meta = h('div', { className: 'meta' });
  const buy = h('button');
  buy.addEventListener('click', () => {
    game.buy(id, mode);
    render();
  });
  return {
    id,
    name,
    meta,
    buy,
    row: h('div', { className: 'row' }, [h('div', {}, [name, meta]), buy]),
  };
});

const upgradeRows = game.upgradeIds.map((id) => {
  const [title, description] = upgradeLabels[id];
  const meta = h('div', { className: 'meta' });
  const buy = h('button');
  buy.addEventListener('click', () => {
    game.buyUpgrade(id);
    render();
  });
  return {
    id,
    title,
    meta,
    buy,
    row: h('div', { className: 'row' }, [
      h('div', {}, [
        h('strong', { text: title }),
        h('div', { className: 'meta', text: description }),
        meta,
      ]),
      buy,
    ]),
  };
});

const prestigeInfo = h('div', { className: 'meta' });
const prestigeBtn = h('button');
prestigeBtn.addEventListener('click', () => {
  const gained = game.pendingPrestige();
  if (!window.confirm(`Ascend now for ${fmt(gained)} prestige points? Your run resets.`)) return;
  game.prestige();
  render();
});

const achievementRows = game.achievementIds.map((id) => {
  const mark = h('span');
  const row = h('div', { className: 'achievement' }, [
    h('span', { text: achievementLabels[id] }),
    mark,
  ]);
  return { id, mark, row };
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
  goldEl.textContent = fmt(game.amount('gold'));
  rateEl.textContent = `${fmt(game.rate('gold'))} per second`;

  for (const { button, value } of modeButtons) {
    button.setAttribute('aria-pressed', String(value === mode));
  }
  for (const g of generatorRows) {
    const amount = mode;
    g.name.textContent = `${generatorLabels[g.id]} (${fmt(game.count(g.id))})`;
    g.meta.textContent = `Next: ${fmt(game.cost(g.id, amount))}`;
    g.buy.textContent = amount === 'max' ? `Buy ${fmt(game.maxAffordable(g.id))}` : `Buy ${amount}`;
    g.buy.disabled = !game.canBuy(g.id, amount);
  }
  for (const u of upgradeRows) {
    const cost = game.upgradeCost(u.id);
    const level = game.upgradeLevel(u.id);
    u.meta.textContent = `Level ${level}${cost === undefined ? ' (max)' : ` · ${fmt(cost)}`}`;
    u.buy.textContent = cost === undefined ? 'Maxed' : 'Buy';
    u.buy.disabled = !game.canBuyUpgrade(u.id);
  }
  prestigeInfo.textContent =
    `Points: ${fmt(game.prestigePoints())} (+${(game.prestigePoints().toNumber() * 10).toFixed(0)}% production). ` +
    `Ascending now grants ${fmt(game.pendingPrestige())}.`;
  prestigeBtn.textContent = 'Ascend';
  prestigeBtn.disabled = !game.canPrestige();
  for (const a of achievementRows) {
    const done = game.hasAchievement(a.id);
    a.row.classList.toggle('unlocked', done);
    a.mark.textContent = done ? 'Unlocked' : 'Locked';
  }
}

game.on('tick', render);
game.on('achievementUnlocked', ({ id }) => toast(`Achievement: ${achievementLabels[id]}`));
game.on('prestige', ({ gained }) => toast(`Ascended! +${fmt(gained)} prestige points`));
game.on('offlineGains', ({ elapsedMs, gains }) => {
  if (gains.gold.isZero()) return;
  toast(
    `Welcome back! ${(elapsedMs / 60_000).toFixed(0)} min away earned ${fmt(gains.gold)} gold.`,
  );
});

clickBtn.addEventListener('click', () => {
  game.add('gold', game.multiplier({ all: true }));
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
