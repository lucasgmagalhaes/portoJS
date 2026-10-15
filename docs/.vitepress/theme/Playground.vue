<script setup lang="ts">
import { ref } from 'vue';
import * as portojs from 'portojs';

interface Example {
  readonly name: string;
  readonly code: string;
}

const examples: readonly Example[] = [
  {
    name: 'Minimal game',
    code: `const { Game, Generator, ManualClock, Resource, format } = portojs;

// A fake clock makes time deterministic: we decide when it moves.
const clock = new ManualClock(0);
const game = new Game({ clock });

const gold = game.createObject('Gold').addComponent(Resource, { initial: 10 });
const miner = game.createObject('Miner').addComponent(Generator, {
  cost: { resource: gold, base: 10, growth: 1.15 },
  produces: gold,
  rate: 1,
});

miner.buy();
clock.advance(10_000); // ten seconds pass
game.update();
console.log('gold after 10 s:', format(gold.amount));
console.log('next miner costs:', format(miner.nextCost));
`,
  },
  {
    name: 'Your own component',
    code: `const { Component, Game, GameEvent, ManualClock } = portojs;

class Plant extends Component {
  static typeId = 'Plant';
  size = 0;
  grown = new GameEvent();

  awake() {
    console.log('awake');
  }

  fixedUpdate(deltaTime) {
    this.size += deltaTime; // one unit per second
    if (this.size >= 3 && this.grown.listenerCount > 0) this.grown.invoke();
  }

  onOffline(elapsedMs) {
    this.size += elapsedMs / 1000;
  }

  onSave() {
    return this.size;
  }

  onLoad(data) {
    this.size = typeof data === 'number' ? data : 0;
  }
}

const clock = new ManualClock(0);
const game = new Game({ clock });
const plant = game.createObject('Fern').addComponent(Plant);
plant.grown.addListener(() => console.log('fully grown at', plant.size.toFixed(1)));

clock.advance(3000);
game.update();

const save = game.save();
console.log('saved:', JSON.stringify(save.data));
`,
  },
  {
    name: 'Offline progress',
    code: `const { Game, Generator, ManualClock, Resource, format } = portojs;

const clock = new ManualClock(0);
const game = new Game({
  clock,
  offline: { maxMs: 8 * 3_600_000, efficiency: 0.5 }, // cap at 8 h, credit 50%
});
const gold = game.createObject('Gold').addComponent(Resource, { initial: 10 });
const miner = game.createObject('Miner').addComponent(Generator, {
  cost: { resource: gold, base: 10, growth: 1.15 },
  produces: gold,
  rate: 2,
});

miner.buy();
const save = game.exportSave();

clock.advance(20 * 3_600_000); // the player is away for 20 hours
const report = game.importSave(save);
console.log('away for', report.elapsedMs / 3_600_000, 'h, credited', report.appliedMs / 3_600_000, 'h', '(' + report.status + ')');
console.log('gold now:', format(gold.amount));
`,
  },
  {
    name: 'Big numbers and bulk buying',
    code: `const { BigNum, Game, Generator, Resource, format } = portojs;

const game = new Game();
const gold = game.createObject('Gold').addComponent(Resource, { initial: '1e30' });
const miner = game.createObject('Miner').addComponent(Generator, {
  cost: { resource: gold, base: 10, growth: 1.15 },
  produces: gold,
  rate: 1,
});

console.log('can afford:', format(miner.maxAffordable, { notation: 'suffix' }), 'miners');
const bought = miner.buy('max');
console.log('bought:', format(bought), '| gold left:', format(gold.amount));

const huge = BigNum.from('1.5e300').mul('2e200');
console.log('1.5e300 x 2e200 =', huge.toString(), '=', format(huge));
console.log('0.1 + 0.2 equals 0.3?', BigNum.from('0.1').add('0.2').eq('0.3'));
`,
  },
  {
    name: 'Prestige',
    code: `const { Game, Generator, ManualClock, Prestige, Resource, format } = portojs;

const clock = new ManualClock(0);
const game = new Game({ clock });
const gold = game.createObject('Gold').addComponent(Resource);
const miner = game.createObject('Miner').addComponent(Generator, {
  cost: { resource: gold, base: 1, growth: 1 },
  produces: gold,
  rate: 1000,
});
const ascension = game.createObject('Ascension').addComponent(Prestige, {
  basedOn: gold,
  gain: { threshold: 100_000 },
  bonuses: [{ all: true, perPoint: 0.5 }],
});

gold.add(1);
miner.buy();
console.log('rate before:', format(gold.rate), 'per second');

clock.advance(1_000_000);
game.update();
console.log('earned:', format(gold.earned), '-> pending points:', format(ascension.pending));

ascension.perform();
gold.add(1);
miner.buy();
console.log('rate after prestige:', format(gold.rate), 'per second');
`,
  },
];

const selected = ref(0);
const code = ref(examples[0]?.code ?? '');
const output = ref<string[]>([]);
const failed = ref(false);

function choose(): void {
  code.value = examples[selected.value]?.code ?? '';
  output.value = [];
  failed.value = false;
}

function show(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  } catch {
    return String(value);
  }
}

async function run(): Promise<void> {
  const lines: string[] = [];
  failed.value = false;
  const log = (...args: unknown[]): void => {
    lines.push(args.map(show).join(' '));
  };
  const capture = { log, info: log, warn: log, error: log };
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
      ...args: string[]
    ) => (...values: unknown[]) => Promise<unknown>;
    await new AsyncFunction('portojs', 'console', code.value)(portojs, capture);
  } catch (error) {
    failed.value = true;
    lines.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }
  output.value = lines;
}
</script>

<template>
  <div class="playground">
    <div class="bar">
      <label>
        Example
        <select v-model.number="selected" @change="choose">
          <option v-for="(example, i) in examples" :key="example.name" :value="i">
            {{ example.name }}
          </option>
        </select>
      </label>
      <button type="button" @click="run">Run</button>
    </div>
    <textarea v-model="code" spellcheck="false" aria-label="Code" />
    <pre class="out" :class="{ failed }" aria-live="polite">{{
      output.length ? output.join('\n') : 'Press Run to see the output.'
    }}</pre>
  </div>
</template>

<style scoped>
.playground {
  display: grid;
  gap: 12px;
  margin: 16px 0;
}
.bar {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
select,
button,
textarea {
  font: inherit;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}
select,
button {
  padding: 6px 12px;
}
button {
  cursor: pointer;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  border-color: var(--vp-c-brand-1);
}
textarea {
  min-height: 320px;
  padding: 12px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.85rem;
  line-height: 1.5;
  resize: vertical;
}
.out {
  margin: 0;
  padding: 12px;
  min-height: 3rem;
  white-space: pre-wrap;
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.85rem;
}
.out.failed {
  color: var(--vp-c-danger-1);
}
</style>
