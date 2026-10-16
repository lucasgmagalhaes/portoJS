import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Options of {@link scaffold}.
 */
export interface ScaffoldOptions {
  /**
   * Folder to create the project in. It must not exist, or be empty.
   */
  readonly targetDir: string;
  /**
   * Package name of the new project, for example `my-game`.
   */
  readonly name: string;
  /**
   * Folder with one sub-folder per template.
   */
  readonly templatesDir: string;
  /**
   * Which template to copy.
   */
  readonly template: string;
  /**
   * Version of every PortoJS package, by package name. Template files use `{{v:@portojs/render}}`.
   */
  readonly versions: Readonly<Record<string, string>>;
}

const NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const TOKEN = /\{\{(name|v:[^}]+)\}\}/g;
const RENAMES: Readonly<Record<string, string>> = { _gitignore: '.gitignore' };

/**
 * Whether `name` is a valid npm package name.
 */
export function isValidName(name: string): boolean {
  return name.length > 0 && name.length <= 214 && NAME.test(name);
}

/**
 * Lists the template names found in a templates folder.
 */
export function listTemplates(templatesDir: string): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(templatesDir)) {
    if (statSync(join(templatesDir, entry)).isDirectory()) names.push(entry);
  }
  return names;
}

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

/**
 * Creates a project from a template: copies the files, fills in `{{name}}` and
 * `{{v:<package>}}`, and renames `_gitignore` to `.gitignore` (npm drops real `.gitignore` files
 * from packages).
 *
 * @returns the files created, relative to `targetDir`.
 * @throws {Error} for an invalid name, an unknown template, a non-empty target, or a template that
 * asks for a package version that is not known.
 */
export function scaffold(options: ScaffoldOptions): string[] {
  if (!isValidName(options.name)) {
    throw new Error(`"${options.name}" is not a valid npm package name`);
  }
  const source = join(options.templatesDir, options.template);
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    const known = listTemplates(options.templatesDir).join(', ');
    throw new Error(`Unknown template "${options.template}". Choose one of: ${known}`);
  }
  if (existsSync(options.targetDir) && readdirSync(options.targetDir).length > 0) {
    throw new Error(`The folder ${options.targetDir} is not empty`);
  }
  mkdirSync(options.targetDir, { recursive: true });
  cpSync(source, options.targetDir, { recursive: true });
  for (const [from, to] of Object.entries(RENAMES)) {
    for (const path of walk(options.targetDir)) {
      if (path.endsWith(`/${from}`) || path.endsWith(`\\${from}`)) {
        renameSync(path, path.slice(0, path.length - from.length) + to);
      }
    }
  }
  const created = walk(options.targetDir);
  const fill = replacer(options);
  for (const path of created) {
    const text = readFileSync(path, 'utf8');
    const filled = text.replace(TOKEN, fill);
    if (filled !== text) writeFileSync(path, filled);
  }
  const relatives: string[] = [];
  for (const path of created)
    relatives.push(relative(options.targetDir, path).split('\\').join('/'));
  return relatives.sort();
}

function replacer(options: ScaffoldOptions): (match: string, token: string) => string {
  return (_match, token) => {
    if (token === 'name') return options.name;
    const packageName = token.slice(2);
    const version = options.versions[packageName];
    if (version === undefined) {
      throw new Error(`The template needs a version of ${packageName}, which is not known`);
    }
    return `^${version}`;
  };
}
