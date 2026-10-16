/**
 * Scaffold a PortoJS game: `npm create portojs@latest`.
 *
 * @module create-portojs
 */

export { isValidName, listTemplates, scaffold } from './scaffold.ts';
export type { ScaffoldOptions } from './scaffold.ts';
export { helpText, parseArguments, run, systemEnvironment } from './cli.ts';
export type { CliArguments, CliEnvironment } from './cli.ts';
