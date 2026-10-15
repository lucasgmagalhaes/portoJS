import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The example imports "portojs" straight from the repository sources, so it always
// reflects the code in this checkout and needs no build step.
export default defineConfig({
  resolve: {
    alias: { portojs: fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
  },
  server: { fs: { allow: ['../..'] } },
});
