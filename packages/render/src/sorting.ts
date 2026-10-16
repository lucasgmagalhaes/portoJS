const ORDER_RANGE = 1024;
const HALF_RANGE = ORDER_RANGE / 2;
const MAX_LAYERS = 31;

/**
 * Named draw layers. Layers draw from the first name given to the last; inside a layer a
 * sprite's `order` decides, from `-512` to `511`. Use {@link SortingLayers.key} for the number to
 * put in `SpriteDraw.layer` or `Sprite.layer` (a signed 16-bit field).
 *
 * @example
 * const layers = new SortingLayers(['background', 'world', 'effects', 'ui']);
 * batch.add(texture, { ...draw, layer: layers.key('world', 3) });
 */
export class SortingLayers {
  private readonly indexes = new Map<string, number>();

  /**
   * @param names layer names from back to front.
   * @throws {RangeError} on a duplicate name or more than 31 layers.
   */
  constructor(names: readonly string[]) {
    if (names.length > MAX_LAYERS) {
      throw new RangeError(`SortingLayers: at most ${MAX_LAYERS} layers fit a 16-bit layer key`);
    }
    for (const name of names) {
      if (this.indexes.has(name)) throw new RangeError(`SortingLayers: duplicate layer "${name}"`);
      this.indexes.set(name, this.indexes.size);
    }
  }

  /**
   * The layer names, back to front.
   */
  get names(): readonly string[] {
    return [...this.indexes.keys()];
  }

  /**
   * The key for a layer and an order inside it.
   *
   * @throws {RangeError} for an unknown layer or an order outside `-512` to `511`.
   */
  key(layer: string, order = 0): number {
    const index = this.indexes.get(layer);
    if (index === undefined) throw new RangeError(`SortingLayers: unknown layer "${layer}"`);
    if (!Number.isInteger(order) || order < -HALF_RANGE || order >= HALF_RANGE) {
      throw new RangeError(`SortingLayers: order must be an integer from -512 to 511`);
    }
    return index * ORDER_RANGE + order + HALF_RANGE;
  }

  /**
   * The `order` for sorting by vertical position inside a layer, as top-down games do: sprites
   * lower on the screen draw in front. `y` is clamped into the supported range after being
   * divided by `unitsPerStep`.
   */
  static ySort(y: number, unitsPerStep = 1): number {
    return Math.max(-HALF_RANGE, Math.min(HALF_RANGE - 1, Math.round(y / unitsPerStep)));
  }
}
