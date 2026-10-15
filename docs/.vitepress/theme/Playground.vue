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
    code: `const { createGame, format, ManualClock } = portojs;

// A fake clock makes time deterministic: we decide when it moves.
const clock = new ManualClock(0);
const game = createGame({
  clock,
  resources: { gold: { initial: 10 } },
  generators: {
    miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 1 },
  },
});

game.buy('miner');
clock.advance(10_000); // ten seconds pass
game.update();
console.log('gold after 10 s:', format(game.amount('gold')));
console.log('next miner costs:', format(game.cost('miner')));
`,
  },
  {
    name: 'Offline progress',
    code: `const { createGame, format, ManualClock } = portojs;

const clock = new ManualClock(0);
const config = {
  clock,
  resources: { gold: { initial: 10 } },
  generators: {
    miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 2 },
  },
  offline: { maxMs: 8 * 3_600_000, efficiency: 0.5 }, // cap at 8 h, credit 50%
};

const game = createGame(config);
game.buy('miner');
const save = game.exportSave();

clock.advance(20 * 3_600_000); // the player is away for 20 hours
const report = game.importSave(save);
console.log('away for', report.elapsedMs / 3_600_000, 'h, credited', report.appliedMs / 3_600_000, 'h', '(' + report.status + ')');
console.log('gold now:', format(game.amount('gold')));
`,
  },
  {
    name: 'Big numbers and bulk buying',
    code: `const { createGame, format, BigNum } = portojs;

const game = createGame({
  resources: { gold: { initial: '1e30' } },
  generators: {
    miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 1 },
  },
});

console.log('can afford:', format(game.maxAffordable('miner'), { notation: 'suffix' }), 'miners');
const bought = game.buy('miner', 'max');
console.log('bought:', format(bought), '| gold left:', format(game.amount('gold')));

const huge = BigNum.from('1.5e300').mul('2e200');
console.log('1.5e300 x 2e200 =', huge.toString(), '=', format(huge));
console.log('0.1 + 0.2 equals 0.3?', BigNum.from('0.1').add('0.2').eq('0.3'));
`,
  },
  {
    name: 'Prestige',
    code: `const { createGame, format, ManualClock } = portojs;

const clock = new ManualClock(0);
const game = createGame({
  clock,
  resources: { gold: { initial: 0 } },
  generators: {
    miner: { cost: { resource: 'gold', base: 1, growth: 1 }, produces: 'gold', rate: 1000 },
  },
  prestige: {
    basedOn: 'gold',
    gain: { threshold: 100_000 },
    bonuses: [{ target: { all: true }, perPoint: 0.5 }],
  },
});

game.add('gold', 1);
game.buy('miner');
console.log('rate before:', format(game.rate('gold')), 'per second');

clock.advance(1_000_000);
game.update();
console.log('earned:', format(game.earned('gold')), '-> pending points:', format(game.pendingPrestige()));

game.prestige();
game.add('gold', 1);
game.buy('miner');
console.log('rate after prestige:', format(game.rate('gold')), 'per second');
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
