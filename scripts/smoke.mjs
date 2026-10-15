import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '../packages/portojs/dist/index.js';

const require = createRequire(import.meta.url);
const cjs = require('../packages/portojs/dist/index.cjs');

async function loadOptionalEntry(name) {
  try {
    return await import(`../packages/portojs/dist/${name}.js`);
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return undefined;
    throw error;
  }
}

const esmBignum = await import('../packages/portojs/dist/bignum.js');
const esmCore = await import('../packages/portojs/dist/core.js');
const esmIdle = await import('../packages/portojs/dist/idle.js');
assert.equal(esmBignum.BigNum, esm.BigNum, 'esm: bignum entry shares BigNum');
assert.equal(esmCore.BigNum, esm.BigNum, 'esm: core entry shares BigNum');
assert.equal(esmCore.Game, esm.Game, 'esm: core entry shares Game');
assert.equal(esmIdle.Resource, esm.Resource, 'esm: idle entry shares Resource');
assert.equal(
  require('../packages/portojs/dist/bignum.cjs').BigNum,
  cjs.BigNum,
  'cjs: bignum entry shares BigNum',
);
assert.equal(
  require('../packages/portojs/dist/core.cjs').Game,
  cjs.Game,
  'cjs: core entry shares Game',
);
assert.equal(
  require('../packages/portojs/dist/idle.cjs').Resource,
  cjs.Resource,
  'cjs: idle entry shares Resource',
);

for (const peer of ['react', 'vue']) {
  const loaded = await loadOptionalEntry(peer);
  if (loaded === undefined)
    console.log(`esm: ${peer} entry skipped (peer dependency not installed)`);
  else assert.equal(typeof loaded.useGame, 'function', `esm: ${peer} entry`);
}

for (const [name, lib] of [
  ['esm', esm],
  ['cjs', cjs],
]) {
  const clock = new lib.ManualClock(0);
  const game = new lib.Game({ clock, offline: { maxMs: 3_600_000, efficiency: 0.5 } });
  const gold = game.createObject('Gold').addComponent(lib.Resource, { initial: 10 });
  const miner = game.createObject('Miner').addComponent(lib.Generator, {
    cost: { resource: gold, base: 10, growth: 1.15 },
    produces: gold,
    rate: 1,
  });

  assert.equal(miner.buy().toNumber(), 1, `${name}: buy`);
  const save = game.exportSave();
  clock.advance(7_200_000);
  const report = game.importSave(save);
  assert.equal(report?.status, 'capped', `${name}: offline status`);
  assert.ok(Math.abs(gold.amount.toNumber() - 1800) < 1e-6, `${name}: offline gains`);
  assert.throws(() => game.importSave('garbage'), lib.SaveCorruptedError, `${name}: corruption`);
  assert.equal(lib.format('1.5e12', { notation: 'suffix' }), '1.5T', `${name}: format`);
  console.log(`${name}: ok (Node ${process.version})`);
}

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

/**
 * Every .d.ts and .d.cts under `dir`. They must only point at files that exist, with
 * extensions consumers can import.
 */
function declarationFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...declarationFiles(path));
    else if (name.endsWith('.d.ts') || name.endsWith('.d.cts')) found.push(path);
  }
  return found;
}

const packagesDir = fileURLToPath(new URL('../packages', import.meta.url));
let checked = 0;
for (const pkg of readdirSync(packagesDir)) {
  const dist = join(packagesDir, pkg, 'dist');
  if (!existsSync(dist)) continue;
  for (const file of declarationFiles(dist)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/from '(\.[^']*)'/g)) {
      const specifier = match[1];
      assert.ok(!specifier.endsWith('.ts'), `${file}: "${specifier}" must not end in .ts`);
      const target = specifier.endsWith('.cjs')
        ? specifier.replace(/\.cjs$/, '.d.cts')
        : specifier.replace(/\.js$/, '.d.ts');
      assert.ok(
        existsSync(resolve(dirname(file), target)),
        `${file}: "${specifier}" does not resolve`,
      );
      checked += 1;
    }
  }
}
console.log(`declarations: ok (${checked} relative imports resolve)`);
