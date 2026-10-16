import type { AdResult, Ads, Analytics } from './services.ts';

/**
 * Options of an {@link AdGate}.
 */
export interface AdGateOptions {
  /**
   * Least seconds between two interstitials. Default `120`.
   */
  readonly cooldownSeconds?: number;
  /**
   * Interstitials are skipped until this many {@link AdGate.breakpoint} calls have happened
   * since the start or since the last one shown. Default `1`.
   */
  readonly breakpointsBetween?: number;
  /**
   * Current time in seconds. Default: `Date.now() / 1000`.
   */
  readonly now?: () => number;
  /**
   * Gets `ad_interstitial` and `ad_rewarded` events with the result.
   */
  readonly analytics?: Analytics;
}

/**
 * Keeps interstitials from becoming annoying: call it at natural pauses (level end, game over)
 * and it only shows an ad when enough time and pauses have passed. Rewarded ads are always the
 * player's choice, so they are never limited, only reported.
 *
 * @example
 * const gate = new AdGate(services.ads, { cooldownSeconds: 90, breakpointsBetween: 2 });
 * await gate.breakpoint(); // maybe shows an ad
 * if (await gate.rewarded()) player.coins += 50;
 */
export class AdGate {
  private lastShown = Number.NEGATIVE_INFINITY;
  private pauses = 0;
  private readonly cooldown: number;
  private readonly between: number;
  private readonly now: () => number;

  constructor(
    private readonly ads: Ads,
    private readonly options: AdGateOptions = {},
  ) {
    this.cooldown = options.cooldownSeconds ?? 120;
    this.between = options.breakpointsBetween ?? 1;
    this.now = options.now ?? defaultNow;
  }

  /**
   * Marks a natural pause and shows an interstitial when the limits allow it. Returns the
   * result, or `unavailable` when the gate held it back.
   */
  async breakpoint(): Promise<AdResult> {
    this.pauses++;
    if (this.pauses < this.between || this.now() - this.lastShown < this.cooldown) {
      return 'unavailable';
    }
    if (!this.ads.isAvailable('interstitial')) return 'unavailable';
    const result = await this.run('interstitial');
    if (result === 'completed') {
      this.lastShown = this.now();
      this.pauses = 0;
    }
    return result;
  }

  /**
   * Shows a rewarded ad. Returns whether the player should get the reward.
   */
  async rewarded(): Promise<boolean> {
    if (!this.ads.isAvailable('rewarded')) return false;
    const result = await this.run('rewarded');
    return result === 'completed';
  }

  private async run(kind: 'interstitial' | 'rewarded'): Promise<AdResult> {
    let result: AdResult;
    try {
      result = await (kind === 'interstitial' ? this.ads.showInterstitial() : this.ads.showRewarded());
    } catch {
      result = 'error';
    }
    this.options.analytics?.track(`ad_${kind}`, { result });
    return result;
  }
}

function defaultNow(): number {
  return Date.now() / 1000;
}
