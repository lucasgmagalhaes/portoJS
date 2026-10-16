import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      portojs: at('./packages/portojs/src/index.ts'),
      '@portojs/core/bignum': at('./packages/core/src/bignum.ts'),
      '@portojs/core': at('./packages/core/src/index.ts'),
      '@portojs/runtime': at('./packages/runtime/src/index.ts'),
      '@portojs/tween': at('./packages/tween/src/index.ts'),
      '@portojs/math': at('./packages/math/src/index.ts'),
      '@portojs/ecs': at('./packages/ecs/src/index.ts'),
      '@portojs/render': at('./packages/render/src/index.ts'),
      '@portojs/input': at('./packages/input/src/index.ts'),
      '@portojs/physics': at('./packages/physics/src/index.ts'),
      '@portojs/devtools': at('./packages/devtools/src/index.ts'),
      '@portojs/worker': at('./packages/worker/src/index.ts'),
      '@portojs/platform': at('./packages/platform/src/index.ts'),
      '@portojs/tools': at('./packages/tools/src/index.ts'),
      '@portojs/audio': at('./packages/audio/src/index.ts'),
      '@portojs/idle': at('./packages/idle/src/index.ts'),
      '@portojs/react': at('./packages/react/src/index.ts'),
      '@portojs/svelte': at('./packages/svelte/src/index.ts'),
      'solid-js': at('./packages/solid/node_modules/solid-js/dist/solid.js'),
      '@portojs/solid': at('./packages/solid/src/index.ts'),
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
