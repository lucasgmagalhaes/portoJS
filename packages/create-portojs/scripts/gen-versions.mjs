import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packages = join(here, '..', '..');
const versions = {};
for (const folder of readdirSync(packages)) {
  try {
    const manifest = JSON.parse(readFileSync(join(packages, folder, 'package.json'), 'utf8'));
    if (manifest.private !== true && manifest.name !== 'create-portojs') {
      versions[manifest.name] = manifest.version;
    }
  } catch {
    continue;
  }
}
writeFileSync(join(here, '..', 'versions.json'), `${JSON.stringify(versions, null, 2)}\n`);
