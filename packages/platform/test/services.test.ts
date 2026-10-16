import { describe, expect, it } from 'vitest';
import {
  AdGate,
  BufferedAnalytics,
  MemoryAnalytics,
  MemoryPurchases,
  SimulatedAds,
  consoleAnalytics,
  noServices,
  typedAnalytics,
} from '../src/index.ts';
import type { Product } from '../src/index.ts';

describe('analytics', () => {
  it('the no-op services do nothing and say so', async () => {
    noServices.analytics.track('x');
    expect(noServices.ads.isAvailable('rewarded')).toBe(false);
    expect(await noServices.ads.showRewarded()).toBe('unavailable');
    expect(await noServices.purchases.products()).toEqual([]);
    expect(await noServices.purchases.purchase('a')).toEqual({ status: 'unavailable', productId: 'a' });
    expect(await noServices.purchases.restore()).toEqual([]);
  });

  it('console analytics prints events and identity', () => {
    const lines: string[] = [];
    const analytics = consoleAnalytics((message) => void lines.push(message));
    analytics.track('level_start', { level: 1 });
    analytics.identify?.('u1');
    expect(lines).toEqual(['[analytics] level_start', '[analytics] identify u1']);
  });

  it('buffers until a provider is attached, in order, with a capacity', () => {
    const buffered = new BufferedAnalytics({ capacity: 2 });
    buffered.identify('u1');
    buffered.track('a');
    buffered.track('b');
    buffered.track('c');
    expect(buffered.buffered).toBe(2);
    const target = new MemoryAnalytics();
    buffered.attach(target);
    expect(target.userId).toBe('u1');
    expect(target.events.map((e) => e.event)).toEqual(['b', 'c']);
    buffered.track('d', { n: 1 });
    expect(target.events.at(-1)).toEqual({ event: 'd', props: { n: 1 } });
    expect(buffered.buffered).toBe(0);
    void buffered.flush();
    expect(target.flushes).toBe(1);
  });

  it('typed analytics forwards declared events', () => {
    interface Events {
      level_end: { level: number; won: boolean };
    }
    const target = new MemoryAnalytics();
    typedAnalytics<Events>(target).track('level_end', { level: 2, won: true });
    expect(target.events).toEqual([{ event: 'level_end', props: { level: 2, won: true } }]);
  });
});

describe('AdGate', () => {
  function setup(options = {}): { gate: AdGate; ads: SimulatedAds; clock: { t: number }; log: MemoryAnalytics } {
    const ads = new SimulatedAds();
    const clock = { t: 1000 };
    const log = new MemoryAnalytics();
    const gate = new AdGate(ads, { now: () => clock.t, analytics: log, ...options });
    return { gate, ads, clock, log };
  }

  it('shows an interstitial, then waits for the cooldown', async () => {
    const { gate, ads, clock } = setup({ cooldownSeconds: 60 });
    expect(await gate.breakpoint()).toBe('completed');
    expect(await gate.breakpoint()).toBe('unavailable');
    clock.t += 59;
    expect(await gate.breakpoint()).toBe('unavailable');
    clock.t += 1;
    expect(await gate.breakpoint()).toBe('completed');
    expect(ads.interstitials).toBe(2);
  });

  it('needs enough pauses between ads', async () => {
    const { gate, ads } = setup({ breakpointsBetween: 3, cooldownSeconds: 0 });
    await gate.breakpoint();
    await gate.breakpoint();
    expect(ads.interstitials).toBe(0);
    await gate.breakpoint();
    expect(ads.interstitials).toBe(1);
    await gate.breakpoint();
    expect(ads.interstitials).toBe(1);
  });

  it('does not count a failed ad as shown', async () => {
    const { gate, ads, log } = setup({ cooldownSeconds: 600 });
    ads.results.push('error');
    expect(await gate.breakpoint()).toBe('error');
    expect(await gate.breakpoint()).toBe('completed');
    expect(log.events.map((e) => e.props)).toEqual([{ result: 'error' }, { result: 'completed' }]);
  });

  it('skips when ads are unavailable and survives a throwing provider', async () => {
    const { gate, ads } = setup();
    ads.available = false;
    expect(await gate.breakpoint()).toBe('unavailable');
    expect(await gate.rewarded()).toBe(false);
    const broken = new AdGate({
      isAvailable: () => true,
      showInterstitial: () => Promise.reject(new Error('sdk')),
      showRewarded: () => Promise.reject(new Error('sdk')),
    });
    expect(await broken.rewarded()).toBe(false);
    expect(await broken.breakpoint()).toBe('error');
  });

  it('rewards only completed rewarded ads, without limits', async () => {
    const { gate, ads } = setup();
    ads.results.push('skipped');
    expect(await gate.rewarded()).toBe(false);
    expect(await gate.rewarded()).toBe(true);
    expect(await gate.rewarded()).toBe(true);
  });
});

describe('MemoryPurchases', () => {
  const catalogue: Product[] = [
    { id: 'coins', title: '100 coins', price: '$0.99', kind: 'consumable' },
    { id: 'no-ads', title: 'No ads', price: '$2.99', kind: 'permanent' },
  ];

  it('sells consumables repeatedly and permanents once', async () => {
    const store = new MemoryPurchases(catalogue);
    expect(await store.products()).toBe(catalogue);
    expect((await store.purchase('coins')).status).toBe('purchased');
    expect((await store.purchase('coins')).status).toBe('purchased');
    const first = await store.purchase('no-ads');
    expect(first).toMatchObject({ status: 'purchased' });
    expect(first.receipt).toBeDefined();
    expect((await store.purchase('no-ads')).status).toBe('already-owned');
    expect(await store.restore()).toEqual(['no-ads']);
  });

  it('reports cancelled, errors and unknown products', async () => {
    const store = new MemoryPurchases(catalogue);
    store.outcomes.push('cancelled', 'error');
    expect((await store.purchase('no-ads')).status).toBe('cancelled');
    expect((await store.purchase('no-ads')).status).toBe('error');
    expect(await store.restore()).toEqual([]);
    expect((await store.purchase('nope')).status).toBe('unavailable');
  });
});

