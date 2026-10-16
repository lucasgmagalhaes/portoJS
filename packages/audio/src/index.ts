/**
 * Web Audio for PortoJS: buses, sound loading, playback control and autoplay unlocking.
 *
 * @module @portojs/audio
 */

export { AudioManager } from './audio-manager.ts';
export { AudioEngine, Playback } from './engine.ts';
export type { AudioEngineOptions, Fetcher, PlayOptions, Sound } from './engine.ts';
export { SoundBank } from './sound-bank.ts';
export type {
  SoundBankOptions,
  SoundDefinition,
  VoiceLimitPolicy,
} from './sound-bank.ts';
export { MusicPlayer } from './music-player.ts';
export type { MusicPlayOptions, MusicPlayerOptions, PlaylistOptions } from './music-player.ts';
export { SpatialAudio, SpatialVoice, spatialize } from './spatial.ts';
export type { Spatial, SpatialOptions } from './spatial.ts';
