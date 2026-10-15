import { BigNum } from '../core/bignum/index.js';
import type { BigNumLike } from '../core/bignum/index.js';
import { SaveCorruptedError, isJsonObject } from '../core/save/index.js';
import type { JsonValue } from '../core/save/index.js';
import { Component, GameEvent } from '../runtime/index.js';
import type { GameObject } from '../runtime/index.js';
import { Economy } from './economy.js';
import type { Resource } from './resource.js';
import { readBig } from './shared.js';
import type { EffectTarget, ResetKeep } from './shared.js';

/**
 * Preset formula: `scale × (earned / threshold) ^ exponent`, or `0` below the threshold. With
 * the defaults it is the classic square-root curve.
 */
export interface RootFormula {
  /**
   * Basis value at which prestige starts to pay out.
   */
  readonly threshold: BigNumLike;
  /**
   * Curve steepness, `0 < exponent`. Default `0.5`.
   */
  readonly exponent?: number;
  /**
   * Multiplies the result. Default `1`.
   */
  readonly scale?: BigNumLike;
}

/**
 * How many prestige points a basis value is worth. Either a preset {@link RootFormula} or your
 * own function. The result is floored; negatives count as `0`.
 */
export type PrestigeFormula = RootFormula | ((basis: BigNum) => BigNumLike);

/**
 * A permanent bonus that grows with prestige points.
 */
export type PrestigeBonus = EffectTarget &
  (
    | {
        /**
         * Multiplier is `1 + perPoint × points`.
         */
        readonly perPoint: BigNumLike;
      }
    | {
        /**
         * Multiplier computed from the point balance and the lifetime total.
         */
        readonly multiplier: (points: BigNum, lifetime: BigNum) => BigNumLike;
      }
  );

/**
 * Options for {@link Prestige}.
 */
export interface PrestigeOptions {
  /**
   * What the reward is computed from: the total earned of a resource in the current run, or
   * another prestige layer, using the points that layer has produced since a higher layer last
   * reset it.
   */
  readonly basedOn: Resource | Prestige;
  /**
   * Reward formula.
   */
  readonly gain: PrestigeFormula;
  /**
   * Smallest reward that allows prestiging. Default `1`.
   */
  readonly minimum?: BigNumLike;
  /**
   * What survives the run reset. Default: nothing.
   */
  readonly keep?: ResetKeep;
  /**
   * Permanent bonuses derived from this layer's points.
   */
  readonly bonuses?: readonly PrestigeBonus[];
  /**
   * Whether prestiging also clears the points of the layers this one is based on. Default
   * `true`: a bigger reset wipes the layers beneath it.
   */
  readonly resetsLower?: boolean;
}

/**
 * Payload of {@link Prestige.performed}.
 */
export interface PrestigeResult {
  readonly prestige: Prestige;
  /**
   * Points gained by this reset.
   */
  readonly gained: BigNum;
  /**
   * Point balance afterwards.
   */
  readonly points: BigNum;
  /**
   * Prestiges done so far, including this one.
   */
  readonly count: number;
}

function compileFormula(formula: PrestigeFormula): (basis: BigNum) => BigNum {
  if (typeof formula === 'function') return (basis) => BigNum.from(formula(basis));
  const threshold = BigNum.from(formula.threshold);
  const exponent = formula.exponent ?? 0.5;
  const scale = BigNum.from(formula.scale ?? 1);
  if (!threshold.gt(0)) throw new RangeError('Prestige: threshold must be > 0');
  if (!(exponent > 0)) throw new RangeError('Prestige: exponent must be > 0');
  return (basis) =>
    basis.lt(threshold) ? BigNum.ZERO : basis.div(threshold).pow(exponent).mul(scale);
}

/**
 * A prestige layer: reset the run in exchange for permanent points that boost later runs.
 * Stack layers by basing one on another (`basedOn: otherPrestige`); a higher layer then wipes
 * the points of the layers beneath it.
 *
 * @example
 * game.createObject('Ascension').addComponent(Prestige, {
 *   basedOn: gold,
 *   gain: { threshold: 1e6 },
 *   bonuses: [{ all: true, perPoint: 0.1 }],
 * });
 */
export class Prestige extends Component {
  static override typeId = 'Prestige';

  /**
   * Fired after a successful reset.
   */
  readonly performed = new GameEvent<PrestigeResult>();

  private readonly options: PrestigeOptions;
  private readonly formula: (basis: BigNum) => BigNum;
  private readonly minimum: BigNum;
  private balance: BigNum = BigNum.ZERO;
  private gainedTotal: BigNum = BigNum.ZERO;
  private timesDone = 0;
  private gainedThisRun: BigNum = BigNum.ZERO;

  constructor(gameObject: GameObject, options: PrestigeOptions) {
    super(gameObject);
    this.options = options;
    this.formula = compileFormula(options.gain);
    this.minimum = BigNum.from(options.minimum ?? 1);
  }

  override awake(): void {
    const economy = Economy.of(this.game);
    const bonuses = this.options.bonuses ?? [];
    for (let i = 0; i < bonuses.length; i++) {
      const bonus = bonuses[i] as PrestigeBonus;
      economy.setModifier(this.modifierId(i), bonus, this.bonusValue(bonus));
    }
  }

  override onDestroy(): void {
    const economy = Economy.existing(this.game);
    const bonuses = this.options.bonuses ?? [];
    for (let i = 0; i < bonuses.length; i++) economy?.removeModifier(this.modifierId(i));
  }

  /**
   * Points currently held.
   */
  get points(): BigNum {
    return this.balance;
  }

  /**
   * Points gained over all time (spending and resets do not reduce it).
   */
  get lifetime(): BigNum {
    return this.gainedTotal;
  }

  /**
   * Times this layer has been performed.
   */
  get count(): number {
    return this.timesDone;
  }

  /**
   * Points gained since a higher layer last reset this one. The basis of the layer above.
   */
  get gainedSinceReset(): BigNum {
    return this.gainedThisRun;
  }

  /**
   * Points performing it now would grant (`0` below the minimum).
   */
  get pending(): BigNum {
    const basis = this.basisValue();
    const value = this.formula(basis).floor();
    return value.lt(this.minimum) ? BigNum.ZERO : value;
  }

  /**
   * Whether performing it now would grant at least the minimum.
   */
  get canPrestige(): boolean {
    return !this.pending.isZero();
  }

  /**
   * Resets the run, grants the pending points, clears lower layers (unless `resetsLower` is
   * `false`) and keeps what `keep` lists.
   *
   * @returns points gained, or `undefined` (nothing happens) if it cannot be performed yet.
   */
  perform(): BigNum | undefined {
    const gained = this.pending;
    if (gained.isZero()) return undefined;
    this.balance = this.balance.add(gained);
    this.gainedTotal = this.gainedTotal.add(gained);
    this.gainedThisRun = this.gainedThisRun.add(gained);
    this.timesDone += 1;
    if (this.options.resetsLower ?? true) this.clearLowerLayers();
    Economy.of(this.game).resetRun(this.options.keep);
    this.performed.invoke({
      prestige: this,
      gained,
      points: this.balance,
      count: this.timesDone,
    });
    return gained;
  }

  /**
   * Spends points (for a prestige shop). Returns `false` and changes nothing if short.
   *
   * @throws {RangeError} if `amount` is negative.
   */
  spend(amount: BigNumLike): boolean {
    const value = BigNum.from(amount);
    if (value.isNegative()) throw new RangeError('Prestige.spend needs an amount >= 0');
    if (value.gt(this.balance)) return false;
    this.balance = this.balance.sub(value);
    return true;
  }

  /**
   * Clears the points and the since-reset counter, as a higher layer does.
   *
   * @internal
   */
  clearPoints(): void {
    this.balance = BigNum.ZERO;
    this.gainedThisRun = BigNum.ZERO;
  }

  override onSave(): JsonValue {
    return {
      points: this.balance.toJSON(),
      lifetime: this.gainedTotal.toJSON(),
      count: this.timesDone,
      gainedSinceReset: this.gainedThisRun.toJSON(),
    };
  }

  override onLoad(data: JsonValue | undefined): void {
    this.balance = BigNum.ZERO;
    this.gainedTotal = BigNum.ZERO;
    this.gainedThisRun = BigNum.ZERO;
    this.timesDone = 0;
    if (data === undefined) return;
    if (!isJsonObject(data)) throw new SaveCorruptedError('Prestige: save entry must be an object');
    const count = data['count'] ?? 0;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new SaveCorruptedError('Prestige: invalid count');
    }
    this.balance = readBig(data['points'] ?? 0, 'Prestige.points');
    this.gainedTotal = readBig(data['lifetime'] ?? 0, 'Prestige.lifetime');
    this.gainedThisRun = readBig(data['gainedSinceReset'] ?? 0, 'Prestige.gainedSinceReset');
    this.timesDone = count;
  }

  private modifierId(index: number): string {
    return `prestige:${this.gameObject.name}:${index}`;
  }

  private basisValue(): BigNum {
    const basis = this.options.basedOn;
    return basis instanceof Prestige ? basis.gainedSinceReset : basis.earned;
  }

  private clearLowerLayers(): void {
    let lower = this.options.basedOn;
    while (lower instanceof Prestige) {
      lower.clearPoints();
      lower = lower.options.basedOn;
    }
  }

  private readonly bonusValue = (bonus: PrestigeBonus) => (): BigNumLike => {
    if ('perPoint' in bonus) return this.balance.mul(BigNum.from(bonus.perPoint)).add(1);
    return bonus.multiplier(this.balance, this.gainedTotal);
  };
}
