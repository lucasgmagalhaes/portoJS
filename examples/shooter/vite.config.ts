import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@portojs/core/bignum': at('../../packages/core/src/bignum.ts'),
      '@portojs/core': at('../../packages/core/src/index.ts'),
      '@portojs/runtime': at('../../packages/runtime/src/index.ts'),
      '@portojs/ecs': at('../../packages/ecs/src/index.ts'),
      '@portojs/render': at('../../packages/render/src/index.ts'),
      '@portojs/math': at('../../packages/math/src/index.ts'),
      '@portojs/input': at('../../packages/input/src/index.ts'),
    },
  },
  server: { fs: { allow: ['../..'] } },
});
