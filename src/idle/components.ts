import type { Component, ComponentConstructor } from '../runtime/component.js';
import { Achievement } from './achievement.js';
import { AutoBuyer } from './auto-buyer.js';
import { Boost } from './boost.js';
import { Challenge } from './challenge.js';
import { DataStore } from './data-store.js';
import { Generator } from './generator.js';
import { Prestige } from './prestige.js';
import { Resource } from './resource.js';
import { Unlock } from './unlock.js';
import { Upgrade } from './upgrade.js';

/**
 * Every idle component a scene can name, ready for `new ComponentRegistry().register(...idleComponents)`.
 * `Economy` is left out because the game creates it on its own.
 */
export const idleComponents: ReadonlyArray<ComponentConstructor<Component, never>> = [
  Resource,
  Generator,
  Upgrade,
  Prestige,
  Achievement,
  Unlock,
  AutoBuyer,
  Challenge,
  Boost,
  DataStore,
];
