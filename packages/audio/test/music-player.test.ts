import { describe, expect, it } from 'vitest';
import { MusicPlayer } from '../src/index.ts';
import type { AudioEngine, PlayOptions, Sound } from '../src/index.ts';

class FakePlayback {
  isPlaying = true;
  readonly fades: [number, number][] = [];
  stops: number[] = [];
  fadeTo(volume: number, seconds: number): void {
    this.fades.push([volume, seconds]);
  }
  stop(fade = 0): void {
    this.stops.push(fade);
    if (fade === 0) this.isPlaying = false;
  }
}

function setup(): {
  music: (random?: () => number) => MusicPlayer;
  plays: { sound: Sound; options: PlayOptions; playback: FakePlayback }[];
  clock: { time: number };
} {
  const clock = { time: 0 };
  const plays: { sound: Sound; options: PlayOptions; playback: FakePlayback }[] = [];
  const engine = {
    context: {
      get currentTime(): number {
        return clock.time;
      },
    },
    play(sound: Sound, options: PlayOptions): FakePlayback {
      const playback = new FakePlayback();
      plays.push({ sound, options, playback });
      return playback;
    },
  } as unknown as AudioEngine;
  return { plays, clock, music: (random) => new MusicPlayer(engine, { crossfade: 2, ...(random ? { random } : {}) }) };
}

function track(name: string, duration: number): Sound {
  return { buffer: { name }, duration } as unknown as Sound;
}

describe('MusicPlayer', () => {
  it('fades the new track in and the old one out', () => {
    const { music, plays } = setup();
    const m = music();
    const a = track('a', 60);
    const b = track('b', 60);
    m.play(a, { volume: 0.6 });
    expect(plays[0]?.options).toMatchObject({ bus: 'music', loop: true, volume: 0 });
    expect(plays[0]?.playback.fades).toEqual([[0.6, 2]]);
    m.play(b, { fade: 4 });
    expect(plays[0]?.playback.stops).toEqual([4]);
    expect(plays[1]?.playback.fades).toEqual([[1, 4]]);
    expect(m.current).toBe(b);
  });

  it('starts at full volume without a fade and passes loop points', () => {
    const { music, plays } = setup();
    music().play(track('a', 10), { fade: 0, loopStart: 4, loopEnd: 9 });
    expect(plays[0]?.options).toMatchObject({ volume: 1, loopStart: 4, loopEnd: 9 });
    expect(plays[0]?.playback.fades).toEqual([]);
  });

  it('stops with a fade', () => {
    const { music, plays } = setup();
    const m = music();
    m.play(track('a', 10));
    m.stop();
    expect(plays[0]?.playback.stops).toEqual([2]);
    expect(m.current).toBeUndefined();
  });

  it('advances a playlist shortly before each track ends', () => {
    const { music, plays, clock } = setup();
    const m = music();
    const [a, b] = [track('a', 10), track('b', 10)] as [Sound, Sound];
    m.playlist([a, b]);
    expect(plays).toHaveLength(1);
    expect(plays[0]?.options.loop).toBe(false);
    clock.time = 7;
    m.update();
    expect(plays).toHaveLength(1);
    clock.time = 8;
    m.update();
    expect(plays).toHaveLength(2);
    expect(m.current).toBe(b);
    clock.time = 16;
    m.update();
    expect(m.current).toBe(a);
  });

  it('stops after the last track without repeat, and next skips', () => {
    const { music, plays, clock } = setup();
    const m = music();
    m.playlist([track('a', 10), track('b', 10)], { repeat: false });
    m.next();
    expect(plays).toHaveLength(2);
    clock.time = 100;
    m.update();
    m.update();
    expect(plays).toHaveLength(2);
  });

  it('shuffles with the given random source and play() ends the playlist', () => {
    const { music, plays, clock } = setup();
    const m = music(() => 0);
    const [a, b, c] = [track('a', 5), track('b', 5), track('c', 5)] as [Sound, Sound, Sound];
    m.playlist([a, b, c], { shuffle: true });
    expect(m.current).toBe(b);
    m.play(a);
    clock.time = 50;
    m.update();
    expect(plays).toHaveLength(2);
  });
});
