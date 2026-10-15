import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bignum: 'src/bignum.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  treeshake: true,
});
