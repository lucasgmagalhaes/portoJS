#!/usr/bin/env node
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, systemEnvironment } from './dist/cli.js';

const root = dirname(fileURLToPath(import.meta.url));
process.exitCode = await run(process.argv.slice(2), systemEnvironment(root));
