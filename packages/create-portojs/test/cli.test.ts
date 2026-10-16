import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { helpText, parseArguments, run } from '../src/index.ts';
import type { CliEnvironment } from '../src/index.ts';

const templatesDir = join(import.meta.dirname, '..', 'templates');
const versions = {
  portojs: '0.10.0',
  '@portojs/render': '0.10.0',
  '@portojs/ecs': '0.10.0',
  '@portojs/math': '0.10.0',
};

function environment(answers: Record<string, string> = {}, userAgent?: string) {
  const output: string[] = [];
  const asked: string[] = [];
  const cwd = mkdtempSync(join(tmpdir(), 'cli-'));
  const env: CliEnvironment = {
    cwd,
    templatesDir,
    versions,
    userAgent,
    write: (text) => void output.push(text),
    ask: (question, fallback) => {
      asked.push(question);
      const key = Object.keys(answers).find((k) => question.startsWith(k));
      return Promise.resolve(key === undefined ? fallback : (answers[key] as string));
    },
  };
  return { env, output, asked, cwd };
}

describe('parseArguments', () => {
  it('reads a name and a template in either form', () => {
    expect(parseArguments(['game', '--template', 'idle'])).toEqual({
      name: 'game',
      template: 'idle',
      help: false,
    });
    expect(parseArguments(['-t', 'blank', 'g'])).toMatchObject({ name: 'g', template: 'blank' });
    expect(parseArguments(['--template=sprites'])).toMatchObject({ template: 'sprites' });
    expect(parseArguments([])).toEqual({ name: undefined, template: undefined, help: false });
    expect(parseArguments(['-h']).help).toBe(true);
  });

  it('rejects unknown options, missing values and extra names', () => {
    expect(() => parseArguments(['--wat'])).toThrow(/Unknown option/);
    expect(() => parseArguments(['--template'])).toThrow(/needs a template name/);
    expect(() => parseArguments(['a', 'b'])).toThrow(/one project name/);
  });
});

describe('run', () => {
  it('creates a project from the arguments and prints the next steps', async () => {
    const { env, output, asked, cwd } = environment();
    const code = await run(['my-game', '--template', 'idle'], env);
    expect(code).toBe(0);
    expect(asked).toEqual([]);
    expect(existsSync(join(cwd, 'my-game', 'src', 'main.ts'))).toBe(true);
    expect(readFileSync(join(cwd, 'my-game', 'package.json'), 'utf8')).toContain('"my-game"');
    const text = output.join('');
    expect(text).toContain('cd my-game');
    expect(text).toContain('npm install');
  });

  it('asks for what is missing and uses the answers', async () => {
    const { env, asked, cwd } = environment({ 'Project name': 'asked-game', Template: 'sprites' });
    expect(await run([], env)).toBe(0);
    expect(asked).toHaveLength(2);
    expect(existsSync(join(cwd, 'asked-game', 'index.html'))).toBe(true);
  });

  it('names the package manager that ran it', async () => {
    const { env, output } = environment({}, 'pnpm/10.0.0 npm/? node/v22');
    await run(['g', '-t', 'blank'], env);
    expect(output.join('')).toContain('pnpm install');
    expect(output.join('')).toContain('pnpm run dev');
  });

  it('uses the last folder of a path as the package name', async () => {
    const { env, cwd } = environment();
    expect(await run(['games/nested-game', '-t', 'blank'], env)).toBe(0);
    expect(readFileSync(join(cwd, 'games', 'nested-game', 'package.json'), 'utf8')).toContain(
      '"nested-game"',
    );
  });

  it('prints help and exits 0', async () => {
    const { env, output } = environment();
    expect(await run(['--help'], env)).toBe(0);
    expect(output.join('')).toBe(helpText(['blank', 'idle', 'sprites']));
  });

  it('reports errors with exit code 1', async () => {
    const bad = environment();
    expect(await run(['Bad Name', '-t', 'blank'], bad.env)).toBe(1);
    expect(bad.output.join('')).toContain('not a valid npm package name');

    const unknown = environment();
    expect(await run(['ok', '-t', 'nope'], unknown.env)).toBe(1);
    expect(unknown.output.join('')).toContain('Unknown template');

    const twice = environment();
    expect(await run(['ok', '-t', 'blank'], twice.env)).toBe(0);
    expect(await run(['ok', '-t', 'blank'], twice.env)).toBe(1);
    expect(twice.output.join('')).toContain('not empty');

    const option = environment();
    expect(await run(['--wat'], option.env)).toBe(1);
  });
});
