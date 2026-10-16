# Working agreements

## Commits

- Make small, atomic commits, always: one logical step each (a type, one behaviour with its test, the docs, the API report). Never one big commit per feature.
- Author commits as the repository owner (`Lucas Gomes <lucasgsm88@gmail.com>`), never as Claude, and do not add `Co-Authored-By` or other attribution trailers.
- Use Conventional Commit messages (`feat(scope):`, `fix:`, `docs:`, `test:`, `chore:`); release-please builds the changelog from them.

## Finishing a task

- When a task is finished, open a pull request and merge it. Do not wait for CI.
- Before merging, run locally: `npx eslint .`, `npx tsc --noEmit`, `npx vitest run`, and `pnpm api:update` when a public API changed.

## Code rules enforced by lint

- JSDoc blocks span several lines; no plain comments.
- No inline functions as call arguments in library code (declare a named function or a const).
- No non-null assertions (`!`); use `?? fallback` or a narrowing check.
