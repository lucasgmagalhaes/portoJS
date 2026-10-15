import { BigNum } from '../../core/bignum/index.js';

/** One generator seen as a linear flow: it emits `coefficient` units per second per unit held. */
export interface FlowSource {
  /** Units held at time zero. */
  readonly initial: BigNum;
  /** Output per second per unit held, multipliers already included. */
  readonly coefficient: BigNum;
  /** Where the output goes: another generator (its count grows) or a resource (gain). */
  readonly target: { readonly kind: 'generator' | 'resource'; readonly index: number };
}

/** Result of {@link solveFlows}. */
export interface FlowResult {
  /** Units held by each source after the span. */
  readonly counts: readonly BigNum[];
  /** Amount gained by each resource over the span. */
  readonly gains: readonly BigNum[];
}

/** Default limit on the length of generator chains solved in closed form. */
export const DEFAULT_MAX_CHAIN = 64;

/** Adds `delta` into `poly[index]`, growing the polynomial when needed. */
function addTerm(poly: BigNum[], index: number, delta: BigNum): void {
  while (poly.length <= index) poly.push(BigNum.ZERO);
  poly[index] = (poly[index] ?? BigNum.ZERO).add(delta);
}

/** Horner evaluation of `Σ coefficients[k] × t^k`. */
function evaluate(coefficients: readonly BigNum[], t: BigNum): BigNum {
  let value: BigNum = BigNum.ZERO;
  for (let k = coefficients.length - 1; k >= 0; k--) {
    value = value.mul(t).add(coefficients[k] ?? BigNum.ZERO);
  }
  return value;
}

function evaluateAll(polynomials: readonly (readonly BigNum[])[], t: BigNum): BigNum[] {
  const values: BigNum[] = [];
  for (const polynomial of polynomials) values.push(evaluate(polynomial, t));
  return values;
}

/**
 * Solves production exactly for a system where every generator emits at a constant rate
 * per unit held, optionally feeding other generators (chains such as "tier 2 makes tier 1").
 *
 * With no purchases happening, each count is a polynomial in time whose degree equals the
 * chain length, so the result for *any* duration costs the same as for one second. This is
 * what makes offline progress both instant and exact.
 *
 * @param sources generators and where each one sends its output.
 * @param resourceCount number of resources (targets of kind `'resource'` index into it).
 * @param seconds length of the span.
 * @returns the counts and gains, or `undefined` when no closed form applies: a feedback
 * cycle exists (growth would be exponential) or a chain is longer than `maxChain`.
 * @throws {RangeError} if `seconds` is negative / not finite, or a target index is invalid.
 */
export function solveFlows(
  sources: readonly FlowSource[],
  resourceCount: number,
  seconds: number,
  maxChain: number = DEFAULT_MAX_CHAIN,
): FlowResult | undefined {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError('solveFlows: seconds must be a finite number >= 0');
  }
  const size = sources.length;
  const indegree: number[] = new Array<number>(size).fill(0);
  for (const source of sources) {
    const { kind, index } = source.target;
    const limit = kind === 'generator' ? size : resourceCount;
    if (!Number.isInteger(index) || index < 0 || index >= limit) {
      throw new RangeError('solveFlows: target index out of range');
    }
    if (kind === 'generator') indegree[index] = (indegree[index] ?? 0) + 1;
  }

  const queue: number[] = [];
  const depth: number[] = new Array<number>(size).fill(0);
  for (let i = 0; i < indegree.length; i++) {
    if (indegree[i] === 0) queue.push(i);
  }
  const order: number[] = [];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head] as number;
    order.push(i);
    const { kind, index } = (sources[i] as FlowSource).target;
    if (kind !== 'generator') continue;
    depth[index] = Math.max(depth[index] ?? 0, (depth[i] ?? 0) + 1);
    indegree[index] = (indegree[index] ?? 0) - 1;
    if (indegree[index] === 0) queue.push(index);
  }
  if (order.length !== size) return undefined;
  for (const d of depth) {
    if (d + 1 > maxChain) return undefined;
  }

  const counts: BigNum[][] = [];
  for (const source of sources) counts.push([source.initial]);
  const gains: BigNum[][] = [];
  for (let r = 0; r < resourceCount; r++) gains.push([]);
  for (const i of order) {
    const source = sources[i] as FlowSource;
    const poly = counts[i] as BigNum[];
    const destination =
      source.target.kind === 'generator'
        ? (counts[source.target.index] as BigNum[])
        : (gains[source.target.index] as BigNum[]);
    for (let k = 0; k < poly.length; k++) {
      addTerm(destination, k + 1, source.coefficient.mul(poly[k] as BigNum).div(k + 1));
    }
  }

  const t = BigNum.from(seconds);
  return { counts: evaluateAll(counts, t), gains: evaluateAll(gains, t) };
}
