import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@portojs/core/bignum': fileURLToPath(
        new URL('../../packages/core/src/bignum.ts', import.meta.url),
      ),
      '@portojs/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@portojs/runtime': fileURLToPath(
        new URL('../../packages/runtime/src/index.ts', import.meta.url),
      ),
      '@portojs/idle': fileURLToPath(new URL('../../packages/idle/src/index.ts', import.meta.url)),
      '@portojs/react': fileURLToPath(
        new URL('../../packages/react/src/index.ts', import.meta.url),
      ),
      '@portojs/vue': fileURLToPath(new URL('../../packages/vue/src/index.ts', import.meta.url)),
      portojs: fileURLToPath(new URL('../../packages/portojs/src/index.ts', import.meta.url)),
    },
  },
  server: { fs: { allow: ['../..'] } },
});
