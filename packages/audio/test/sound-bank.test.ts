import { describe, expect, it } from 'vitest';
import { SoundBank } from '../src/index.ts';
import type { AudioEngine, PlayOptions, Sound } from '../src/index.ts';

class FakePlayback {
  isPlaying = true;
  stop(): void {
    this.isPlaying = false;
  }
}

function setup(random = (): number => 0.5): {
  bank: (options?: ConstructorParameters<typeof SoundBank>[1]) => SoundBank;
  plays: { sound: Sound; options: PlayOptions; playback: FakePlayback }[];
} {
  const plays: { sound: Sound; options: PlayOptions; playback: FakePlayback }[] = [];
  const engine = {
    play(sound: Sound, options: PlayOptions): FakePlayback {
      const playback = new FakePlayback();
      plays.push({ sound, options, playback });
      return playback;
    },
  } as unknown as AudioEngine;
  return { plays, bank: (options) => new SoundBank(engine, { random, ...options }) };
}

const sound = { buffer: {}, duration: 3 } as unknown as Sound;

describe('SoundBank', () => {
  it('plays registered sounds with the definition defaults', () => {
    const { bank, plays } = setup();
    const b = bank().add('hit', { sound, volume: 0.5, rate: 2, bus: 'fx' });
    b.play('hit');
    expect(plays[0]?.options).toMatchObject({ bus: 'fx', volume: 0.5, rate: 2 });
    b.play('hit', { volume: 1, bus: 'ui' });
    expect(plays[1]?.options).toMatchObject({ bus: 'ui', volume: 1 });
    expect(() => b.play('nope')).toThrow(RangeError);
  });

  it('varies pitch and volume around the base', () => {
    const values = [0, 1];
    let i = 0;
    const { bank, plays } = setup(() => values[i++ % 2] ?? 0);
    const b = bank().add('step', { sound, pitchVariation: 0.2, volumeVariation: 0.5 });
    b.play('step');
    expect(plays[0]?.options.volume).toBeCloseTo(0.5);
    expect(plays[0]?.options.rate).toBeCloseTo(1.2);
  });

  it('steals the oldest voice at the limit', () => {
    const { bank, plays } = setup();
    const b = bank().add('hit', { sound, maxVoices: 2 });
    b.play('hit');
    b.play('hit');
    b.play('hit');
    expect(plays.map((p) => p.playback.isPlaying)).toEqual([false, true, true]);
    expect(b.voiceCount('hit')).toBe(2);
  });

  it('can reject instead, per sound and in total', () => {
    const { bank, plays } = setup();
    const b = bank({ policy: 'reject', maxVoices: 3 })
      .add('a', { sound, maxVoices: 1 })
      .add('b', { sound });
    expect(b.play('a')).toBeDefined();
    expect(b.play('a')).toBeUndefined();
    b.play('b');
    b.play('b');
    expect(b.play('b')).toBeUndefined();
    expect(plays).toHaveLength(3);
    plays[0]?.playback.stop();
    expect(b.play('b')).toBeDefined();
  });

  it('plays audio sprites as regions', () => {
    const { bank, plays } = setup();
    const b = bank().addSprites(sound, { coin: { start: 0, duration: 0.4 }, jump: { start: 1, duration: 0.3 } });
    b.play('jump');
    expect(plays[0]?.options).toMatchObject({ offset: 1, duration: 0.3 });
    expect(b.has('coin')).toBe(true);
  });

  it('stops one sound or all', () => {
    const { bank } = setup();
    const b = bank().add('a', { sound }).add('b', { sound });
    b.play('a');
    b.play('b');
    b.stop('a');
    expect(b.voiceCount()).toBe(1);
    b.stop();
    expect(b.voiceCount()).toBe(0);
  });
});
