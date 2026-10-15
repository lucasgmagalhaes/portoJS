import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    core: 'src/core/index.ts',
    bignum: 'src/core/bignum/index.ts',
    idle: 'src/idle/index.ts',
    react: 'src/bindings/react.ts',
    vue: 'src/bindings/vue.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  treeshake: true,
});
