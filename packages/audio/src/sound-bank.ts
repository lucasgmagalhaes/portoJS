import type { AudioEngine, PlayOptions, Playback, Sound } from './engine.ts';

/**
 * How a named sound is played by a {@link SoundBank}.
 */
export interface SoundDefinition {
  readonly sound: Sound;
  /**
   * Bus to play on. Default `sfx`.
   */
  readonly bus?: string;
  /**
   * Base volume. Default `1`.
   */
  readonly volume?: number;
  /**
   * Base playback speed. Default `1`.
   */
  readonly rate?: number;
  /**
   * Random change of the speed, as a fraction: `0.1` plays between 0.9x and 1.1x. Default `0`.
   */
  readonly pitchVariation?: number;
  /**
   * Random change of the volume, as a fraction: `0.2` plays between 0.8x and 1.2x. Default `0`.
   */
  readonly volumeVariation?: number;
  /**
   * Most copies of this sound playing at once. Default: no limit.
   */
  readonly maxVoices?: number;
  /**
   * Plays only part of the sound: seconds from the start, and how long. For audio sprites.
   */
  readonly region?: { readonly start: number; readonly duration: number };
}

/**
 * What to do when a sound is asked for while all its voices are busy.
 */
export type VoiceLimitPolicy = 'steal-oldest' | 'reject';

/**
 * Options of a {@link SoundBank}.
 */
export interface SoundBankOptions {
  /**
   * Source of random numbers in `[0, 1)` for the variations. Default `Math.random`.
   */
  readonly random?: () => number;
  /**
   * What happens when a voice limit is reached. Default `steal-oldest`.
   */
  readonly policy?: VoiceLimitPolicy;
  /**
   * Most sounds playing at once through this bank, whatever their name. Default: no limit.
   */
  readonly maxVoices?: number;
}

interface Voice {
  readonly name: string;
  readonly playback: Playback;
}

/**
 * Named sound effects with pitch and volume variation, a limit of voices (so a hundred
 * explosions at once do not clip) and audio sprites (several effects in one file).
 *
 * @example
 * const bank = new SoundBank(audio);
 * bank.add('hit', { sound: hit, pitchVariation: 0.1, maxVoices: 4 });
 * bank.addSprites(sheet, { coin: { start: 0, duration: 0.4 }, jump: { start: 0.5, duration: 0.3 } });
 * bank.play('coin');
 */
export class SoundBank {
  private readonly definitions = new Map<string, SoundDefinition>();
  private readonly voices: Voice[] = [];
  private readonly random: () => number;
  private readonly policy: VoiceLimitPolicy;
  private readonly maxVoices: number;

  constructor(
    private readonly engine: AudioEngine,
    options: SoundBankOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.policy = options.policy ?? 'steal-oldest';
    this.maxVoices = options.maxVoices ?? Infinity;
  }

  /**
   * Registers a sound under a name, replacing any earlier one.
   */
  add(name: string, definition: SoundDefinition): this {
    this.definitions.set(name, definition);
    return this;
  }

  /**
   * Registers several effects that live in one sound file, each with its region.
   */
  addSprites(
    sound: Sound,
    regions: Readonly<Record<string, { start: number; duration: number }>>,
    defaults: Omit<SoundDefinition, 'sound' | 'region'> = {},
  ): this {
    for (const [name, region] of Object.entries(regions)) {
      this.definitions.set(name, { ...defaults, sound, region });
    }
    return this;
  }

  /**
   * Whether a name is registered.
   */
  has(name: string): boolean {
    return this.definitions.has(name);
  }

  /**
   * Number of voices playing now, of one sound or in total.
   */
  voiceCount(name?: string): number {
    this.prune();
    return this.matching(name).length;
  }

  /**
   * Plays a registered sound. Returns `undefined` when it was rejected by a voice limit.
   *
   * @param overrides play options that win over the definition (the variations still apply to
   * `volume` and `rate`).
   * @throws {RangeError} when the name is not registered.
   */
  play(name: string, overrides: PlayOptions = {}): Playback | undefined {
    const definition = this.definitions.get(name);
    if (definition === undefined) throw new RangeError(`SoundBank: unknown sound "${name}"`);
    this.prune();
    if (!this.makeRoom(name, definition.maxVoices ?? Infinity)) return undefined;
    if (!this.makeRoom(undefined, this.maxVoices)) return undefined;
    const volume = (overrides.volume ?? definition.volume ?? 1) * this.vary(definition.volumeVariation);
    const rate = (overrides.rate ?? definition.rate ?? 1) * this.vary(definition.pitchVariation);
    const region = definition.region;
    const options: PlayOptions = {
      ...overrides,
      bus: overrides.bus ?? definition.bus ?? 'sfx',
      volume,
      rate,
      ...(region ? { offset: region.start, duration: region.duration } : {}),
    };
    const playback = this.engine.play(definition.sound, options);
    this.voices.push({ name, playback });
    return playback;
  }

  /**
   * Stops every voice of one sound, or of all of them.
   */
  stop(name?: string): void {
    for (const voice of [...this.voices]) {
      if (name === undefined || voice.name === name) voice.playback.stop();
    }
    this.prune();
  }

  private vary(amount: number | undefined): number {
    return amount ? 1 + (this.random() * 2 - 1) * amount : 1;
  }

  private matching(name: string | undefined): Voice[] {
    const found: Voice[] = [];
    for (const voice of this.voices) {
      if (name === undefined || voice.name === name) found.push(voice);
    }
    return found;
  }

  private prune(): void {
    let kept = 0;
    for (const voice of this.voices) {
      if (voice.playback.isPlaying) this.voices[kept++] = voice;
    }
    this.voices.length = kept;
  }

  /**
   * Frees a slot for `name` (or for anything when `undefined`) if the policy allows it.
   */
  private makeRoom(name: string | undefined, limit: number): boolean {
    for (;;) {
      const mine = this.matching(name);
      if (mine.length < limit) return true;
      if (this.policy === 'reject') return false;
      const oldest = mine[0];
      if (oldest === undefined) return false;
      oldest.playback.stop();
      this.prune();
    }
  }
}
