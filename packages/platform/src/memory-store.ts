import type { AdResult, Ads, Product, PurchaseResult, Purchases } from './services.ts';

/**
 * Ads for development and tests: every request resolves to the next result you queue, or to
 * `completed`.
 */
export class SimulatedAds implements Ads {
  /**
   * What the next requests return, oldest first. Empty means `completed`.
   */
  readonly results: AdResult[] = [];
  /**
   * Whether ads count as available. Default `true`.
   */
  available = true;
  interstitials = 0;
  rewardeds = 0;

  isAvailable(): boolean {
    return this.available;
  }

  showInterstitial(): Promise<AdResult> {
    this.interstitials++;
    return Promise.resolve(this.results.shift() ?? 'completed');
  }

  showRewarded(): Promise<AdResult> {
    this.rewardeds++;
    return Promise.resolve(this.results.shift() ?? 'completed');
  }
}

/**
 * A store in memory, for development and tests. Purchases succeed unless you queue another
 * status; permanent products can be bought once.
 */
export class MemoryPurchases implements Purchases {
  /**
   * What the next purchases return, oldest first. Empty means success.
   */
  readonly outcomes: ('purchased' | 'cancelled' | 'error')[] = [];
  private readonly owned = new Set<string>();
  private counter = 0;

  constructor(private readonly catalogue: readonly Product[]) {}

  products(): Promise<readonly Product[]> {
    return Promise.resolve(this.catalogue);
  }

  purchase(productId: string): Promise<PurchaseResult> {
    const product = this.lookup(productId);
    if (!product) return Promise.resolve({ status: 'unavailable', productId });
    if (product.kind === 'permanent' && this.owned.has(productId)) {
      return Promise.resolve({ status: 'already-owned', productId });
    }
    const status = this.outcomes.shift() ?? 'purchased';
    if (status !== 'purchased') return Promise.resolve({ status, productId });
    if (product.kind === 'permanent') this.owned.add(productId);
    this.counter++;
    return Promise.resolve({ status, productId, receipt: `memory-${this.counter}` });
  }

  private lookup(productId: string): Product | undefined {
    for (const entry of this.catalogue) {
      if (entry.id === productId) return entry;
    }
    return undefined;
  }

  restore(): Promise<readonly string[]> {
    return Promise.resolve([...this.owned]);
  }
}
