# Saves and migrations

## Format

`game.save()` returns a plain, JSON-safe object:

```ts
interface SaveData {
  version: number; // your schema version
  savedAt: number; // clock time in ms, the offline reference point
  data: JsonObject; // { objects: { [objectName]: { [componentKey]: data } } }
  checksum: string; // 8 hex digits over version + savedAt + data
}
```

Each component stores its own state through `onSave()`, keyed by its object's name and its `typeId`. Store the whole thing as JSON, or use the string forms:

```ts
const text = game.exportSave(); // Base64 of the JSON, safe to copy/paste
game.importSave(text); // validates, migrates, loads
game.load(JSON.parse(raw)); // also accepts an object or a JSON string
```

`BigNum` values are stored as strings such as `"1.5e12"`, so no precision is lost in transit.

## Compressed saves

Big games make big saves. Ask for a compressed export and loading accepts both forms:

```ts
const small = game.exportSave({ compress: true }); // "~" + Base64 of LZW-compressed JSON
game.importSave(small); // same call as before
```

Compression is pure JavaScript and synchronous, with no dependencies. Repetitive saves, such as thousands of similar generators, shrink several times over. The checksum still guards the content, and `maxSaveChars` also limits how far a compressed string may expand, so a hostile string cannot exhaust memory.

## Integrity

Every save carries a checksum computed over a key-order-independent form of its content, so it survives databases that reorder keys. Loading verifies it:

- Truncated or damaged strings throw `SaveCorruptedError`.
- Edited data (or a stale checksum) throws `SaveCorruptedError`.
- Wrong shapes (missing fields, non-integer version, negative balances...) throw `SaveCorruptedError`.

> The checksum is FNV-1a: it catches accidents and casual edits, **not** determined tampering. Anyone can recompute it. If cheating matters, validate on a server.

## Size limit

Strings longer than `maxSaveChars` (default 10,000,000 characters) are rejected with `SaveCorruptedError` before any decoding, so an oversized paste or upload cannot exhaust memory. Raise or lower it when creating the game: `new Game({ maxSaveChars: 2_000_000 })`.

## Atomic loading

`load` is all-or-nothing. If any component rejects the data, the previous state is restored and the error is rethrown, so a bad save never leaves you in a half-loaded state.

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

Set `version` to the current schema version and describe how to upgrade each older one. The entry at key `n` upgrades version `n` to `n + 1`. Migrations are chained automatically and receive the `data` object.

```ts
const game = new Game({
  version: 3,
  migrations: {
    // v1 -> v2: the object "Gold" was renamed "Coins"
    1: (data) => {
      const objects = { ...(data['objects'] as JsonObject) };
      objects['Coins'] = objects['Gold'] ?? {};
      delete objects['Gold'];
      return { ...data, objects };
    },
    // v2 -> v3: nothing changed in the layout
    2: (data) => data,
  },
});
```

A v1 save loaded by this game runs `migrations[1]` then `migrations[2]`. Rules:

- A save newer than `version` throws `SaveVersionError` (never guess).
- A missing step throws `SaveVersionError` naming the gap.
- A migration must return an object; anything else throws `SaveVersionError`.
- The migrated save gets a fresh checksum.

### What needs a version bump?

Adding objects or components does **not**: components missing from a save get `onLoad(undefined)` and start at their defaults, and data for objects that no longer exist is ignored. Renaming an object or a `typeId`, removing one, or changing what a stored value means does.

## Autosave pattern

```ts
setInterval(() => localStorage.setItem('save', game.exportSave()), 10_000);
addEventListener('pagehide', () => localStorage.setItem('save', game.exportSave()));
```

Saving records `savedAt`, which is what offline progress measures from, so save on `pagehide` / `visibilitychange` as well as on a timer.

## Resetting

`game.reset()` returns every component to its default state, as if loading an empty save.

## Custom components

A component persists itself through `onSave()` and `onLoad(data)`. `onLoad(undefined)` must restore defaults. Throw `SaveCorruptedError` for data you cannot accept. Give the component a `static typeId` so its key does not depend on the class name.
