import { describe, expect, it } from 'vitest';
import { Animator, Atlas, clipFromTag, clipsFromAtlas, parseAtlasJson } from '../src/index.ts';

const frames = ['a', 'b', 'c'];

describe('Animator', () => {
  it('advances at the clip fps and loops', () => {
    const animator = new Animator([{ name: 'run', frames, fps: 10 }]);
    animator.play('run');
    expect(animator.frame).toBe('a');
    animator.update(0.1);
    expect(animator.frame).toBe('b');
    animator.update(0.15);
    expect(animator.frame).toBe('c');
    animator.update(0.1);
    expect(animator.frame).toBe('a');
    expect(animator.frameIndex).toBe(0);
  });

  it('uses per-frame durations and skips many frames in one big step', () => {
    const animator = new Animator([{ name: 'x', frames, durationsMs: [100, 300, 100] }]);
    animator.play('x');
    animator.update(0.35);
    expect(animator.frame).toBe('b');
    animator.update(10.05);
    expect(['a', 'b', 'c']).toContain(animator.frame);
  });

  it('stops at the end of a once clip and reports completion', () => {
    const done: string[] = [];
    const animator = new Animator([{ name: 'hit', frames, fps: 10, loop: 'once' }], {
      onComplete: (clip) => done.push(clip),
    });
    animator.play('hit');
    animator.update(5);
    expect(animator.frame).toBe('c');
    expect(animator.finished).toBe(true);
    animator.update(5);
    expect(done).toEqual(['hit']);
    animator.play('hit', true);
    expect(animator.finished).toBe(false);
    expect(animator.frame).toBe('a');
  });

  it('bounces back and forth in pingpong mode', () => {
    const animator = new Animator([{ name: 'p', frames, fps: 10, loop: 'pingpong' }]);
    animator.play('p');
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      animator.update(0.1);
      seen.push(animator.frame);
    }
    expect(seen).toEqual(['b', 'c', 'b', 'a', 'b', 'c']);
  });

  it('fires frame events, including on the first frame', () => {
    const events: string[] = [];
    const animator = new Animator(
      [{ name: 'attack', frames, fps: 10, events: { 0: 'swing', 2: 'hit' } }],
      { onEvent: (event, clip) => events.push(`${clip}:${event}`) },
    );
    animator.play('attack');
    animator.update(0.2);
    expect(events).toEqual(['attack:swing', 'attack:hit']);
  });

  it('keeps playing when the same clip is requested again, unless restarted', () => {
    const animator = new Animator([{ name: 'r', frames, fps: 10 }]);
    animator.play('r');
    animator.update(0.1);
    animator.play('r');
    expect(animator.frame).toBe('b');
    animator.play('r', true);
    expect(animator.frame).toBe('a');
  });

  it('follows transitions and a speed scale', () => {
    let moving = false;
    const animator = new Animator([
      { name: 'idle', frames: ['i'], fps: 1 },
      { name: 'run', frames, fps: 10 },
    ]);
    animator.addTransition({ from: 'idle', to: 'run', when: () => moving });
    animator.play('idle');
    animator.update(0.1);
    expect(animator.current).toBe('idle');
    moving = true;
    animator.update(0.1);
    expect(animator.current).toBe('run');
    animator.speed = 2;
    animator.update(0.1);
    expect(animator.frame).toBe('c');
    animator.speed = 0;
    animator.update(10);
    expect(animator.frame).toBe('c');
    expect(() => (animator.speed = -1)).toThrow(RangeError);
  });

  it('handles a one-frame pingpong clip', () => {
    const animator = new Animator([{ name: 'one', frames: ['z'], fps: 10, loop: 'pingpong' }]);
    animator.play('one');
    animator.update(1);
    expect(animator.frame).toBe('z');
  });

  it('validates clips and usage', () => {
    expect(() => new Animator([{ name: 'e', frames: [] }])).toThrow(RangeError);
    expect(() => new Animator([{ name: 'e', frames, fps: 0 }])).toThrow(RangeError);
    expect(() => new Animator([{ name: 'e', frames, durationsMs: [1] }])).toThrow(RangeError);
    expect(
      () =>
        new Animator([
          { name: 'd', frames },
          { name: 'd', frames },
        ]),
    ).toThrow(/duplicate/);
    const animator = new Animator([{ name: 'ok', frames }]);
    expect(() => animator.frame).toThrow(/play/);
    expect(() => animator.play('nope')).toThrow(RangeError);
    animator.update(1);
  });
});

describe('clips from atlas tags', () => {
  const data = parseAtlasJson({
    frames: {
      f0: { frame: { x: 0, y: 0, w: 8, h: 8 }, duration: 50 },
      f1: { frame: { x: 8, y: 0, w: 8, h: 8 }, duration: 150 },
    },
    meta: {
      size: { w: 16, h: 8 },
      frameTags: [
        { name: 'fwd', from: 0, to: 1, direction: 'forward' },
        { name: 'rev', from: 0, to: 1, direction: 'reverse' },
        { name: 'ping', from: 0, to: 1, direction: 'pingpong' },
      ],
    },
  });

  it('builds clips with the file durations and direction', () => {
    const clips = clipsFromAtlas(new Atlas({ id: 1, width: 16, height: 8 }, data));
    expect(clips.map((c) => [c.name, c.loop])).toEqual([
      ['fwd', 'loop'],
      ['rev', 'loop'],
      ['ping', 'pingpong'],
    ]);
    expect(clips[1]).toMatchObject({ frames: ['f1', 'f0'], durationsMs: [150, 50] });
    const once = clipFromTag(data.tags[0] as (typeof data.tags)[number], 'once');
    expect(once.loop).toBe('once');
  });
});
