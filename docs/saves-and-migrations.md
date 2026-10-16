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

## Autosave and storage

`Autosave` writes the game to a `SaveStorage` on a timer or on request, keeps rotating backups and loads the newest copy that is not corrupted.

```ts
import { Autosave, WebSaveStorage } from 'portojs';

const autosave = new Autosave(game, new WebSaveStorage(localStorage), {
  intervalMs: 30_000,
  backups: 2,
});

const loaded = await autosave.load(); // main save, else the newest intact backup
autosave.start(); // every 30 s of real time
button.onclick = () => autosave.request(); // debounced: many requests, one save
window.addEventListener('pagehide', () => void autosave.flush());
```

- **Storage:** `MemorySaveStorage` (tests), `WebSaveStorage` (anything shaped like `localStorage`) and `IndexedDbSaveStorage` (larger saves, no blocking). Implement `get`, `set` and `remove` to use anything else.
- **Backups:** before each write the previous main save moves to `<key>.bak1`, that one to `.bak2`, and so on up to `backups`.
- **Recovery:** `load()` skips a corrupted copy and tries the next. If every copy is corrupted it throws `SaveCorruptedError`. A save from a newer game version throws `SaveVersionError` instead of falling back, so progress is not silently lost.
- **Quota:** when a write fails with a quota error, the backups are dropped and the write is retried once.
- **Writes never overlap:** saves are queued, and `failed` fires if an automatic save fails; the next one tries again.

## Save slots

`SaveSlots` keeps several named saves in one storage, like the slots of a console game:

```ts
import { SaveSlots, WebSaveStorage } from 'portojs';

const slots = new SaveSlots(game, new WebSaveStorage(localStorage), { slots: 3 });

await slots.save(2, 'Before the boss');
const list = await slots.list(); // one entry per slot: { slot, label, savedAt, corrupted } or undefined
await slots.load(2);
await slots.copy(2, 3);
await slots.delete(1);
```

The list reads only each slot's name and time, so a menu can show it without loading anything. A slot that holds damaged data shows as `corrupted: true` and can still be overwritten or deleted; loading it throws `SaveCorruptedError`, and loading an empty slot throws `SlotEmptyError`.

## Cloud sync

`CloudSync` keeps the local save and a cloud copy in step. The cloud can be any `SaveStorage`: your server, a platform's cloud storage.

```ts
import { CloudSync } from 'portojs';

const sync = new CloudSync(localStorageAdapter, serverStorage, {
  policy: 'furthest',
  progress: (save) => totalGoldEarned(save),
});

const { action, conflict } = await sync.sync(); // at start, and after saving
if (action === 'downloaded') game.load((await localStorageAdapter.get('save')) ?? '');
```

When only one side has a save, it is copied to the other. When both differ, the `policy` decides:

- `newest` (default): the later `savedAt` wins; a tie goes to the device.
- `furthest`: the higher `progress(save)` wins, so a player does not lose progress to a newer but emptier save; ties go to the newest.
- a function `(local, cloud) => 'local' | 'cloud' | mergedSave`: return a save with `version`, `savedAt` and `data` to merge them; its checksum is recomputed and it is written to both sides.

A damaged side always loses to a readable one, and two damaged sides throw `SaveCorruptedError`. Sync compares `savedAt` and your `progress` only; it never loads the save into the game, so a save from a newer game version still syncs.

## One tab at a time

Two tabs playing the same game overwrite each other's saves. `TabLock` lets only one in, using the Web Locks API:

```ts
import { TabLock } from 'portojs';

const lock = new TabLock({ name: 'my-game' });
if (!(await lock.acquire())) {
  showMessage('The game is open in another tab.');
  await lock.acquire({ wait: true }); // continue when the other tab closes
}
startGame();
```

The lock is released when the tab closes or on `lock.release()`. Where the Web Locks API is missing (`lock.supported` is `false`) it cannot be enforced and `acquire` always succeeds.
