import { ManualClock } from '@portojs/core';
import { Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { AudioEngine, AudioManager, loadVolumes, saveVolumes } from '../src/index.ts';

class FakeParam {
  value = 1;
  readonly calls: [string, ...number[]][] = [];

  cancelScheduledValues(time: number): void {
    this.calls.push(['cancel', time]);
  }

  setValueAtTime(value: number, time: number): void {
    this.calls.push(['set', value, time]);
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.calls.push(['ramp', value, time]);
  }
}

class FakeNode {
  readonly connections: unknown[] = [];
  disconnected = false;

  connect(target: unknown): void {
    this.connections.push(target);
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakePanner extends FakeNode {
  readonly pan = new FakeParam();
}

class FakeSource extends FakeNode {
  buffer: unknown = undefined;
  loop = false;
  readonly playbackRate = new FakeParam();
  onended: (() => void) | null = null;
  startedAt: number | undefined;
  startArgs: number[] = [];
  stopAt: number | undefined;
  loopStart = 0;
  loopEnd = 0;
  stopped = false;
  throwOnStop = false;

  start(when: number, ...rest: number[]): void {
    this.startedAt = when;
    this.startArgs = rest;
  }

  stop(when?: number): void {
    if (this.throwOnStop) throw new Error('InvalidStateError');
    this.stopAt = when;
    this.stopped = true;
  }
}

class FakeContext {
  currentTime = 0;
  state: 'running' | 'suspended' | 'closed' = 'running';
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  readonly panners: FakePanner[] = [];
  withPanner = true;

  createGain(): FakeGain {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }

  createBufferSource(): FakeSource {
    const node = new FakeSource();
    this.sources.push(node);
    return node;
  }

  get createStereoPanner(): (() => FakePanner) | undefined {
    if (!this.withPanner) return undefined;
    return () => {
      const node = new FakePanner();
      this.panners.push(node);
      return node;
    };
  }

  decodeAudioData(data: ArrayBuffer): Promise<{ duration: number; length: number }> {
    return Promise.resolve({ duration: 2.5, length: data.byteLength });
  }

  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
}

function make(withPanner = true) {
  const context = new FakeContext();
  context.withPanner = withPanner;
  const engine = new AudioEngine({ context: context as unknown as AudioContext });
  return { context, engine };
}

async function loadSound(engine: AudioEngine) {
  return engine.decode(new ArrayBuffer(8));
}

describe('AudioEngine', () => {
  it('decodes and loads sounds', async () => {
    const { engine } = make();
    const sound = await loadSound(engine);
    expect(sound.duration).toBe(2.5);
    const loaded = await engine.load('/x.ogg', () =>
      Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }),
    );
    expect(loaded.duration).toBe(2.5);
  });

  it('plays through gain, panner and bus with the given options', async () => {
    const { context, engine } = make();
    const sound = await loadSound(engine);
    context.currentTime = 10;
    const playback = engine.play(sound, {
      bus: 'music',
      volume: 0.5,
      loop: true,
      rate: 1.5,
      pan: 2,
      delay: 1,
    });
    const source = context.sources[0] as FakeSource;
    expect(source.loop).toBe(true);
    expect(source.playbackRate.value).toBe(1.5);
    expect(source.startedAt).toBe(11);
    expect(playback.volume).toBe(0.5);
    expect(playback.rate).toBe(1.5);
    expect((context.panners[0] as FakePanner).pan.value).toBe(1);
    expect(engine.playing).toBe(1);
    expect(playback.isPlaying).toBe(true);
  });

  it('controls a playback while it plays', async () => {
    const { context, engine } = make();
    const playback = engine.play(await loadSound(engine));
    playback.volume = -1;
    expect(playback.volume).toBe(0);
    playback.volume = 0.3;
    playback.rate = 2;
    playback.pan = -5;
    expect(playback.volume).toBe(0.3);
    expect((context.sources[0] as FakeSource).playbackRate.value).toBe(2);
    expect((context.panners[0] as FakePanner).pan.value).toBe(-1);
  });

  it('fades a playback and stops after a fade out', async () => {
    const { context, engine } = make();
    const sound = await loadSound(engine);
    context.currentTime = 4;
    const playback = engine.play(sound, { volume: 0.8 });
    playback.fadeTo(0.2, 2);
    const gain = context.gains.find((node) => node.gain.calls.length > 0) as FakeGain;
    expect(gain.gain.calls).toEqual([
      ['cancel', 4],
      ['set', 0.8, 4],
      ['ramp', 0.2, 6],
    ]);
    playback.stop(1.5);
    expect(gain.gain.calls.at(-1)).toEqual(['ramp', 0, 5.5]);
    expect((context.sources[0] as FakeSource).stopAt).toBe(5.5);
    expect(playback.isPlaying).toBe(true);
    (context.sources[0] as FakeSource).onended?.();
    expect(playback.isPlaying).toBe(false);
  });

  it('plays a region of a sound and sets loop points', async () => {
    const { context, engine } = make();
    const sound = await loadSound(engine);
    engine.play(sound, { offset: 1, duration: 0.5 });
    engine.play(sound, { offset: 2 });
    engine.play(sound, { loop: true, loopStart: 0.5, loopEnd: 2 });
    const [region, from, loop] = context.sources;
    expect(region?.startArgs).toEqual([1, 0.5]);
    expect(from?.startArgs).toEqual([2]);
    expect(loop?.startArgs).toEqual([]);
    expect(loop?.loopStart).toBe(0.5);
    expect(loop?.loopEnd).toBe(2);
  });

  it('stops a sound and settles its ended promise', async () => {
    const { context, engine } = make();
    const playback = engine.play(await loadSound(engine));
    playback.stop();
    playback.stop();
    await playback.ended;
    expect(playback.isPlaying).toBe(false);
    expect((context.sources[0] as FakeSource).stopped).toBe(true);
    await Promise.resolve();
    expect(engine.playing).toBe(0);
  });

  it('finishes when the source ends by itself', async () => {
    const { context, engine } = make();
    const playback = engine.play(await loadSound(engine));
    (context.sources[0] as FakeSource).onended?.();
    await playback.ended;
    expect(playback.isPlaying).toBe(false);
  });

  it('survives a source that cannot be stopped', async () => {
    const { context, engine } = make();
    const playback = engine.play(await loadSound(engine));
    (context.sources[0] as FakeSource).throwOnStop = true;
    expect(() => playback.stop()).not.toThrow();
    expect(playback.isPlaying).toBe(false);
  });

  it('works without stereo panning support', async () => {
    const { context, engine } = make(false);
    const playback = engine.play(await loadSound(engine), { pan: 1 });
    playback.pan = 1;
    expect(context.panners).toHaveLength(0);
    expect(playback.isPlaying).toBe(true);
  });

  it('manages master and bus volumes', () => {
    const { engine } = make();
    expect(engine.masterVolume).toBe(1);
    engine.masterVolume = -3;
    expect(engine.masterVolume).toBe(0);
    engine.masterVolume = 0.7;
    expect(engine.masterVolume).toBe(0.7);
    expect(engine.busVolume('music')).toBe(1);
    engine.setBusVolume('music', 0.4);
    engine.setBusVolume('music', -1);
    expect(engine.busVolume('music')).toBe(0);
    engine.setBusVolume('music', 0.4);
    expect(engine.busVolume('music')).toBe(0.4);
  });

  it('mutes without losing the volume and exports and imports settings', () => {
    const { context, engine } = make();
    engine.masterVolume = 0.6;
    engine.setBusVolume('music', 0.3);
    engine.muted = true;
    const master = context.gains[0] as FakeGain;
    expect(master.gain.value).toBe(0);
    expect(engine.masterVolume).toBe(0.6);
    engine.masterVolume = 0.8;
    expect(master.gain.value).toBe(0);
    expect(engine.exportVolumes()).toEqual({ master: 0.8, muted: true, buses: { music: 0.3 } });
    engine.muted = false;
    expect(master.gain.value).toBe(0.8);
    engine.importVolumes({ master: 0.1, muted: true, buses: { music: 0.9, sfx: -1, ui: 0.5 } });
    expect(engine.masterVolume).toBe(0.1);
    expect(engine.muted).toBe(true);
    expect(engine.busVolume('music')).toBe(0.9);
    expect(engine.busVolume('ui')).toBe(0.5);
    expect(engine.busVolume('sfx')).toBe(1);
    engine.importVolumes({ master: Number.NaN });
    expect(engine.masterVolume).toBe(0.1);
  });

  it('saves and loads volumes through a storage, tolerating bad data', () => {
    const { engine } = make();
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
    expect(loadVolumes(engine, storage)).toBe(false);
    engine.masterVolume = 0.25;
    engine.setBusVolume('music', 0.5);
    saveVolumes(engine, storage);
    const other = make().engine;
    expect(loadVolumes(other, storage)).toBe(true);
    expect(other.masterVolume).toBe(0.25);
    expect(other.busVolume('music')).toBe(0.5);
    data.set('portojs.audio', '{nope');
    expect(loadVolumes(other, storage)).toBe(false);
    data.set('portojs.audio', '7');
    expect(loadVolumes(other, storage)).toBe(false);
    const broken = {
      getItem: (): string | null => {
        throw new Error('denied');
      },
      setItem: (): void => {
        throw new Error('quota');
      },
    };
    expect(loadVolumes(other, broken)).toBe(false);
    expect(() => saveVolumes(other, broken)).not.toThrow();
  });

  it('stops everything and refuses to play after dispose', async () => {
    const { context, engine } = make();
    const sound = await loadSound(engine);
    engine.play(sound);
    engine.play(sound);
    engine.stopAll();
    expect(engine.playing).toBe(0);
    await engine.dispose();
    await engine.dispose();
    expect(context.state).toBe('closed');
    expect(() => engine.play(sound)).toThrow(/disposed/);
  });

  it('suspends and resumes the context', async () => {
    const { context, engine } = make();
    await engine.suspend();
    expect(context.state).toBe('suspended');
    await engine.resume();
    expect(context.state).toBe('running');
  });

  it('unlocks on the first gesture and then stops listening', async () => {
    const { context, engine } = make();
    context.state = 'suspended';
    const target = new EventTarget();
    engine.unlockOnGesture(target);
    target.dispatchEvent(new Event('keydown'));
    await Promise.resolve();
    expect(context.state).toBe('running');
    context.state = 'suspended';
    target.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    expect(context.state).toBe('suspended');
  });

  it('needs Web Audio when no context is given', () => {
    expect(() => new AudioEngine()).toThrow(/not available/);
  });

  it('uses a global AudioContext when present', () => {
    const scope = globalThis as { AudioContext?: unknown };
    scope.AudioContext = FakeContext;
    try {
      const engine = new AudioEngine();
      expect(engine.context).toBeInstanceOf(FakeContext);
    } finally {
      delete scope.AudioContext;
    }
  });
});

describe('AudioManager', () => {
  it('suspends when disabled, resumes when enabled again and closes on destroy', async () => {
    const context = new FakeContext();
    const game = new Game({ clock: new ManualClock(0) });
    const object = game.createObject('Audio');
    const manager = object.addComponent(AudioManager, {
      context: context as unknown as AudioContext,
    });
    expect(context.state).toBe('running');
    object.setActive(false);
    await Promise.resolve();
    expect(context.state).toBe('suspended');
    object.setActive(true);
    await Promise.resolve();
    expect(context.state).toBe('running');
    manager.destroy();
    await Promise.resolve();
    expect(context.state).toBe('closed');
  });
});
