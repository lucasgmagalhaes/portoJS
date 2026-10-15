import type { BigNum } from '@portojs/core';
import type { Game } from '@portojs/runtime';

/**
 * Anything a simulated player can buy: a `Generator` or an `Upgrade` from `@portojs/idle` fits.
 */
export interface Purchasable {
  /**
   * `true` when one can be bought now.
   */
  canBuy(): boolean;
  /**
   * Buys one.
   */
  buy(): unknown;
}

/**
 * A purchasable that can say what the next one costs, so strategies can compare them.
 */
export interface PricedPurchasable extends Purchasable {
  /**
   * Price of the next purchase (generators).
   */
  readonly nextCost?: BigNum | undefined;
  /**
   * Price of the next purchase, or `undefined` when none is left (upgrades).
   */
  readonly cost?: BigNum | undefined;
}

function priceOf(item: PricedPurchasable): BigNum | undefined {
  return item.nextCost ?? item.cost;
}

/**
 * Strategy that, on every decision, keeps buying the cheapest affordable item until none is.
 * Cheap and good enough for a first pass at pacing.
 *
 * @example
 * simulate({ game, maxMs, strategy: buyCheapest([miner, mine]) });
 */
export function buyCheapest(items: readonly PricedPurchasable[]): (game: Game) => void {
  return () => {
    for (let guard = 0; guard < 10_000; guard++) {
      let best: PricedPurchasable | undefined;
      let bestPrice: BigNum | undefined;
      for (const item of items) {
        if (!item.canBuy()) continue;
        const price = priceOf(item);
        if (price === undefined) continue;
        if (bestPrice === undefined || price.lt(bestPrice)) {
          best = item;
          bestPrice = price;
        }
      }
      if (best === undefined) return;
      best.buy();
    }
  };
}

/**
 * Strategy that buys the items in the given order of priority: it always tries the first item
 * until it cannot be bought, then the next, and so on. Models a player with a fixed plan.
 *
 * @example
 * simulate({ game, maxMs, strategy: buyInOrder([upgrade, miner]) });
 */
export function buyInOrder(items: readonly Purchasable[]): (game: Game) => void {
  return () => {
    for (const item of items) {
      for (let guard = 0; guard < 10_000 && item.canBuy(); guard++) item.buy();
    }
  };
}
