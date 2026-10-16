/**
 * Values an analytics event can carry.
 */
export type EventProps = Readonly<Record<string, string | number | boolean | null>>;

/**
 * Sends events to an analytics service. Implement it for your provider; the engine and your
 * game only talk to this interface, so the provider can change without touching game code.
 */
export interface Analytics {
  /**
   * Records an event.
   */
  track(event: string, props?: EventProps): void;
  /**
   * Tells the service who the player is (an id of yours, not personal data).
   */
  identify?(userId: string): void;
  /**
   * Sends what is still buffered. Called when the page is going away.
   */
  flush?(): void | Promise<void>;
}

/**
 * How an ad request ended.
 */
export type AdResult = 'completed' | 'skipped' | 'unavailable' | 'error';

/**
 * Shows ads. A rewarded ad only counts when its result is `completed`.
 */
export interface Ads {
  /**
   * Whether an ad of that kind can be shown right now.
   */
  isAvailable(kind: 'interstitial' | 'rewarded'): boolean;
  /**
   * Shows a full-screen ad between levels or screens.
   */
  showInterstitial(): Promise<AdResult>;
  /**
   * Shows an ad the player chose to watch in exchange for a reward.
   */
  showRewarded(): Promise<AdResult>;
}

/**
 * Something sold in the store.
 */
export interface Product {
  readonly id: string;
  readonly title: string;
  /**
   * Price text, already formatted for the player's currency.
   */
  readonly price: string;
  /**
   * `consumable` can be bought again (coins); `permanent` once (remove ads).
   */
  readonly kind: 'consumable' | 'permanent';
}

/**
 * How a purchase ended.
 */
export type PurchaseStatus = 'purchased' | 'cancelled' | 'already-owned' | 'unavailable' | 'error';

/**
 * The outcome of {@link Purchases.purchase}.
 */
export interface PurchaseResult {
  readonly status: PurchaseStatus;
  readonly productId: string;
  /**
   * Store receipt, to verify on a server before granting anything valuable.
   */
  readonly receipt?: string;
}

/**
 * In-app purchases. Grant the reward only after a `purchased` result, ideally after verifying
 * the receipt on your server.
 */
export interface Purchases {
  products(): Promise<readonly Product[]>;
  purchase(productId: string): Promise<PurchaseResult>;
  /**
   * Permanent products the player already owns, for a "restore purchases" button.
   */
  restore(): Promise<readonly string[]>;
}

/**
 * Everything a game can ask of the host: pass one object around instead of three.
 */
export interface Services {
  readonly analytics: Analytics;
  readonly ads: Ads;
  readonly purchases: Purchases;
}

/**
 * Analytics that does nothing.
 */
export const noAnalytics: Analytics = { track: ignoreEvent };

function ignoreEvent(): void {
  return;
}

/**
 * Ads that are never available.
 */
export const noAds: Ads = {
  isAvailable: returnFalse,
  showInterstitial: unavailableAd,
  showRewarded: unavailableAd,
};

function returnFalse(): boolean {
  return false;
}

function unavailableAd(): Promise<AdResult> {
  return Promise.resolve('unavailable');
}

/**
 * A store with nothing for sale.
 */
export const noPurchases: Purchases = {
  products: emptyProducts,
  purchase: unavailablePurchase,
  restore: emptyOwned,
};

function emptyProducts(): Promise<readonly Product[]> {
  return Promise.resolve([]);
}

function emptyOwned(): Promise<readonly string[]> {
  return Promise.resolve([]);
}

function unavailablePurchase(productId: string): Promise<PurchaseResult> {
  return Promise.resolve({ status: 'unavailable', productId });
}

/**
 * Services that do nothing: the default when no provider is set up.
 */
export const noServices: Services = {
  analytics: noAnalytics,
  ads: noAds,
  purchases: noPurchases,
};

/**
 * Prints events with `console.log`-style output, for development.
 */
export function consoleAnalytics(log: (message: string, props?: EventProps) => void): Analytics {
  return {
    track(event, props) {
      log(`[analytics] ${event}`, props);
    },
    identify(userId) {
      log(`[analytics] identify ${userId}`);
    },
  };
}

/**
 * An analytics adapter that keeps what it receives, for tests.
 */
export class MemoryAnalytics implements Analytics {
  readonly events: { readonly event: string; readonly props: EventProps | undefined }[] = [];
  userId: string | undefined;
  flushes = 0;

  track(event: string, props?: EventProps): void {
    this.events.push({ event, props });
  }

  identify(userId: string): void {
    this.userId = userId;
  }

  flush(): void {
    this.flushes++;
  }
}

/**
 * Options of {@link BufferedAnalytics}.
 */
export interface BufferedAnalyticsOptions {
  /**
   * Events kept while the provider is not ready or between sends. The oldest are dropped past
   * this. Default `200`.
   */
  readonly capacity?: number;
}

/**
 * Collects events until a real provider is ready, then forwards them in order. Lets a game
 * start tracking before the SDK has loaded.
 */
export class BufferedAnalytics implements Analytics {
  private queue: { event: string; props: EventProps | undefined }[] = [];
  private target: Analytics | undefined;
  private pendingUser: string | undefined;
  private readonly capacity: number;

  constructor(options: BufferedAnalyticsOptions = {}) {
    this.capacity = Math.max(1, options.capacity ?? 200);
  }

  /**
   * Number of events waiting for a provider.
   */
  get buffered(): number {
    return this.queue.length;
  }

  /**
   * Connects the real provider and sends everything collected so far.
   */
  attach(target: Analytics): void {
    this.target = target;
    if (this.pendingUser !== undefined) target.identify?.(this.pendingUser);
    const waiting = this.queue;
    this.queue = [];
    for (const item of waiting) target.track(item.event, item.props);
  }

  track(event: string, props?: EventProps): void {
    if (this.target) {
      this.target.track(event, props);
      return;
    }
    this.queue.push({ event, props });
    if (this.queue.length > this.capacity) this.queue.shift();
  }

  identify(userId: string): void {
    this.pendingUser = userId;
    this.target?.identify?.(userId);
  }

  flush(): void | Promise<void> {
    return this.target?.flush?.();
  }
}

/**
 * Wraps analytics so only the events you declare can be sent, with the right properties.
 *
 * @example
 * interface MyEvents {
 *   level_start: { level: number };
 *   level_end: { level: number; won: boolean; seconds: number };
 * }
 * const events = typedAnalytics<MyEvents>(analytics);
 * events.track('level_end', { level: 3, won: true, seconds: 41 });
 */
export function typedAnalytics<E extends { [K in keyof E]: EventProps }>(
  analytics: Analytics,
): { track<K extends keyof E & string>(event: K, props: E[K]): void } {
  return {
    track(event, props) {
      analytics.track(event, props);
    },
  };
}
