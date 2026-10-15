import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    core: 'src/core.ts',
    bignum: 'src/bignum.ts',
    idle: 'src/idle.ts',
    react: 'src/react.ts',
    vue: 'src/vue.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  treeshake: true,
});
