/**
 * A decoded sound, ready to play many times.
 */
export interface Sound {
  /**
   * The decoded audio data.
   */
  readonly buffer: AudioBuffer;
  /**
   * Length in seconds.
   */
  readonly duration: number;
}

/**
 * Options for {@link AudioEngine.play}.
 */
export interface PlayOptions {
  /**
   * Bus to play on. Default `sfx`.
   */
  readonly bus?: string;
  /**
   * Volume from `0` up. Default `1`.
   */
  readonly volume?: number;
  /**
   * Repeat until stopped. Default `false`.
   */
  readonly loop?: boolean;
  /**
   * Playback speed, `1` is normal. Default `1`.
   */
  readonly rate?: number;
  /**
   * Stereo position from `-1` (left) to `1` (right). Default `0`.
   */
  readonly pan?: number;
  /**
   * Seconds to wait before starting. Default `0`.
   */
  readonly delay?: number;
}

/**
 * Options for {@link AudioEngine}.
 */
export interface AudioEngineOptions {
  /**
   * An existing audio context. Default is a new `AudioContext`.
   */
  readonly context?: AudioContext;
  /**
   * Starting master volume. Default `1`.
   */
  readonly masterVolume?: number;
}

/**
 * Fetches bytes for {@link AudioEngine.load}, like `fetch`.
 */
export type Fetcher = (url: string) => Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;

/**
 * A sound that is playing. Get one from {@link AudioEngine.play}.
 */
export class Playback {
  private playing = true;
  private readonly settle: () => void;

  /**
   * Settles when the sound finishes or is stopped.
   */
  readonly ended: Promise<void>;

  /**
   * @internal Use {@link AudioEngine.play}.
   */
  constructor(
    private readonly source: AudioBufferSourceNode,
    private readonly gain: GainNode,
    private readonly panner: StereoPannerNode | undefined,
    private readonly onFinished: (playback: Playback) => void,
  ) {
    const pending = deferred();
    this.ended = pending.promise;
    this.settle = pending.resolve;
    source.onended = this.finish;
  }

  /**
   * Whether the sound is still playing.
   */
  get isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Volume of this playback.
   */
  get volume(): number {
    return this.gain.gain.value;
  }

  set volume(value: number) {
    this.gain.gain.value = Math.max(0, value);
  }

  /**
   * Playback speed.
   */
  get rate(): number {
    return this.source.playbackRate.value;
  }

  set rate(value: number) {
    this.source.playbackRate.value = value;
  }

  /**
   * Stereo position from `-1` to `1`. Ignored where panning is unsupported.
   */
  set pan(value: number) {
    if (this.panner !== undefined) this.panner.pan.value = Math.max(-1, Math.min(1, value));
  }

  /**
   * Stops the sound. No-op when it already finished.
   */
  stop(): void {
    if (!this.playing) return;
    try {
      this.source.stop();
    } catch (error) {
      rethrowUnlessError(error);
    }
    this.finish();
  }

  private readonly finish = (): void => {
    if (!this.playing) return;
    this.playing = false;
    this.source.disconnect();
    this.gain.disconnect();
    this.panner?.disconnect();
    this.onFinished(this);
    this.settle();
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = returnNothing;
  const promise = new Promise<void>(captureResolve);
  function captureResolve(done: () => void): void {
    resolve = done;
  }
  return { promise, resolve: () => resolve() };
}

function returnNothing(): void {
  return undefined;
}

/**
 * A source that never started throws when stopped; that is fine, anything else is not.
 */
function rethrowUnlessError(error: unknown): void {
  if (!(error instanceof Error)) throw error;
}

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

/**
 * A small mixer on top of the Web Audio API: a master volume, named buses (`sfx`, `music`...),
 * sound loading and playback control.
 *
 * Browsers keep audio suspended until the user interacts; call {@link AudioEngine.unlockOnGesture}
 * once and it resumes on the first click, key press or touch.
 *
 * @example
 * const audio = new AudioEngine();
 * audio.unlockOnGesture(window);
 * const jump = await audio.load('/jump.ogg');
 * audio.play(jump, { volume: 0.8 });
 * audio.setBusVolume('music', 0.4);
 */
export class AudioEngine {
  /**
   * The Web Audio context.
   */
  readonly context: AudioContext;

  private readonly master: GainNode;
  private readonly buses = new Map<string, GainNode>();
  private readonly live = new Set<Playback>();
  private disposed = false;

  /**
   * @throws {Error} if there is no Web Audio support and no context is given.
   */
  constructor(options: AudioEngineOptions = {}) {
    this.context = options.context ?? createContext();
    this.master = this.context.createGain();
    this.master.gain.value = options.masterVolume ?? 1;
    this.master.connect(this.context.destination);
  }

  /**
   * Master volume from `0` up.
   */
  get masterVolume(): number {
    return this.master.gain.value;
  }

  set masterVolume(value: number) {
    this.master.gain.value = Math.max(0, value);
  }

  /**
   * Number of sounds currently playing.
   */
  get playing(): number {
    return this.live.size;
  }

  /**
   * Sets the volume of a bus, creating it when needed.
   */
  setBusVolume(name: string, volume: number): void {
    this.bus(name).gain.value = Math.max(0, volume);
  }

  /**
   * Volume of a bus (`1` for a bus that does not exist yet).
   */
  busVolume(name: string): number {
    return this.buses.get(name)?.gain.value ?? 1;
  }

  /**
   * Decodes encoded audio (mp3, ogg, wav...) into a {@link Sound}.
   */
  async decode(data: ArrayBuffer): Promise<Sound> {
    const buffer = await this.context.decodeAudioData(data);
    return { buffer, duration: buffer.duration };
  }

  /**
   * Downloads and decodes a sound.
   *
   * @param url where to fetch it.
   * @param fetcher replaces `fetch`, for tests or custom loading.
   */
  async load(url: string, fetcher: Fetcher = fetch): Promise<Sound> {
    const response = await fetcher(url);
    return this.decode(await response.arrayBuffer());
  }

  /**
   * Plays a sound and returns a handle to control it.
   */
  play(sound: Sound, options: PlayOptions = {}): Playback {
    if (this.disposed) throw new Error('AudioEngine: already disposed');
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = sound.buffer;
    source.loop = options.loop ?? false;
    source.playbackRate.value = options.rate ?? 1;
    const gain = context.createGain();
    gain.gain.value = Math.max(0, options.volume ?? 1);
    const panner =
      typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : undefined;
    if (panner !== undefined) panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));
    source.connect(gain);
    if (panner === undefined) gain.connect(this.bus(options.bus ?? 'sfx'));
    else {
      gain.connect(panner);
      panner.connect(this.bus(options.bus ?? 'sfx'));
    }
    const playback = new Playback(source, gain, panner, this.release);
    this.live.add(playback);
    source.start(context.currentTime + Math.max(0, options.delay ?? 0));
    return playback;
  }

  /**
   * Stops every sound that is playing.
   */
  stopAll(): void {
    for (const playback of [...this.live]) playback.stop();
  }

  /**
   * Pauses all audio output.
   */
  suspend(): Promise<void> {
    return this.context.suspend();
  }

  /**
   * Resumes audio output. Browsers only allow it after a user gesture.
   */
  resume(): Promise<void> {
    return this.context.resume();
  }

  /**
   * Resumes the context on the first pointer, key or touch event of `target`, then stops
   * listening.
   */
  unlockOnGesture(target: EventTarget): void {
    const unlock = (): void => {
      for (const type of UNLOCK_EVENTS) target.removeEventListener(type, unlock);
      void this.context.resume();
    };
    for (const type of UNLOCK_EVENTS) target.addEventListener(type, unlock);
  }

  /**
   * Stops everything and closes the context. The engine cannot be used afterwards.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.stopAll();
    await this.context.close();
  }

  private bus(name: string): GainNode {
    let node = this.buses.get(name);
    if (node === undefined) {
      node = this.context.createGain();
      node.connect(this.master);
      this.buses.set(name, node);
    }
    return node;
  }

  private readonly release = (playback: Playback): void => {
    this.live.delete(playback);
  };
}

function createContext(): AudioContext {
  const scope = globalThis as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  if (Context === undefined) throw new Error('AudioEngine: Web Audio is not available');
  return new Context();
}
