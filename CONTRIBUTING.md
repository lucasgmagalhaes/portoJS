# Contributing to PortoJS

Thanks for helping! This project is a small, well-tested library; the bar is "boring and correct".

## Setup

You need Node 18+ and [pnpm](https://pnpm.io).

```
pnpm install
pnpm test:watch     # while developing
```

## Before opening a PR

```
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm size && pnpm api:check
pnpm e2e   # browser tests; first run: pnpm exec playwright install chromium
```

If you change the public API on purpose, refresh the report with `pnpm api:update` and commit the changed `packages/*/etc/*.api.md` reports.

CI runs the same checks on every pull request.

## Guidelines

- **No plain comments.** ESLint rejects `//` and `/* */` comments. Express intent with names, types and small functions, and document the API with JSDoc (`/** ... */`). Tool directives such as `eslint-disable` and `@ts-expect-error` are allowed.
- **No inline functions in library code.** Under `packages/*/src/`, do not pass an arrow or function expression directly as an argument (`.map((x) => ...)`). Use a loop, or declare a named function or const and pass it by name. Tests, benchmarks and examples are exempt.
- **Zero runtime dependencies.** Dev dependencies are fine.
- **Strict TypeScript, no `any`.** Prefer precise types over casts; when a cast is unavoidable, explain it in a comment.
- **Document the public API** with JSDoc: what it does, parameters, thrown errors, an `@example` when useful.
- **Keep the core game-agnostic.** Anything specific to a kind of game (resources, prestige, achievements...) belongs in `packages/idle` as a component that uses only the public `Game` and `Component` API.
- **Test what you change.** Cover edge cases: zero, negative, huge values, a clock going backwards, corrupted input. The `BigNum` type has property-based tests (fast-check); add properties when you add operations.
- **Be deterministic.** Never read the real clock in logic; use the injected `Clock`.

## Project layout

```
packages/core/     infrastructure: bignum, clock, events, engine, save, offline
packages/runtime/  Game, GameObject, Component, GameEvent, coroutines, prefabs, scenes
packages/idle/     optional idle mechanics as components (resources, generators, prestige...)
test/              Vitest unit and property tests
packages/portojs/  the umbrella package that re-exports the others
packages/react|vue UI bindings
bench/             benchmarks (pnpm bench)
docs/              guides and the VitePress site (`pnpm docs:dev`, `pnpm docs:build`)
examples/clicker/  browser example (Vite)
```

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org). Keep commits small and focused, written in English.

```
feat(resources): add linear cost curve
fix(save): reject negative balances
docs: explain offline efficiency
test(bignum): cover subnormal inputs
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`.

## Reporting bugs and proposing features

Use the issue templates. For bugs, a failing test or a minimal reproduction using `ManualClock` is the fastest path to a fix.

## Code of conduct

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Build

Each package builds with [Vite](https://vite.dev) in library mode (ESM and CJS, shared chunks) through the shared `vite.library.ts`, then `tsc` emits the `.d.ts` files and `scripts/build-cjs-types.mjs` derives the matching `.d.cts`. [Lerna](https://lerna.js.org) runs the builds in dependency order: `pnpm build`.
