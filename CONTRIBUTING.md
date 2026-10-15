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
```

CI runs the same checks on every pull request.

## Guidelines

- **Zero runtime dependencies.** Dev dependencies are fine.
- **Strict TypeScript, no `any`.** Prefer precise types over casts; when a cast is unavoidable, explain it in a comment.
- **Document the public API** with JSDoc: what it does, parameters, thrown errors, an `@example` when useful.
- **Keep the core game-agnostic.** Anything specific to a kind of game (resources, prestige, achievements...) belongs in `src/mechanics` as a plugin that uses only the public kernel API.
- **Test what you change.** Cover edge cases: zero, negative, huge values, a clock going backwards, corrupted input. The `BigNum` type has property-based tests (fast-check); add properties when you add operations.
- **Be deterministic.** Never read the real clock in logic; use the injected `Clock`.

## Project layout

```
src/core/          game-agnostic kernel: bignum, clock, events, engine, save, offline, plugins
src/mechanics/     plugins: resources (with generators and upgrades), prestige, achievements
src/game.ts        createGame: the declarative convenience wrapper
test/              Vitest unit and property tests
bench/             benchmarks (pnpm bench)
docs/              guides
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
