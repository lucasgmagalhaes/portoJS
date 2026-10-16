import type { OfflineReport } from '@portojs/core';
import { SaveCorruptedError, importSave } from '@portojs/core';
import type { Game } from './game.ts';
import type { SaveStorage } from './storage.ts';

/**
 * What the slot list shows about a save.
 */
export interface SlotInfo {
  /**
   * The slot number, from `1`.
   */
  readonly slot: number;
  /**
   * The name given when saving, or empty.
   */
  readonly label: string;
  /**
   * Clock time of the save in ms.
   */
  readonly savedAt: number;
  /**
   * `true` when the slot holds data that cannot be read. It can still be overwritten or deleted.
   */
  readonly corrupted: boolean;
}

/**
 * Options of {@link SaveSlots}.
 */
export interface SaveSlotsOptions {
  /**
   * Prefix of the storage keys: slot 2 is stored as `<key>.slot2`. Default `save`.
   */
  readonly key?: string;
  /**
   * How many slots there are. Default `3`.
   */
  readonly slots?: number;
  /**
   * Store saves in the compressed format. Default `false`.
   */
  readonly compress?: boolean;
}

/**
 * Thrown when loading or copying from a slot with nothing in it.
 */
export class SlotEmptyError extends Error {
  override readonly name = 'SlotEmptyError';
}

interface Envelope {
  readonly label: string;
  readonly save: string;
}

function readEnvelope(text: string): Envelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveCorruptedError('The slot does not hold a save');
  }
  const { label, save } = (parsed ?? {}) as { label?: unknown; save?: unknown };
  if (typeof save !== 'string') throw new SaveCorruptedError('The slot does not hold a save');
  return { label: typeof label === 'string' ? label : '', save };
}

/**
 * Several named save games in one storage, like the slots of a console game. The list shows
 * each slot's name and time without loading it.
 *
 * @example
 * const slots = new SaveSlots(game, new WebSaveStorage(localStorage), { slots: 3 });
 * await slots.save(2, 'Before the boss');
 * const list = await slots.list(); // [undefined, { slot: 2, label: 'Before the boss', ... }, undefined]
 * await slots.load(2);
 */
export class SaveSlots {
  private readonly key: string;
  private readonly count: number;
  private readonly compress: boolean;

  /**
   * @throws {RangeError} if `slots` is not a positive integer.
   */
  constructor(
    private readonly game: Game,
    private readonly storage: SaveStorage,
    options: SaveSlotsOptions = {},
  ) {
    this.key = options.key ?? 'save';
    this.count = options.slots ?? 3;
    this.compress = options.compress ?? false;
    if (!Number.isInteger(this.count) || this.count < 1) {
      throw new RangeError('SaveSlots: slots must be an integer >= 1');
    }
  }

  /**
   * The number of slots.
   */
  get size(): number {
    return this.count;
  }

  /**
   * One entry per slot, in order: the slot's info, or `undefined` when it is empty.
   */
  async list(): Promise<(SlotInfo | undefined)[]> {
    const found: (SlotInfo | undefined)[] = [];
    for (let slot = 1; slot <= this.count; slot++) found.push(await this.info(slot));
    return found;
  }

  /**
   * Saves the game into a slot, replacing what was there.
   *
   * @param label a name to show in the list.
   * @throws {RangeError} for a slot outside `1` to the number of slots.
   */
  async save(slot: number, label = ''): Promise<SlotInfo> {
    this.check(slot);
    const save = this.game.exportSave(this.compress ? { compress: true } : undefined);
    const envelope: Envelope = { label, save };
    await this.storage.set(this.slotKey(slot), JSON.stringify(envelope));
    return { slot, label, savedAt: importSave(save).savedAt, corrupted: false };
  }

  /**
   * Loads a slot into the game.
   *
   * @throws {SlotEmptyError} if the slot is empty.
   * @throws {SaveCorruptedError} if the slot holds damaged data.
   * @throws {RangeError} for a slot outside the range.
   */
  async load(slot: number): Promise<OfflineReport | undefined> {
    const envelope = await this.read(slot);
    return this.game.load(envelope.save);
  }

  /**
   * Empties a slot. Does nothing if it is already empty.
   */
  async delete(slot: number): Promise<void> {
    this.check(slot);
    await this.storage.remove(this.slotKey(slot));
  }

  /**
   * Copies one slot over another, keeping the name.
   *
   * @throws {SlotEmptyError} if the source slot is empty.
   */
  async copy(from: number, to: number): Promise<void> {
    const text = await this.storage.get(this.slotKey(this.check(from)));
    if (text === null) throw new SlotEmptyError(`Slot ${from} is empty`);
    await this.storage.set(this.slotKey(this.check(to)), text);
  }

  private async info(slot: number): Promise<SlotInfo | undefined> {
    const text = await this.storage.get(this.slotKey(slot));
    if (text === null) return undefined;
    try {
      const envelope = readEnvelope(text);
      return {
        slot,
        label: envelope.label,
        savedAt: importSave(envelope.save).savedAt,
        corrupted: false,
      };
    } catch (error) {
      if (!(error instanceof SaveCorruptedError)) throw error;
      return { slot, label: '', savedAt: 0, corrupted: true };
    }
  }

  private async read(slot: number): Promise<Envelope> {
    const text = await this.storage.get(this.slotKey(this.check(slot)));
    if (text === null) throw new SlotEmptyError(`Slot ${slot} is empty`);
    return readEnvelope(text);
  }

  private check(slot: number): number {
    if (!Number.isInteger(slot) || slot < 1 || slot > this.count) {
      throw new RangeError(`SaveSlots: slot must be an integer from 1 to ${this.count}`);
    }
    return slot;
  }

  private slotKey(slot: number): string {
    return `${this.key}.slot${slot}`;
  }
}
