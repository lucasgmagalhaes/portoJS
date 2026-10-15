import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Finishes the declaration files in ./dist.
 *
 * tsc keeps the ".ts" specifiers of the sources, which consumers cannot import, so every .d.ts
 * is rewritten to ".js" (what the ESM output is called). Then each .d.ts is copied to a .d.cts
 * whose relative imports point at ".cjs", so CommonJS consumers get types that match the
 * CommonJS output.
 */
function swap(text, from, to) {
  return text.split(`${from}'`).join(`${to}'`).split(`${from}"`).join(`${to}"`);
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.d.ts')) {
      const esm = swap(swap(readFileSync(path, 'utf8'), '.tsx', '.js'), '.ts', '.js');
      writeFileSync(path, esm);
      const target = path.slice(0, -'.d.ts'.length) + '.d.cts';
      copyFileSync(path, target);
      writeFileSync(target, swap(esm, '.js', '.cjs'));
    }
  }
}

walk(join(process.cwd(), 'dist'));
