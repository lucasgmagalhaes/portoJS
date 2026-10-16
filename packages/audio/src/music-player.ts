import type { AudioEngine, Playback, Sound } from './engine.ts';

/**
 * Options of a {@link MusicPlayer}.
 */
export interface MusicPlayerOptions {
  /**
   * Bus the music plays on. Default `music`.
   */
  readonly bus?: string;
  /**
   * Seconds of crossfade between tracks. Default `1`.
   */
  readonly crossfade?: number;
  /**
   * Source of random numbers in `[0, 1)` for shuffling. Default `Math.random`.
   */
  readonly random?: () => number;
}

/**
 * Options of {@link MusicPlayer.play}.
 */
export interface MusicPlayOptions {
  /**
   * Volume of the track, `0` up. Default `1`.
   */
  readonly volume?: number;
  /**
   * Repeat the track until another one starts. Default `true`.
   */
  readonly loop?: boolean;
  /**
   * Loop points in seconds, for an intro that plays once and a body that repeats.
   */
  readonly loopStart?: number;
  readonly loopEnd?: number;
  /**
   * Crossfade for this change. Default: the player's.
   */
  readonly fade?: number;
}

/**
 * Options of {@link MusicPlayer.playlist}.
 */
export interface PlaylistOptions {
  /**
   * Play in random order, every track once before any repeats. Default `false`.
   */
  readonly shuffle?: boolean;
  /**
   * Start over after the last track. Default `true`.
   */
  readonly repeat?: boolean;
  readonly volume?: number;
}

interface Track {
  readonly sound: Sound;
  readonly playback: Playback;
  readonly endsAt: number;
}

/**
 * Background music: one track at a time, with a crossfade when it changes, loop points and
 * playlists that move on by themselves. Call {@link MusicPlayer.update} once a frame to let
 * playlists advance.
 *
 * @example
 * const music = new MusicPlayer(audio, { crossfade: 2 });
 * music.play(menuTheme);
 * music.playlist([level1, level2, level3], { shuffle: true });
 * game.onFrame = () => music.update();
 */
export class MusicPlayer {
  private track: Track | undefined;
  private queue: Sound[] = [];
  private order: Sound[] = [];
  private cursor = 0;
  private options: PlaylistOptions = {};
  private listing = false;
  private readonly bus: string;
  private readonly crossfade: number;
  private readonly random: () => number;

  constructor(
    private readonly engine: AudioEngine,
    options: MusicPlayerOptions = {},
  ) {
    this.bus = options.bus ?? 'music';
    this.crossfade = options.crossfade ?? 1;
    this.random = options.random ?? Math.random;
  }

  /**
   * The track that is playing, if any.
   */
  get current(): Sound | undefined {
    return this.track?.sound;
  }

  /**
   * Plays a track, fading out the previous one while this one fades in. Ends any playlist.
   */
  play(sound: Sound, options: MusicPlayOptions = {}): Playback {
    this.listing = false;
    return this.start(sound, options.loop ?? true, options);
  }

  /**
   * Plays tracks one after the other, crossfading between them. Replaces the playing track.
   */
  playlist(sounds: readonly Sound[], options: PlaylistOptions = {}): void {
    this.queue = [...sounds];
    this.options = options;
    this.listing = this.queue.length > 0;
    this.cursor = 0;
    this.order = options.shuffle ? this.shuffled() : [...this.queue];
    if (this.listing) this.startFromList();
  }

  /**
   * Skips to the next track of the playlist. Does nothing when no playlist is playing.
   */
  next(): void {
    if (this.listing) this.startFromList();
  }

  /**
   * Fades the music out and stops it (immediately without `fade`). Ends any playlist.
   */
  stop(fade = this.crossfade): void {
    this.listing = false;
    this.track?.playback.stop(fade);
    this.track = undefined;
  }

  /**
   * Moves a playlist along when the playing track is about to end. Cheap; call it every frame.
   */
  update(): void {
    const track = this.track;
    if (!this.listing || track === undefined) return;
    if (this.engine.context.currentTime >= track.endsAt - this.crossfade) this.startFromList();
  }

  private startFromList(): void {
    if (this.cursor >= this.order.length) {
      if (this.options.repeat === false) {
        this.listing = false;
        return;
      }
      this.cursor = 0;
      if (this.options.shuffle) this.order = this.shuffled();
    }
    const sound = this.order[this.cursor++];
    if (sound === undefined) return;
    this.start(sound, false, { volume: this.options.volume ?? 1 });
  }

  private start(sound: Sound, loop: boolean, options: MusicPlayOptions): Playback {
    const fade = options.fade ?? this.crossfade;
    const volume = options.volume ?? 1;
    this.track?.playback.stop(fade);
    const playback = this.engine.play(sound, {
      bus: this.bus,
      loop,
      volume: fade > 0 ? 0 : volume,
      ...(options.loopStart !== undefined ? { loopStart: options.loopStart } : {}),
      ...(options.loopEnd !== undefined ? { loopEnd: options.loopEnd } : {}),
    });
    if (fade > 0) playback.fadeTo(volume, fade);
    this.track = {
      sound,
      playback,
      endsAt: this.engine.context.currentTime + sound.duration,
    };
    return playback;
  }

  private shuffled(): Sound[] {
    const items = [...this.queue];
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const a = items[i];
      const b = items[j];
      if (a !== undefined && b !== undefined) {
        items[i] = b;
        items[j] = a;
      }
    }
    return items;
  }
}
