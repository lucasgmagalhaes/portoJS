# Engineering audit and roadmap

A code-level review of what `portojs` needs to become a dependable, widely used engine. Findings come from measurements on this repository (coverage, `publint`, `are-the-types-wrong`, runtime probes, benchmarks), not from guesses.

## 1. Measured state

| Check                     | Result                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| Tests                     | unit, property-based and browser (Playwright) tests               |
| Coverage                  | about 98% of statements and lines, about 94% of branches          |
| Package lint (`publint`)  | clean                                                             |
| Types (`attw`)            | clean for node10, node16 (CJS and ESM) and bundler resolution     |
| Bundle (brotli, minified) | `portojs/bignum` ~2 KB, `portojs/core` ~8.6 KB, everything ~14 KB |
| Tick, 10,000 generators   | ~0.5 ms per 100 ms step; ~0.7 ms with chained tiers               |
| Offline 24 h, 10k gens    | ~4 ms flat, ~24 ms chained (closed form)                          |
| `save()` / `exportSave()` | ~13 ms / ~34 ms with 10,000 generators                            |

## 2. Architecture

The engine is a **Unity-style runtime** (`Game`, `GameObject`, `Component`) on a game-agnostic core (big numbers, clock, fixed-timestep engine, saves, offline). Idle mechanics live in `portojs/idle` as ordinary components that use only the public runtime API.

An earlier version used a functional plugin kernel (`createCore`, `definePlugin`, `createGame`). It was replaced by the component model because references between mechanics are now real objects (`produces: gold`) instead of string ids, behavior is added the way Unity developers expect, and the idle mechanics became fully optional.

## 3. Findings

### Release and packaging

| #   | Finding                                                           | Status                                                          |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| P1  | Changelog and versioning                                          | **done** (release-please; npm publishing not automated yet)     |
| P2  | Package metadata, publish config                                  | **done**                                                        |
| P3  | CI on supported Node versions, runtime smoke test, package checks | **done**                                                        |
| P6  | PR titles feed the changelog                                      | **done** (`pr-title.yml`)                                       |
| P7  | Release PRs do not trigger CI                                     | **done** (CI is dispatched on the release branch)               |
| P8  | Bundle-size budget                                                | **done** (`pnpm size`, enforced in CI)                          |
| P9  | API-surface guard                                                 | **done** (`api-extractor` report checked in CI)                 |
| P10 | Subpath exports                                                   | **done** (`portojs/core`, `/bignum`, `/idle`, `/react`, `/vue`) |

### Runtime and correctness

| #   | Finding                                                                           | Status                                                |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| R1  | A running game kept a Node process alive                                          | **done** (`createIntervalScheduler({ unref: true })`) |
| R2  | `a < b` on `BigNum` compared strings silently                                     | **done** (`Symbol.toPrimitive` throws)                |
| R3  | No way to tear a game down                                                        | **done** (`Game.dispose()`)                           |
| R4  | `BigNum` mantissa is a double: ~15 significant digits                             | accepted, documented                                  |
| R5  | Chained generators use explicit Euler per tick; offline uses the exact polynomial | accepted, documented                                  |
| R6  | Pending loop time carried across a load                                           | **done**                                              |
| R7  | Save import had no size limit                                                     | **done** (`maxSaveChars`)                             |
| R8  | Extra mechanics next to the built-ins                                             | **done** (everything is a component)                  |
| R9  | An achievement `effect` re-runs on load, so a non-idempotent effect applies twice | documented; effects should be idempotent              |

### Performance

| #   | Finding                            | Status                                              |
| --- | ---------------------------------- | --------------------------------------------------- |
| F1  | Per-tick allocations               | **done** (cached `rate × multiplier × dt`)          |
| F2  | `save()` cost with many generators | **partly done** (generator JSON cached by identity) |
| F3  | Chained offline allocations        | open: only worth it past ~100k generators           |

### Tests and quality

| #   | Finding                     | Status                                                                                                                                                                                           |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | Coverage gaps               | **done**                                                                                                                                                                                         |
| T2  | Tick vs offline equivalence | **done** (property test)                                                                                                                                                                         |
| T3  | Real browser tests          | **done** (`pnpm e2e`)                                                                                                                                                                            |
| T4  | Type-aware ESLint           | **done**                                                                                                                                                                                         |
| T5  | Mutation testing            | tried, not adopted: Stryker 10 with Vitest 5 killed only 17% of mutants (0% in `save`) despite thorough tests, so the runner does not apply mutants correctly; revisit when it supports Vitest 5 |
| T6  | Fuzzing `importSave`        | **done**                                                                                                                                                                                         |

## 4. Roadmap

**Engine**

- Done: prefabs (`Prefab`, `Game.instantiate`), JSON scenes (`loadScene`) and coroutines.
- Exporting a live game back to a scene description.
- Saving coroutine progress (they are runtime-only today).

**Idle mechanics**

- Done: time-limited events (`LiveEvent`) with a calendar.
- Done: polynomial and stepped cost curves and a cost chart.

**Developer experience**

- Done: balancing simulator and devtools (`@portojs/tools`).
- Done: Svelte and Solid bindings, and 2D physics on Rapier (`@portojs/physics`).

**Documentation site (planned for the end)**

The guides are static Markdown today. Once the packages settle, replace them with a proper documentation site. Decisions still to make:

- **Theme and design:** visual identity, colours, typography, dark and light modes, logo.
- **Catalogue:** a browsable list of every package, component, system and example, with live demos and the API of each.
- **Tutorials:** a guided path from "hello game" to a complete idle game and a sprite game, with runnable steps.
- **Structure:** one section per package, cookbook recipes, migration notes from Unity and Phaser, and the playground.
- **Tooling:** keep VitePress or move to a custom site; generate the API pages from the packages' API reports.

**To decide at the end**

- Rust and WebAssembly for hot spots of our own. (`@portojs/physics` already uses Rapier's prebuilt WebAssembly as an optional package; nothing of ours is written in Rust.) The core stays TypeScript (measured: 50,000 entities cost about 2 ms per frame in JS, and the umbrella package is about 13 KB). Candidates are optional packages only: physics through Rapier, and heavy CPU-bound work such as pathfinding or particle simulation, and only if a benchmark shows JavaScript is not enough.

**Platform**

- Web Worker helper to run the simulation off the main thread.
- Done: optional compressed save format (`exportSave({ compress: true })`) and localisable number formatting (`SUFFIX_SETS`, `decimal`).

## 5. How releases work

1. Merge PRs with Conventional Commit titles (`feat:`, `fix:`, `perf:`, `docs:` ...).
2. `release-please` keeps a release PR open that bumps the version and writes `CHANGELOG.md` from those commits. Before 1.0, `feat` bumps the minor and `fix` bumps the patch; a `!` or `BREAKING CHANGE:` also bumps the minor.
3. Merging the release PR tags the release and creates the GitHub release. **Nothing is published to npm**: publishing is deliberately not automated yet.

One-time setup on GitHub:

- Settings → Actions → General → allow GitHub Actions to create pull requests.
- Optionally set the PR merge method to "squash" so each PR title becomes one changelog line.

When it is time to publish, add a job to `.github/workflows/release.yml` that runs after a release is created (`release_created` output), with an `NPM_TOKEN` secret and `pnpm publish --provenance`. The package already passes `publint` and `attw` (`pnpm check:package`).
