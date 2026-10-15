import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@portojs/core/bignum': at('./packages/core/src/bignum.ts'),
      '@portojs/core': at('./packages/core/src/index.ts'),
      '@portojs/runtime': at('./packages/runtime/src/index.ts'),
      '@portojs/ecs': at('./packages/ecs/src/index.ts'),
      '@portojs/render': at('./packages/render/src/index.ts'),
      '@portojs/idle': at('./packages/idle/src/index.ts'),
      '@portojs/react': at('./packages/react/src/index.ts'),
      '@portojs/vue': at('./packages/vue/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**'],
      exclude: [
        'packages/render/src/webgl2.ts',
        'packages/render/src/webgpu.ts',
        'packages/render/src/create-renderer.ts',
      ],
    },
  },
});
