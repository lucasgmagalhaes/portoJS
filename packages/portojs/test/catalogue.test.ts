import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KINDS, catalogue, filterCatalogue } from '../../../docs/.vitepress/catalogue.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));

describe('catalogue', () => {
  it('lists real packages with matching names', () => {
    const packages = catalogue.filter((item) => item.kind === 'package');
    expect(packages.length).toBeGreaterThanOrEqual(17);
    for (const item of packages) {
      const folder = item.name === 'portojs' ? 'portojs' : item.name.replace('@portojs/', '');
      const manifest = JSON.parse(
        readFileSync(`${root}packages/${folder}/package.json`, 'utf8'),
      ) as { name: string };
      expect(manifest.name).toBe(item.name);
    }
  });

  it('only names exports that exist in their package', async () => {
    for (const item of catalogue) {
      if (item.package === undefined) continue;
      const module = (await import(`../../${item.package}/src/index.ts`)) as Record<
        string,
        unknown
      >;
      expect(module[item.name], `${item.package} exports ${item.name}`).toBeDefined();
    }
  });

  it('links to guide pages and examples that exist', () => {
    for (const item of catalogue) {
      expect(item.summary.length).toBeGreaterThan(10);
      if (item.link.startsWith('http')) {
        expect(existsSync(`${root}${item.name}`), item.name).toBe(true);
      } else {
        expect(existsSync(`${root}docs${item.link}.md`), item.link).toBe(true);
      }
    }
  });

  it('has no duplicates and covers every kind', () => {
    const names = catalogue.map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
    for (const kind of KINDS) expect(catalogue.some((item) => item.kind === kind)).toBe(true);
  });

  it('filters by text and by kind', () => {
    expect(filterCatalogue(catalogue, {}).length).toBe(catalogue.length);
    const physics = filterCatalogue(catalogue, { query: 'rapier' });
    expect(physics.map((item) => item.name)).toContain('@portojs/physics');
    expect(filterCatalogue(catalogue, { query: 'PHYSICS rigid' }).length).toBeGreaterThan(0);
    expect(filterCatalogue(catalogue, { query: 'zzzz-nothing' })).toEqual([]);
    const tools = filterCatalogue(catalogue, { kind: 'tool' });
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((item) => item.kind === 'tool')).toBe(true);
    expect(filterCatalogue(catalogue, { kind: 'example', query: 'sprites' })).toHaveLength(1);
    expect(filterCatalogue(catalogue, { kind: undefined, query: '  ' }).length).toBe(
      catalogue.length,
    );
  });
});
