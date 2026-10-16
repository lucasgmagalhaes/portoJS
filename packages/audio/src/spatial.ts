import type { AudioEngine, PlayOptions, Playback, Sound } from './engine.ts';

/**
 * Options of {@link spatialize}.
 */
export interface SpatialOptions {
  /**
   * Up to this distance the sound is at full volume. Default `0`.
   */
  readonly refDistance?: number;
  /**
   * From this distance on the sound is silent. Default `1000`.
   */
  readonly maxDistance?: number;
  /**
   * How fast the volume falls between the two distances: `1` is a straight line, higher values
   * fall faster at first. Default `1`.
   */
  readonly rolloff?: number;
  /**
   * Horizontal distance at which the sound is fully left or right. Default: `maxDistance / 2`.
   */
  readonly panDistance?: number;
}

/**
 * Where a sound seems to come from.
 */
export interface Spatial {
  /**
   * Volume factor, `0` to `1`.
   */
  readonly volume: number;
  /**
   * Stereo position, `-1` to `1`.
   */
  readonly pan: number;
}

/**
 * Works out the volume and pan of a sound at (`sx`, `sy`) heard from (`lx`, `ly`) in a 2D world.
 */
export function spatialize(
  lx: number,
  ly: number,
  sx: number,
  sy: number,
  options: SpatialOptions = {},
): Spatial {
  const ref = options.refDistance ?? 0;
  const max = options.maxDistance ?? 1000;
  const rolloff = options.rolloff ?? 1;
  const panDistance = options.panDistance ?? max / 2;
  const dx = sx - lx;
  const dy = sy - ly;
  const distance = Math.hypot(dx, dy);
  let volume = 1;
  if (distance >= max) volume = 0;
  else if (distance > ref) volume = (1 - (distance - ref) / (max - ref)) ** rolloff;
  const pan = panDistance > 0 ? Math.max(-1, Math.min(1, dx / panDistance)) : 0;
  return { volume, pan };
}

/**
 * A sound placed in the world: move it and it follows.
 */
export class SpatialVoice {
  constructor(
    readonly playback: Playback,
    private readonly space: SpatialAudio,
    private baseVolume: number,
    private posX: number,
    private posY: number,
  ) {}

  /**
   * Moves the sound.
   */
  moveTo(x: number, y: number): void {
    this.posX = x;
    this.posY = y;
    this.refresh();
  }

  /**
   * Stops the sound.
   */
  stop(fade = 0): void {
    this.playback.stop(fade);
  }

  /**
   * Recomputes volume and pan from the listener. {@link SpatialAudio.listenAt} does it for you.
   */
  refresh(): void {
    if (!this.playback.isPlaying) return;
    const result = this.space.resolve(this.posX, this.posY);
    this.playback.volume = this.baseVolume * result.volume;
    this.playback.pan = result.pan;
  }

  /**
   * @internal
   */
  get isPlaying(): boolean {
    return this.playback.isPlaying;
  }
}

/**
 * 2D positional audio: sounds get quieter and move to one ear as they get away from the
 * listener (usually the camera or the player).
 *
 * @example
 * const space = new SpatialAudio(audio, { maxDistance: 600 });
 * const engine = space.play(motor, { loop: true }, enemy.x, enemy.y);
 * // every frame
 * space.listenAt(player.x, player.y);
 * engine.moveTo(enemy.x, enemy.y);
 */
export class SpatialAudio {
  private x = 0;
  private y = 0;
  private voices: SpatialVoice[] = [];

  constructor(
    private readonly engine: AudioEngine,
    private readonly options: SpatialOptions = {},
  ) {}

  /**
   * Moves the listener and updates every sound that is still playing.
   */
  listenAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
    const alive: SpatialVoice[] = [];
    for (const voice of this.voices) {
      if (!voice.isPlaying) continue;
      voice.refresh();
      alive.push(voice);
    }
    this.voices = alive;
  }

  /**
   * Volume and pan for a sound at a position, with this space's options.
   */
  resolve(x: number, y: number): Spatial {
    return spatialize(this.x, this.y, x, y, this.options);
  }

  /**
   * Plays a sound at a position.
   */
  play(sound: Sound, options: PlayOptions, x: number, y: number): SpatialVoice {
    const result = this.resolve(x, y);
    const base = options.volume ?? 1;
    const playback = this.engine.play(sound, {
      ...options,
      volume: base * result.volume,
      pan: result.pan,
    });
    const voice = new SpatialVoice(playback, this, base, x, y);
    this.voices.push(voice);
    return voice;
  }
}
