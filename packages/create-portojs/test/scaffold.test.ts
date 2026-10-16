import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidName, listTemplates, scaffold } from '../src/index.ts';

function fixture(): { templatesDir: string; target: () => string } {
  const root = mkdtempSync(join(tmpdir(), 'create-portojs-'));
  const templatesDir = join(root, 'templates');
  mkdirSync(join(templatesDir, 'demo', 'src'), { recursive: true });
  mkdirSync(join(templatesDir, 'other'), { recursive: true });
  writeFileSync(
    join(templatesDir, 'demo', 'package.json'),
    '{"name":"{{name}}","dependencies":{"portojs":"{{v:portojs}}"}}',
  );
  writeFileSync(join(templatesDir, 'demo', '_gitignore'), 'node_modules\n');
  writeFileSync(join(templatesDir, 'demo', 'src', 'main.ts'), 'console.log("{{name}}");\n');
  writeFileSync(join(templatesDir, 'other', 'a.txt'), 'plain\n');
  writeFileSync(join(templatesDir, 'README-not-a-template.md'), 'x');
  let counter = 0;
  return { templatesDir, target: () => join(root, `out${counter++}`) };
}

const versions = { portojs: '1.2.3' };

describe('scaffold', () => {
  it('copies a template, fills in the name and versions, and renames _gitignore', () => {
    const { templatesDir, target } = fixture();
    const dir = target();
    const files = scaffold({
      targetDir: dir,
      name: 'my-game',
      templatesDir,
      template: 'demo',
      versions,
    });
    expect(files).toEqual(['.gitignore', 'package.json', 'src/main.ts']);
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))).toEqual({
      name: 'my-game',
      dependencies: { portojs: '^1.2.3' },
    });
    expect(readFileSync(join(dir, 'src', 'main.ts'), 'utf8')).toBe('console.log("my-game");\n');
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n');
  });

  it('lists only folders as templates', () => {
    const { templatesDir } = fixture();
    expect(listTemplates(templatesDir).sort()).toEqual(['demo', 'other']);
  });

  it('accepts an existing empty folder and refuses a non-empty one', () => {
    const { templatesDir, target } = fixture();
    const dir = target();
    mkdirSync(dir);
    const options = { targetDir: dir, name: 'a', templatesDir, template: 'other', versions };
    expect(scaffold(options)).toEqual(['a.txt']);
    expect(() => scaffold(options)).toThrow(/not empty/);
  });

  it('rejects an unknown template, listing the choices', () => {
    const { templatesDir, target } = fixture();
    expect(() =>
      scaffold({ targetDir: target(), name: 'a', templatesDir, template: 'nope', versions }),
    ).toThrow(/Choose one of: demo, other|Choose one of: other, demo/);
  });

  it('rejects an invalid name and an unknown package version', () => {
    const { templatesDir, target } = fixture();
    expect(() =>
      scaffold({ targetDir: target(), name: 'Bad Name', templatesDir, template: 'demo', versions }),
    ).toThrow(/valid npm package name/);
    expect(() =>
      scaffold({ targetDir: target(), name: 'ok', templatesDir, template: 'demo', versions: {} }),
    ).toThrow(/version of portojs/);
  });
});

describe('isValidName', () => {
  it('follows npm rules', () => {
    for (const ok of ['a', 'my-game', 'game.2d', '@scope/game', 'a_b']) {
      expect(isValidName(ok), ok).toBe(true);
    }
    for (const bad of ['', 'My Game', 'UPPER', '.hidden', '_x', 'a b', '@scope', 'x'.repeat(215)]) {
      expect(isValidName(bad), bad).toBe(false);
    }
  });
});

describe('shipped templates', () => {
  const templatesDir = join(import.meta.dirname, '..', 'templates');

  it('has the blank template with a valid manifest', () => {
    expect(listTemplates(templatesDir)).toContain('blank');
    const dir = mkdtempSync(join(tmpdir(), 'blank-'));
    const files = scaffold({
      targetDir: dir,
      name: 'blank-game',
      templatesDir,
      template: 'blank',
      versions: { portojs: '0.10.0' },
    });
    expect(files).toEqual(
      expect.arrayContaining(['package.json', 'index.html', 'src/main.ts', '.gitignore']),
    );
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      name: string;
      dependencies: Record<string, string>;
    };
    expect(manifest.name).toBe('blank-game');
    expect(manifest.dependencies['portojs']).toBe('^0.10.0');
    expect(files.every((file) => !readFileSync(join(dir, file), 'utf8').includes('{{'))).toBe(true);
  });
});
