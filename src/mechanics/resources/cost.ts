import { BigNum } from '../../core/bignum/index.js';
import type { BigNumLike } from '../../core/bignum/index.js';

/** Cost grows geometrically: the n-th unit (from 0) costs `base × growth^n`. */
export interface ExponentialCost {
  readonly type?: 'exponential';
  /** Price of the first unit. Must be > 0. */
  readonly base: BigNumLike;
  /** Multiplier applied per unit owned. Must be >= 1. */
  readonly growth: BigNumLike;
}

/** Cost grows by a fixed amount: the n-th unit costs `base + increment × n`. */
export interface LinearCost {
  readonly type: 'linear';
  /** Price of the first unit. Must be > 0. */
  readonly base: BigNumLike;
  /** Added per unit owned. Must be >= 0. */
  readonly increment: BigNumLike;
}

/**
 * Any pricing you can write as a function. Provide `sum` and `max` closed forms for speed;
 * without them the engine iterates (bounded: 1,000,000 units for `sum`, 100,000 for `max`).
 */
export interface CustomCost {
  readonly type: 'custom';
  /** Price of the next unit when `owned` are already held. */
  readonly cost: (owned: BigNum) => BigNumLike;
  /** Total price of `count` units starting at `owned`. */
  readonly sum?: (owned: BigNum, count: BigNum) => BigNumLike;
  /** Largest `count` whose total price fits in `budget`. */
  readonly max?: (owned: BigNum, budget: BigNum) => BigNumLike;
}

/** How the price of a purchasable scales with how many are owned. */
export type CostCurve = ExponentialCost | LinearCost | CustomCost;

/** Evaluators compiled from a {@link CostCurve}. All counts are BigNum. */
export interface CostFunctions {
  /** Price of the next single unit when `owned` are held. */
  unit(owned: BigNum): BigNum;
  /** Total price of `count` units bought in one go. `0` for `count <= 0`. */
  total(owned: BigNum, count: BigNum): BigNum;
  /** Most units affordable with `budget` (whole number, `0` when none). */
  max(owned: BigNum, budget: BigNum): BigNum;
}

/** Below this many units, exponential totals are summed term by term for exactness. */
const SMALL_BATCH = 32;
const SUM_ITERATION_LIMIT = 1_000_000;
const MAX_ITERATION_LIMIT = 100_000;

/**
 * Nudges a closed-form estimate to the exact answer: shrink while unaffordable, then grow
 * while one more still fits. Absorbs floating point error from logarithms and square roots.
 */
function refine(estimate: BigNum, total: (count: BigNum) => BigNum, budget: BigNum): BigNum {
  let count = estimate.isNegative() ? BigNum.ZERO : estimate.floor();
  for (let i = 0; i < 8 && count.gt(0) && total(count).gt(budget); i++) count = count.sub(1);
  for (let i = 0; i < 8 && total(count.add(1)).lte(budget); i++) count = count.add(1);
  return count;
}

function compileExponential(curve: ExponentialCost): CostFunctions {
  const base = BigNum.from(curve.base);
  const growth = BigNum.from(curve.growth);
  if (!base.gt(0)) throw new RangeError('cost: base must be > 0');
  if (growth.lt(1)) throw new RangeError('cost: growth must be >= 1');
  const flat = growth.eq(1);
  const growthMinusOne = growth.sub(1);
  const logGrowth = flat ? 0 : growth.log10();

  const unit = (owned: BigNum): BigNum => base.mul(growth.pow(owned));
  const total = (owned: BigNum, count: BigNum): BigNum => {
    if (count.lte(0)) return BigNum.ZERO;
    const first = unit(owned);
    if (flat) return first.mul(count);
    if (count.lte(SMALL_BATCH)) {
      let sum: BigNum = BigNum.ZERO;
      let price = first;
      for (let i = count.toNumber(); i > 0; i--) {
        sum = sum.add(price);
        price = price.mul(growth);
      }
      return sum;
    }
    return first.mul(growth.pow(count).sub(1)).div(growthMinusOne);
  };
  const max = (owned: BigNum, budget: BigNum): BigNum => {
    const first = unit(owned);
    if (budget.lt(first)) return BigNum.ZERO;
    const estimate = flat
      ? budget.div(first)
      : BigNum.from(Math.floor(budget.mul(growthMinusOne).div(first).add(1).log10() / logGrowth));
    return refine(estimate, (count) => total(owned, count), budget);
  };
  return { unit, total, max };
}

function compileLinear(curve: LinearCost): CostFunctions {
  const base = BigNum.from(curve.base);
  const increment = BigNum.from(curve.increment);
  if (!base.gt(0)) throw new RangeError('cost: base must be > 0');
  if (increment.isNegative()) throw new RangeError('cost: increment must be >= 0');

  const unit = (owned: BigNum): BigNum => base.add(increment.mul(owned));
  const total = (owned: BigNum, count: BigNum): BigNum => {
    if (count.lte(0)) return BigNum.ZERO;
    // n × first + increment × n(n-1)/2
    const triangle = increment.mul(count).mul(count.sub(1)).div(2);
    return count.mul(unit(owned)).add(triangle);
  };
  const max = (owned: BigNum, budget: BigNum): BigNum => {
    const first = unit(owned);
    if (budget.lt(first)) return BigNum.ZERO;
    if (increment.isZero())
      return refine(budget.div(first), (count) => total(owned, count), budget);
    // Solve (inc/2)·n² + b·n − budget = 0 with the numerically stable root form.
    const a = increment.div(2);
    const b = first.sub(a);
    const root = b.mul(b).add(a.mul(budget).mul(4)).sqrt();
    const estimate = budget.mul(2).div(b.add(root));
    return refine(estimate, (count) => total(owned, count), budget);
  };
  return { unit, total, max };
}

function compileCustom(curve: CustomCost): CostFunctions {
  const unit = (owned: BigNum): BigNum => BigNum.from(curve.cost(owned));
  const total = (owned: BigNum, count: BigNum): BigNum => {
    if (count.lte(0)) return BigNum.ZERO;
    if (curve.sum) return BigNum.from(curve.sum(owned, count));
    if (count.gt(SUM_ITERATION_LIMIT)) {
      throw new RangeError('cost: custom cost needs a `sum` function for batches this large');
    }
    let sum: BigNum = BigNum.ZERO;
    for (let i = 0, n = count.toNumber(); i < n; i++) sum = sum.add(unit(owned.add(i)));
    return sum;
  };
  const max = (owned: BigNum, budget: BigNum): BigNum => {
    if (curve.max) {
      const estimate = BigNum.from(curve.max(owned, budget));
      return refine(estimate, (count) => total(owned, count), budget);
    }
    let spent: BigNum = BigNum.ZERO;
    let count = 0;
    while (count < MAX_ITERATION_LIMIT) {
      const next = spent.add(unit(owned.add(count)));
      if (next.gt(budget)) break;
      spent = next;
      count++;
    }
    return BigNum.from(count);
  };
  return { unit, total, max };
}

/**
 * Compiles a {@link CostCurve} into evaluators. Exponential and linear curves use closed
 * forms, so buying "max" is O(1) however many units are affordable.
 *
 * @throws {RangeError} if the curve parameters are out of range.
 *
 * @example
 * const cost = compileCost({ base: 10, growth: 1.15 });
 * cost.unit(BigNum.from(5));                       // price of the 6th unit
 * cost.max(BigNum.ZERO, BigNum.from(1000));         // how many fit in 1000
 */
export function compileCost(curve: CostCurve): CostFunctions {
  switch (curve.type) {
    case 'linear':
      return compileLinear(curve);
    case 'custom':
      return compileCustom(curve);
    default:
      return compileExponential(curve);
  }
}
