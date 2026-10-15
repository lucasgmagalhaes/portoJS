# Engineering audit and roadmap

A code-level review of what `leveling` needs to become a dependable, widely used engine. Findings come from measurements on this repository (coverage, `publint`, `are-the-types-wrong`, runtime probes, benchmarks), not from guesses. Items marked **done** were fixed while writing this document.

## 1. Measured state

| Check                     | Result                                                                  |
| ------------------------- | ----------------------------------------------------------------------- |
| Tests                     | 228 passing (unit + property-based)                                     |
| Coverage                  | 98.6% statements, 94.0% branches, 98.9% functions, 99.4% lines          |
| Package lint (`publint`)  | clean                                                                   |
| Types (`attw`)            | clean for node10, node16 (CJS and ESM) and bundler resolution           |
| Bundle                    | `dist/index.js` 64 KB raw, 16 KB gzip (unminified, everything included) |
| Tick, 10,000 generators   | ~0.6 ms per 100 ms step; ~0.8 ms with chained tiers                     |
| Offline 24 h, 10,000 gens | ~5 ms flat, ~24 ms chained (closed form)                                |
| `save()` / `exportSave()` | ~15 ms / ~29 ms with 10,000 generators                                  |

## 2. Findings

### Release and packaging

| #   | Finding                                                                                                                                                                  | Status                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| P1  | No changelog, no versioning flow, no publish pipeline                                                                                                                    | **done** (release-please + npm publish with provenance)                                              |
| P2  | `package.json` lacked `repository`, `bugs`, `homepage`, `author`, `publishConfig`                                                                                        | **done**                                                                                             |
| P3  | CI matrix used Node 18 and 20, but the dev tooling needs newer Node (vitest 5 needs 22.12+, tsup 9 needs 22.18+, ESLint 10 needs 20.19+), so those jobs could never pass | **done** (checks on 22/24; built output smoke-tested on 18/20/22/24)                                 |
| P4  | No automated check that the published artifact works for ESM and CJS consumers                                                                                           | **done** (`pnpm smoke`, `pnpm check:package`)                                                        |
| P5  | No dependency update automation, no `SECURITY.md`                                                                                                                        | **done**                                                                                             |
| P6  | PR titles are not validated, but squash merges turn them into changelog entries                                                                                          | **done** (`pr-title.yml`)                                                                            |
| P7  | Release PRs opened with the default `GITHUB_TOKEN` do not trigger CI                                                                                                     | open: use a PAT or GitHub App token for release-please                                               |
| P8  | No bundle-size budget                                                                                                                                                    | open: add `size-limit` (budget: bignum-only entry, core-only entry)                                  |
| P9  | No API-surface guard against accidental breaking changes                                                                                                                 | open: add `@microsoft/api-extractor` report checked in CI before 1.0                                 |
| P10 | Single entry point; consumers who only need `BigNum` still import through the whole barrel                                                                               | open: add `leveling/bignum` and `leveling/core` subpath exports (the code is already layered for it) |

### Runtime and correctness

| #   | Finding                                                                                                           | Status                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| R1  | Verified: a running game kept a Node process alive forever (the default `setInterval` is ref'd)                   | **done** (`createIntervalScheduler({ unref: true })`)                               |
| R2  | `a < b` or `a + 1` on `BigNum` silently compared strings                                                          | **done** (`Symbol.toPrimitive` now throws)                                          |
| R3  | No way to tear a game down (UI unmount, tests)                                                                    | **done** (`Core.dispose()`)                                                         |
| R4  | `BigNum` mantissa is a double: ~15 significant digits, and two doubles within 1 ulp can map to the same BigNum    | accepted, documented; revisit only if a game needs more precision                   |
| R5  | Chained generators use explicit Euler per tick; offline uses the exact polynomial, so they differ slightly        | accepted, documented in `docs/offline-progress.md`; option: sub-stepping for chains |
| R6  | `Core.load` does not clear the engine's time accumulator; up to one step of pending time carries across a load    | open, minor                                                                         |
| R7  | Save import has no size limit: a huge Base64 string is fully decoded and parsed                                   | open: add `maxSaveBytes` to `Core` options                                          |
| R8  | `createGame` cannot install extra plugins with merged types                                                       | open: accept `plugins` and merge `ApiOf`/`EventsOf` into the return type            |
| R9  | Achievement `effect` re-runs on load, so non-idempotent effects double-apply                                      | documented; consider a stricter API (effects declared as modifiers)                 |
| R10 | Offline `appliedMs` reflects the cap and efficiency but not time lost to `catch-up` dropping outside `background` | by design                                                                           |

### Performance

| #   | Finding                                                                                                       | Status                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| F1  | Each tick allocates BigNum objects per generator (`add`, `mul`, `mul`); at 10k generators this is GC pressure | open: cache `rate × multiplier × dt` per generator and skip unchanged work                  |
| F2  | `save()` converts every BigNum to a string each call (~15 ms at 10k generators)                               | open: dirty-tracking or incremental serialization; autosave every few seconds is fine today |
| F3  | Chained offline (24 ms at 10k) allocates polynomial arrays per generator                                      | open: reuse buffers; only worth it past ~100k generators                                    |

### Test and quality gaps

| #   | Finding                                                                                                        | Status                                                                |
| --- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| T1  | Uncovered branches remain in `core.ts` (lines 134, 209, 315), `flows.ts` validation, `resources.ts` (120, 358) | open: low-risk guard clauses                                          |
| T2  | No property test asserting "ticking for T equals offline for T" on random linear configs                       | open: high value, cheap                                               |
| T3  | No test in a real browser (visibility throttling, `localStorage`, `pagehide`)                                  | open: Playwright against the example                                  |
| T4  | ESLint is not type-aware (`recommendedTypeChecked`, `no-floating-promises`, `no-unnecessary-condition`)        | open                                                                  |
| T5  | No mutation testing                                                                                            | open: Stryker on `bignum` and `save` first                            |
| T6  | No fuzzing of `parseSave`/`importSave` with arbitrary strings                                                  | open: fast-check `fc.string()` → must throw only `SaveCorruptedError` |

## 3. Feature roadmap

**Before 1.0 (stabilise)**

1. Resolve P7–P10, R6–R8 and T1–T6.
2. Freeze the plugin contract (`System`, `Kernel`, `definePlugin`) and document the stability promise.
3. Publish `0.1.0` through the release PR.

**Mechanics as plugins**

- Auto-buyers (rules that run `buy` on a schedule).
- Unlock conditions (generators and upgrades hidden until a condition holds).
- Challenges / run modifiers.
- Multiple prestige layers sharing one reset primitive.
- Time-limited events and boosts.

**Developer experience**

- Documentation site (VitePress) with generated API reference and a live playground.
- Balancing tools: a headless simulator that fast-forwards a config and reports time-to-milestone and cost curves.
- Devtools: inspect state, edit values, fast-forward time.
- Framework bindings as separate packages: `@leveling/react`, `@leveling/vue`, `@leveling/svelte`.

**Platform**

- Web Worker helper to run the simulation off the main thread.
- Optional compressed save format.
- Localisable number suffix sets.

## 4. How releases work now

1. Merge PRs with Conventional Commit titles (`feat:`, `fix:`, `perf:`, `docs:` ...).
2. `release-please` keeps a release PR open that bumps the version and writes `CHANGELOG.md` from those commits. Before 1.0, `feat` bumps the minor and `fix` bumps the patch; a `!` or `BREAKING CHANGE:` also bumps the minor.
3. Merging the release PR tags the release, creates the GitHub release, and the `publish` job runs lint, typecheck, tests, build and package checks, then `pnpm publish --provenance`.

One-time setup on GitHub:

- Add an `NPM_TOKEN` repository secret (an npm automation token with publish rights to `leveling`).
- Settings → Actions → General → allow GitHub Actions to create pull requests.
- Optionally set the PR merge method to "squash" so each PR title becomes one changelog line.
