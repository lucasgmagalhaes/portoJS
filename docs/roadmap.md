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

**Documentation site (done)**

The guides moved to a VitePress site with its own theme and logo, light and dark:

- **Tutorials:** four guided paths (hello game, first idle game, sprite game, bouncing ball). Every listing is a real file under `docs/tutorials/code`, imported into the page and run by the automated tests, so the tutorials cannot rot.
- **Catalogue:** a searchable, filterable list of every package, component, system, tool and example. A test checks that each entry names a real package, a real export and an existing guide page.
- **API reference:** generated by TypeDoc for every package, one module per `@portojs/*` package.
- **Playground:** in-browser editor that runs the library.

**Rust and WebAssembly (decided)**

No code of our own is written in Rust. The numbers behind the decision (`pnpm bench`, Node 24):

| Workload                                          | Cost per frame |
| ------------------------------------------------- | -------------- |
| ECS move system and sprite collection, 10k        | ~0.4 ms        |
| ECS move system and sprite collection, 50k        | ~2 ms          |
| Sprite batch build, 50k instances                 | ~0.1 ms        |
| Physics step on Rapier (WebAssembly), 2000 bodies | ~2.7 ms        |

The CPU-heavy part that really benefits from WebAssembly, physics, already ships as an optional package on Rapier's prebuilt WebAssembly, so nothing of ours needs a Rust toolchain. The core stays TypeScript, and the whole `portojs` umbrella is still about 15 KB brotli. Candidates such as pathfinding or particle simulation do not exist as packages yet; if one is added and a benchmark shows JavaScript is not enough for it, the decision can be reopened for that package alone.

**Platform**

- Done: Telegram and TikTok adapters (`@portojs/platform`), verified with fakes; try them in the real clients.

- Done: Web Worker helper (`@portojs/worker`).
- Done: optional compressed save format (`exportSave({ compress: true })`) and localisable number formatting (`SUFFIX_SETS`, `decimal`).

## 5. How releases work

1. Merge PRs with Conventional Commit titles (`feat:`, `fix:`, `perf:`, `docs:` ...).
2. `release-please` keeps a release PR open that bumps the version and writes `CHANGELOG.md` from those commits. Before 1.0, `feat` bumps the minor and `fix` bumps the patch; a `!` or `BREAKING CHANGE:` also bumps the minor.
3. Merging the release PR tags the release and creates the GitHub release. A `publish` job then builds, runs `pnpm check:package` and publishes every package with `pnpm -r publish --provenance`. It skips versions that are already on npm.

One-time setup on GitHub:

- Settings → Actions → General → allow GitHub Actions to create pull requests.

- Add an `NPM_TOKEN` repository secret (an npm automation token for the `@portojs` scope and for `portojs` and `create-portojs`). Until it exists the publish job only prints a warning, so nothing breaks.
- The first release of each package needs the scope to exist on npm and the account to be allowed to publish there.
- Because each PR is merged with its commits (rebase), every Conventional Commit becomes a changelog line.
