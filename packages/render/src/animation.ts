import type { Atlas, AtlasTag } from './atlas.ts';

/**
 * How a clip behaves at its last frame.
 */
export type LoopMode = 'once' | 'loop' | 'pingpong';

/**
 * A sequence of atlas frames played at a speed.
 */
export interface AnimationClip {
  /**
   * Name used to play it.
   */
  readonly name: string;
  /**
   * Frame names in play order.
   */
  readonly frames: readonly string[];
  /**
   * Frames per second, or one duration in ms for each frame.
   */
  readonly fps?: number;
  /**
   * Duration of each frame in ms. Overrides `fps`.
   */
  readonly durationsMs?: readonly number[];
  /**
   * What to do after the last frame. Default `loop`.
   */
  readonly loop?: LoopMode;
  /**
   * Named events fired when a frame starts, by frame index.
   */
  readonly events?: Readonly<Record<number, string>>;
}

/**
 * Builds a clip from an Aseprite tag.
 */
export function clipFromTag(tag: AtlasTag, loop?: LoopMode): AnimationClip {
  const mode: LoopMode = loop ?? (tag.direction === 'pingpong' ? 'pingpong' : 'loop');
  return {
    name: tag.name,
    frames: tag.direction === 'reverse' ? [...tag.frames].reverse() : tag.frames,
    durationsMs: tag.direction === 'reverse' ? [...tag.durationsMs].reverse() : tag.durationsMs,
    loop: mode,
  };
}

/**
 * Builds a clip for every tag of an atlas.
 */
export function clipsFromAtlas(atlas: Atlas): AnimationClip[] {
  return atlas.data.tags.map(tagToClip);
}

function tagToClip(tag: AtlasTag): AnimationClip {
  return clipFromTag(tag);
}

/**
 * A condition that moves an {@link Animator} from one clip to another when it holds.
 */
export interface AnimationTransition {
  readonly from: string;
  readonly to: string;
  /**
   * Checked after every update while `from` is playing.
   */
  readonly when: () => boolean;
}

/**
 * Options of an {@link Animator}.
 */
export interface AnimatorOptions {
  /**
   * Called when a frame with an event starts.
   */
  readonly onEvent?: (event: string, clip: string) => void;
  /**
   * Called when a `once` clip reaches its end.
   */
  readonly onComplete?: (clip: string) => void;
}

function durationsOf(clip: AnimationClip): number[] {
  if (clip.durationsMs !== undefined) {
    if (clip.durationsMs.length !== clip.frames.length) {
      throw new RangeError(`AnimationClip "${clip.name}": one duration is needed per frame`);
    }
    return [...clip.durationsMs];
  }
  const fps = clip.fps ?? 12;
  if (!(fps > 0)) throw new RangeError(`AnimationClip "${clip.name}": fps must be > 0`);
  return new Array<number>(clip.frames.length).fill(1000 / fps);
}

/**
 * Plays {@link AnimationClip}s over time and tells which frame to show. It does not draw: read
 * {@link Animator.frame} and pass it to {@link Atlas.draw} or a sprite.
 *
 * @example
 * const animator = new Animator(clips, { onEvent: (name) => sound.play(name) });
 * animator.play('run');
 * animator.update(dt); // seconds
 * atlas.draw(batch, animator.frame, { x, y });
 */
export class Animator {
  private readonly clips = new Map<string, { clip: AnimationClip; durations: number[] }>();
  private readonly transitions: AnimationTransition[] = [];
  private currentName: string | undefined;
  private index = 0;
  private elapsedMs = 0;
  private direction = 1;
  private finishedFlag = false;
  private speedScale = 1;

  /**
   * @throws {RangeError} on an empty clip, bad durations or a duplicate name.
   */
  constructor(
    clips: readonly AnimationClip[],
    private readonly options: AnimatorOptions = {},
  ) {
    for (const clip of clips) {
      if (clip.frames.length === 0) {
        throw new RangeError(`AnimationClip "${clip.name}": it needs at least one frame`);
      }
      if (this.clips.has(clip.name)) {
        throw new RangeError(`Animator: duplicate clip "${clip.name}"`);
      }
      this.clips.set(clip.name, { clip, durations: durationsOf(clip) });
    }
  }

  /**
   * Name of the clip playing, or `undefined` before the first `play`.
   */
  get current(): string | undefined {
    return this.currentName;
  }

  /**
   * Name of the frame to show now.
   *
   * @throws {Error} before the first `play`.
   */
  get frame(): string {
    const entry = this.currentName === undefined ? undefined : this.clips.get(this.currentName);
    const name = entry?.clip.frames[this.index];
    if (name === undefined) throw new Error('Animator: nothing is playing, call play() first');
    return name;
  }

  /**
   * Index of the current frame within the clip.
   */
  get frameIndex(): number {
    return this.index;
  }

  /**
   * `true` once a `once` clip reached its end.
   */
  get finished(): boolean {
    return this.finishedFlag;
  }

  /**
   * Playback speed, `1` is normal and `0` pauses. Never negative.
   */
  get speed(): number {
    return this.speedScale;
  }

  set speed(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError('Animator: speed must be a finite number >= 0');
    }
    this.speedScale = value;
  }

  /**
   * Adds a transition checked after each update.
   */
  addTransition(transition: AnimationTransition): this {
    this.transitions.push(transition);
    return this;
  }

  /**
   * Starts a clip. Playing the clip that is already playing does nothing unless `restart`.
   *
   * @throws {RangeError} for an unknown clip.
   */
  play(name: string, restart = false): void {
    const entry = this.clips.get(name);
    if (entry === undefined) throw new RangeError(`Animator: no clip "${name}"`);
    if (this.currentName === name && !restart) return;
    this.currentName = name;
    this.index = 0;
    this.elapsedMs = 0;
    this.direction = 1;
    this.finishedFlag = false;
    this.fire(entry.clip, 0);
  }

  /**
   * Advances the animation by `deltaSeconds`.
   */
  update(deltaSeconds: number): void {
    const entry = this.currentName === undefined ? undefined : this.clips.get(this.currentName);
    if (entry !== undefined && !this.finishedFlag) {
      this.elapsedMs += deltaSeconds * 1000 * this.speedScale;
      this.advance(entry.clip, entry.durations);
    }
    for (const transition of this.transitions) {
      if (transition.from === this.currentName && transition.when()) {
        this.play(transition.to);
        break;
      }
    }
  }

  private advance(clip: AnimationClip, durations: readonly number[]): void {
    const mode = clip.loop ?? 'loop';
    for (let guard = 0; guard < 10_000; guard++) {
      const duration = durations[this.index] ?? 0;
      if (this.elapsedMs < duration) return;
      this.elapsedMs -= duration;
      const last = clip.frames.length - 1;
      const next = this.index + this.direction;
      if (next >= 0 && next <= last) {
        this.index = next;
      } else if (mode === 'once') {
        this.finishedFlag = true;
        this.elapsedMs = 0;
        this.options.onComplete?.(clip.name);
        return;
      } else if (mode === 'loop') {
        this.index = this.direction > 0 ? 0 : last;
      } else {
        this.direction = -this.direction;
        this.index = Math.min(last, Math.max(0, this.index + this.direction));
        if (last === 0) this.index = 0;
      }
      this.fire(clip, this.index);
    }
    this.elapsedMs = 0;
  }

  private fire(clip: AnimationClip, index: number): void {
    const event = clip.events?.[index];
    if (event !== undefined) this.options.onEvent?.(event, clip.name);
  }
}
