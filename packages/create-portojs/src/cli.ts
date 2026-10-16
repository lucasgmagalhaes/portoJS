import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { isValidName, listTemplates, scaffold } from './scaffold.ts';

/**
 * What the command line asked for.
 */
export interface CliArguments {
  /**
   * The folder (and package name) to create.
   */
  readonly name: string | undefined;
  readonly template: string | undefined;
  readonly help: boolean;
}

/**
 * Everything {@link run} touches outside of itself, so it can be tested.
 */
export interface CliEnvironment {
  readonly cwd: string;
  readonly templatesDir: string;
  readonly versions: Readonly<Record<string, string>>;
  /**
   * Value of `npm_config_user_agent`, to name the package manager in the next steps.
   */
  readonly userAgent: string | undefined;
  write(text: string): void;
  /**
   * Asks a question and returns the answer, or `fallback` when the answer is empty.
   */
  ask(question: string, fallback: string): Promise<string>;
  /**
   * Releases the terminal, if one was opened.
   */
  close?(): void;
}

/**
 * Reads `[name] [--template <name> | -t <name>] [--help | -h]`.
 *
 * @throws {Error} for an unknown option, a missing value or more than one name.
 */
export function parseArguments(argv: readonly string[]): CliArguments {
  let name: string | undefined;
  let template: string | undefined;
  let help = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index] as string;
    if (argument === '--help' || argument === '-h') {
      help = true;
    } else if (argument === '--template' || argument === '-t') {
      template = argv[++index];
      if (template === undefined) throw new Error(`${argument} needs a template name`);
    } else if (argument.startsWith('--template=')) {
      template = argument.slice('--template='.length);
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option ${argument}`);
    } else if (name === undefined) {
      name = argument;
    } else {
      throw new Error(`Unexpected argument ${argument}; give one project name`);
    }
  }
  return { name, template, help };
}

function runner(userAgent: string | undefined): string {
  const manager = userAgent?.split('/', 1)[0];
  return manager === 'pnpm' || manager === 'yarn' || manager === 'bun' ? manager : 'npm';
}

/**
 * The text printed for `--help`.
 */
export function helpText(templates: readonly string[]): string {
  return [
    'Usage: npm create portojs@latest [name] [options]',
    '',
    'Options:',
    `  -t, --template <name>  one of: ${templates.join(', ')}`,
    '  -h, --help             show this help',
    '',
  ].join('\n');
}

/**
 * Runs the command line. Asks for what is missing, creates the project and prints the next
 * steps.
 *
 * @returns the process exit code.
 */
export async function run(argv: readonly string[], env: CliEnvironment): Promise<number> {
  const templates = listTemplates(env.templatesDir);
  try {
    const args = parseArguments(argv);
    if (args.help) {
      env.write(helpText(templates));
      return 0;
    }
    const given = args.name ?? (await env.ask('Project name', 'my-game'));
    const name = basename(given);
    if (!isValidName(name)) throw new Error(`"${name}" is not a valid npm package name`);
    const template =
      args.template ?? (await env.ask(`Template (${templates.join(', ')})`, templates[0] ?? ''));
    const targetDir = resolve(env.cwd, given);
    scaffold({
      targetDir,
      name,
      templatesDir: env.templatesDir,
      template,
      versions: env.versions,
    });
    const manager = runner(env.userAgent);
    env.write(
      [
        '',
        `Created ${name} from the "${template}" template. Next:`,
        '',
        `  cd ${given}`,
        `  ${manager} install`,
        `  ${manager} run dev`,
        '',
      ].join('\n'),
    );
    return 0;
  } catch (error) {
    env.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    env.close?.();
  }
}

/**
 * The real environment: the process, the terminal and the files shipped with the package.
 *
 * @param root folder of the installed package, which holds `templates` and `versions.json`.
 */
export function systemEnvironment(root: string): CliEnvironment {
  const versions = JSON.parse(readFileSync(join(root, 'versions.json'), 'utf8')) as Record<
    string,
    string
  >;
  let terminal: ReturnType<typeof createInterface> | undefined;
  let lines: AsyncIterator<string> | undefined;
  return {
    cwd: process.cwd(),
    templatesDir: join(root, 'templates'),
    versions,
    userAgent: process.env['npm_config_user_agent'],
    write: (text) => void process.stdout.write(text),
    async ask(question, fallback) {
      terminal ??= createInterface({ input: process.stdin });
      lines ??= terminal[Symbol.asyncIterator]();
      process.stdout.write(`${question} (${fallback}): `);
      const next = await lines.next();
      const answer = next.done === true ? '' : String(next.value).trim();
      return answer === '' ? fallback : answer;
    },
    close() {
      terminal?.close();
    },
  };
}
