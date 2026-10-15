import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    core: 'src/core/index.ts',
    bignum: 'src/core/bignum/index.ts',
    mechanics: 'src/mechanics/index.ts',
  },
  format: ['esm', 'cjs'],
  // Shared chunks keep one copy of classes such as BigNum across entries, so `instanceof`
  // works even when a consumer imports from several subpaths (including in CJS).
  splitting: true,
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  treeshake: true,
});
