import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import type { UserConfig } from 'vite';

/**
 * Shared Vite library-mode config of every package: ESM and CJS output with the same entry
 * names, workspace packages and peers left external. Types are emitted separately by tsc.
 */
export function libraryConfig(entries: readonly string[]): UserConfig {
  const input: Record<string, string> = {};
  for (const name of entries) input[name] = resolve(process.cwd(), `src/${name}.ts`);
  return defineConfig({
    build: {
      target: 'es2022',
      sourcemap: true,
      minify: false,
      emptyOutDir: true,
      lib: { entry: input },
      rollupOptions: {
        external: isExternal,
        output: [
          {
            format: 'es',
            entryFileNames: '[name].js',
            chunkFileNames: 'chunks/[name]-[hash].js',
          },
          {
            format: 'cjs',
            exports: 'named',
            entryFileNames: '[name].cjs',
            chunkFileNames: 'chunks/[name]-[hash].cjs',
          },
        ],
      },
    },
  });
}

function isExternal(id: string): boolean {
  return id.startsWith('@portojs/') || id === 'react' || id === 'vue' || id.startsWith('node:');
}
