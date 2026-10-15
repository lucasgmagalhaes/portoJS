import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '../dist/index.js';

const require = createRequire(import.meta.url);

async function loadOptionalEntry(name) {
  try {
    return await import(`../dist/${name}.js`);
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return undefined;
    throw error;
  }
}
const cjs = require('../dist/index.cjs');

const esmBignum = await import('../dist/bignum.js');
const esmCore = await import('../dist/core.js');
const esmMechanics = await import('../dist/mechanics.js');
for (const peer of ['react', 'vue']) {
  const loaded = await loadOptionalEntry(peer);
  if (loaded === undefined)
    console.log(`esm: ${peer} entry skipped (peer dependency not installed)`);
  else assert.equal(typeof loaded.useGame, 'function', `esm: ${peer} entry`);
}
assert.equal(esmBignum.BigNum, esm.BigNum, 'esm: bignum entry shares BigNum');
assert.equal(esmCore.BigNum, esm.BigNum, 'esm: core entry shares BigNum');
assert.equal(typeof esmMechanics.resources, 'function', 'esm: mechanics entry');
assert.equal(require('../dist/bignum.cjs').BigNum, cjs.BigNum, 'cjs: bignum entry shares BigNum');
assert.equal(require('../dist/core.cjs').BigNum, cjs.BigNum, 'cjs: core entry shares BigNum');
assert.equal(typeof require('../dist/mechanics.cjs').resources, 'function', 'cjs: mechanics entry');

for (const [name, lib] of [
  ['esm', esm],
  ['cjs', cjs],
]) {
  const clock = new lib.ManualClock(0);
  const game = lib.createGame({
    clock,
    resources: { gold: { initial: 10 } },
    generators: {
      miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 1 },
    },
    offline: { maxMs: 3_600_000, efficiency: 0.5 },
  });

  assert.equal(game.buy('miner').toNumber(), 1, `${name}: buy`);
  const save = game.exportSave();
  clock.advance(7_200_000);
  const report = game.importSave(save);
  assert.equal(report?.status, 'capped', `${name}: offline status`);
  assert.ok(Math.abs(game.amount('gold').toNumber() - 1800) < 1e-6, `${name}: offline gains`);
  assert.throws(() => game.importSave('garbage'), lib.SaveCorruptedError, `${name}: corruption`);
  assert.equal(lib.format('1.5e12', { notation: 'suffix' }), '1.5T', `${name}: format`);
  console.log(`${name}: ok (Node ${process.version})`);
}
