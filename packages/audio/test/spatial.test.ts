import { describe, expect, it } from 'vitest';
import { SpatialAudio, spatialize } from '../src/index.ts';
import type { AudioEngine, PlayOptions, Sound } from '../src/index.ts';

describe('spatialize', () => {
  it('is full volume inside the reference distance and silent past the maximum', () => {
    const o = { refDistance: 10, maxDistance: 110 };
    expect(spatialize(0, 0, 5, 0, o).volume).toBe(1);
    expect(spatialize(0, 0, 60, 0, o).volume).toBeCloseTo(0.5);
    expect(spatialize(0, 0, 110, 0, o).volume).toBe(0);
    expect(spatialize(0, 0, 0, 500, o).volume).toBe(0);
  });

  it('uses the distance in both axes and a rolloff exponent', () => {
    expect(spatialize(0, 0, 3, 4, { maxDistance: 10 }).volume).toBeCloseTo(0.5);
    expect(spatialize(0, 0, 3, 4, { maxDistance: 10, rolloff: 2 }).volume).toBeCloseTo(0.25);
  });

  it('pans by the horizontal offset and clamps', () => {
    const o = { maxDistance: 1000, panDistance: 100 };
    expect(spatialize(0, 0, 50, 0, o).pan).toBe(0.5);
    expect(spatialize(0, 0, -500, 0, o).pan).toBe(-1);
    expect(spatialize(0, 0, 0, 80, o).pan).toBe(0);
  });
});

class FakePlayback {
  isPlaying = true;
  volume = 0;
  pan = 0;
  stop(): void {
    this.isPlaying = false;
  }
}

describe('SpatialAudio', () => {
  function setup(): { space: SpatialAudio; plays: { options: PlayOptions; playback: FakePlayback }[] } {
    const plays: { options: PlayOptions; playback: FakePlayback }[] = [];
    const engine = {
      play(_sound: Sound, options: PlayOptions): FakePlayback {
        const playback = new FakePlayback();
        plays.push({ options, playback });
        return playback;
      },
    } as unknown as AudioEngine;
    return { plays, space: new SpatialAudio(engine, { maxDistance: 100, panDistance: 100 }) };
  }
  const sound = {} as Sound;

  it('starts with the listener-relative volume and pan', () => {
    const { space, plays } = setup();
    space.listenAt(0, 0);
    space.play(sound, { volume: 0.8 }, 50, 0);
    expect(plays[0]?.options.volume).toBeCloseTo(0.4);
    expect(plays[0]?.options.pan).toBe(0.5);
  });

  it('follows the listener and the source', () => {
    const { space, plays } = setup();
    const voice = space.play(sound, {}, 100, 0);
    const playback = plays[0]?.playback as FakePlayback;
    space.listenAt(100, 0);
    expect(playback.volume).toBe(1);
    expect(playback.pan).toBe(0);
    voice.moveTo(150, 0);
    expect(playback.volume).toBeCloseTo(0.5);
    expect(playback.pan).toBe(0.5);
  });

  it('forgets finished voices and does not touch them', () => {
    const { space, plays } = setup();
    const voice = space.play(sound, {}, 0, 0);
    voice.stop();
    const playback = plays[0]?.playback as FakePlayback;
    playback.volume = 0.123;
    space.listenAt(50, 0);
    voice.moveTo(60, 0);
    expect(playback.volume).toBe(0.123);
  });
});
