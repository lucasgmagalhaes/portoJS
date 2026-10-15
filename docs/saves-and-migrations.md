# Saves and migrations

## Format

`game.save()` returns a plain, JSON-safe object:

```ts
interface SaveData {
  version: number; // your schema version
  savedAt: number; // clock time in ms, the offline reference point
  data: JsonObject; // one entry per system (resources, prestige, ...)
  checksum: string; // 8 hex digits over version + savedAt + data
}
```

Store it as JSON, or use the string forms:

```ts
const text = game.exportSave(); // Base64 of the JSON, safe to copy/paste
game.importSave(text); // validates, migrates, loads
game.load(JSON.parse(raw)); // also accepts an object or a JSON string
```

`BigNum` values are stored as strings such as `"1.5e12"`, so no precision is lost in transit.

## Integrity

Every save carries a checksum computed over a key-order-independent form of its content, so it survives databases that reorder keys. Loading verifies it:

- Truncated or damaged strings throw `SaveCorruptedError`.
- Edited data (or a stale checksum) throws `SaveCorruptedError`.
- Wrong shapes (missing fields, non-integer version, negative balances...) throw `SaveCorruptedError`.

> The checksum is FNV-1a: it catches accidents and casual edits, **not** determined tampering. Anyone can recompute it. If cheating matters, validate on a server.

## Atomic loading

`load` is all-or-nothing. If any system rejects the data, the previous state is restored and the error is rethrown, so a bad save never leaves you in a half-loaded state.

```ts
try {
  game.importSave(userInput);
} catch (error) {
  if (error instanceof SaveCorruptedError) showMessage('That save is damaged.');
  else if (error instanceof SaveVersionError)
    showMessage('That save is from a newer game version.');
  else throw error;
}
```

## Versions and migrations

Set `version` to the current schema version and describe how to upgrade each older one. The entry at key `n` upgrades version `n` to `n + 1`. Migrations are chained automatically.

```ts
const game = createGame({
  // ...
  version: 3,
  migrations: {
    // v1 -> v2: the "gems" resource was added
    1: (data) => ({ ...data, gemsSeen: false }),
    // v2 -> v3: prestige points moved
    2: (data) => {
      const { oldPoints, ...rest } = data;
      return {
        ...rest,
        prestige: { points: oldPoints ?? '0', lifetime: oldPoints ?? '0', count: 0 },
      };
    },
  },
});
```

A v1 save loaded by this game runs `migrations[1]` then `migrations[2]`. Rules:

- A save newer than `version` throws `SaveVersionError` (never guess).
- A missing step throws `SaveVersionError` naming the gap.
- A migration must return an object; anything else throws `SaveVersionError`.
- The migrated save gets a fresh checksum.

`data` is keyed by system id (`resources`, `prestige`, `achievements`, plus your own).

### What needs a version bump?

Built-in systems tolerate additions: unknown ids are ignored, and ids missing from the save start at their defaults. So adding a generator or an upgrade does **not** need a migration. Renaming or removing ids, or changing what a stored value means, does.

## Autosave pattern

```ts
setInterval(() => localStorage.setItem('save', game.exportSave()), 10_000);
addEventListener('pagehide', () => localStorage.setItem('save', game.exportSave()));
```

Saving records `savedAt`, which is what offline progress measures from, so save on `pagehide`/`visibilitychange` as well as on a timer.

## Resetting

`game.reset()` returns every system to its default state, as if loading an empty save.

## Custom systems

A system persists itself through `serialize()` and `deserialize(data)`. `deserialize(undefined)` must restore defaults. Throw `SaveCorruptedError` for data you cannot accept.
