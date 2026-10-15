import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Copies every .d.ts in ./dist to a .d.cts whose relative imports point at .cjs files, so that
 * CommonJS consumers get types that match the CommonJS output.
 */
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.d.ts')) {
      const target = path.slice(0, -'.d.ts'.length) + '.d.cts';
      copyFileSync(path, target);
      const text = readFileSync(target, 'utf8');
      writeFileSync(target, text.split(".js'").join(".cjs'").split('.js"').join('.cjs"'));
    }
  }
}

walk(join(process.cwd(), 'dist'));
