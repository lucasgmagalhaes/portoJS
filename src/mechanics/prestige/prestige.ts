import { BigNum } from '../../core/bignum/index.js';
import type { BigNumLike } from '../../core/bignum/index.js';
import { definePlugin } from '../../core/plugin.js';
import type { Kernel, Plugin } from '../../core/plugin.js';
import { SaveCorruptedError, isJsonObject } from '../../core/save/index.js';
import { RESOURCES_PLUGIN } from '../resources/resources.js';
import type { EffectTarget, ResetKeep, ResourcesApi } from '../resources/types.js';

/**
 * Plugin name.
 */
export const PRESTIGE_PLUGIN = 'prestige';

/**
 * Preset formula: `scale × (earned / threshold) ^ exponent`, or `0` below the threshold.
 * With the defaults it is the classic square-root curve.
 */
export interface RootFormula {
  /**
   * Run total at which prestige starts to pay out.
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
 * How many prestige points a run is worth, from the total earned in it. Either a preset
 * {@link RootFormula} or your own function. The result is floored; negatives count as `0`.
 */
export type PrestigeFormula = RootFormula | ((runEarned: BigNum) => BigNumLike);

/**
 * A permanent bonus that grows with prestige points.
 */
export type PrestigeBonus<R extends string, G extends string> = {
  /**
   * What gets multiplied.
   */
  readonly target: EffectTarget<R, G>;
} & (
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
 * Configuration of the {@link prestige} plugin.
 */
export interface PrestigeConfig<R extends string, G extends string, U extends string> {
  /**
   * Resource whose total earned in the run determines the reward.
   */
  readonly basedOn: R;
  /**
   * Reward formula.
   */
  readonly gain: PrestigeFormula;
  /**
   * Smallest reward that allows prestiging. Default `1`.
   */
  readonly minimum?: BigNumLike;
  /**
   * What survives a prestige reset. Default: nothing.
   */
  readonly keep?: ResetKeep<R, G, U>;
  /**
   * Permanent bonuses derived from prestige points.
   */
  readonly bonuses?: readonly PrestigeBonus<R, G>[];
}

/**
 * Events emitted by the {@link prestige} plugin.
 */
export interface PrestigeEvents {
  /**
   * A prestige reset happened.
   */
  prestige: {
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
  };
}

/**
 * Methods the {@link prestige} plugin adds to the game.
 */
export interface PrestigeApi {
  /**
   * Prestige points currently held.
   */
  prestigePoints(): BigNum;
  /**
   * Prestige points gained over all time (spending does not reduce it).
   */
  prestigeLifetime(): BigNum;
  /**
   * Number of prestiges performed.
   */
  prestigeCount(): number;
  /**
   * Points a prestige would grant right now (`0` if below the minimum).
   */
  pendingPrestige(): BigNum;
  /**
   * Whether prestiging now would grant at least the minimum.
   */
  canPrestige(): boolean;
  /**
   * Resets the run, grants the pending points and keeps what the config says.
   *
   * @returns points gained, or `undefined` (and nothing happens) if {@link PrestigeApi.canPrestige} is false.
   */
  prestige(): BigNum | undefined;
  /**
   * Spends points (for a prestige shop). Returns `false` and changes nothing if short.
   */
  spendPrestige(amount: BigNumLike): boolean;
}

export function compileFormula(formula: PrestigeFormula): (runEarned: BigNum) => BigNum {
  if (typeof formula === 'function') return (earned) => BigNum.from(formula(earned));
  const threshold = BigNum.from(formula.threshold);
  const exponent = formula.exponent ?? 0.5;
  const scale = BigNum.from(formula.scale ?? 1);
  if (!threshold.gt(0)) throw new RangeError('prestige: threshold must be > 0');
  if (!(exponent > 0)) throw new RangeError('prestige: exponent must be > 0');
  return (earned) =>
    earned.lt(threshold) ? BigNum.ZERO : earned.div(threshold).pow(exponent).mul(scale);
}

/**
 * Plugin adding a prestige layer: reset the run in exchange for permanent points that
 * boost production. It depends only on the public `resources` API, so it can be used with
 * any resource setup, and it is entirely absent from the core.
 *
 * Install it after {@link resources}.
 *
 * @example
 * prestige({
 *   basedOn: 'gold',
 *   gain: { threshold: 1e6 },                    // floor(sqrt(earned / 1e6))
 *   keep: { upgrades: ['autoClicker'] },
 *   bonuses: [{ target: { all: true }, perPoint: 0.1 }],  // +10% per point
 * });
 */
export function prestige<R extends string, G extends string = never, U extends string = never>(
  config: PrestigeConfig<R, G, U>,
): Plugin<PrestigeApi, PrestigeEvents> {
  const setup = (kernel: Kernel<PrestigeEvents>): PrestigeApi => {
    const game = kernel.require<ResourcesApi<R, G, U>>(RESOURCES_PLUGIN);
    const formula = compileFormula(config.gain);
    const minimum = BigNum.from(config.minimum ?? 1);
    let points: BigNum = BigNum.ZERO;
    let lifetime: BigNum = BigNum.ZERO;
    let count = 0;

    const bonusValue = (bonus: PrestigeBonus<R, G>) => (): BigNumLike => {
      if ('perPoint' in bonus) return points.mul(BigNum.from(bonus.perPoint)).add(1);
      return bonus.multiplier(points, lifetime);
    };
    const bonuses = config.bonuses ?? [];
    for (let i = 0; i < bonuses.length; i++) {
      const bonus = bonuses[i] as PrestigeBonus<R, G>;
      game.setModifier(`${PRESTIGE_PLUGIN}:${i}`, bonus.target, bonusValue(bonus));
    }

    const pending = (): BigNum => {
      const value = formula(game.earned(config.basedOn)).floor();
      return value.lt(minimum) ? BigNum.ZERO : value;
    };

    kernel.registerSystem({
      id: PRESTIGE_PLUGIN,
      serialize: () => ({ points: points.toJSON(), lifetime: lifetime.toJSON(), count }),
      deserialize: (data) => {
        points = BigNum.ZERO;
        lifetime = BigNum.ZERO;
        count = 0;
        if (data === undefined) return;
        if (!isJsonObject(data))
          throw new SaveCorruptedError('prestige: save entry must be an object');
        try {
          points = BigNum.fromJSON(data['points'] ?? 0);
          lifetime = BigNum.fromJSON(data['lifetime'] ?? 0);
        } catch {
          throw new SaveCorruptedError('prestige: invalid point values');
        }
        const savedCount = data['count'] ?? 0;
        if (typeof savedCount !== 'number' || !Number.isInteger(savedCount) || savedCount < 0) {
          throw new SaveCorruptedError('prestige: invalid prestige count');
        }
        if (points.isNegative() || lifetime.isNegative()) {
          throw new SaveCorruptedError('prestige: negative point values');
        }
        count = savedCount;
      },
    });

    return {
      prestigePoints: () => points,
      prestigeLifetime: () => lifetime,
      prestigeCount: () => count,
      pendingPrestige: pending,
      canPrestige: () => !pending().isZero(),
      prestige: () => {
        const gained = pending();
        if (gained.isZero()) return undefined;
        points = points.add(gained);
        lifetime = lifetime.add(gained);
        count += 1;
        game.resetRun(config.keep);
        kernel.emit('prestige', { gained, points, count });
        return gained;
      },
      spendPrestige: (amount) => {
        const value = BigNum.from(amount);
        if (value.isNegative()) throw new RangeError('prestige: amount must be >= 0');
        if (value.gt(points)) return false;
        points = points.sub(value);
        return true;
      },
    };
  };
  return definePlugin<PrestigeApi, PrestigeEvents>(PRESTIGE_PLUGIN, setup);
}
