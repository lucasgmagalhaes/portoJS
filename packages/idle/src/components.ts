import type { Component, ComponentConstructor } from '@portojs/runtime';
import { Achievement } from './achievement.ts';
import { AutoBuyer } from './auto-buyer.ts';
import { Boost } from './boost.ts';
import { Challenge } from './challenge.ts';
import { DailyQuests } from './daily-quests.ts';
import { DailyStreak } from './daily-streak.ts';
import { DataStore } from './data-store.ts';
import { Generator } from './generator.ts';
import { LiveEvent } from './live-event.ts';
import { Prestige } from './prestige.ts';
import { PrestigeTree } from './prestige-tree.ts';
import { Quest } from './quest.ts';
import { Resource } from './resource.ts';
import { Unlock } from './unlock.ts';
import { Upgrade } from './upgrade.ts';

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
  LiveEvent,
  Quest,
  PrestigeTree,
  DailyStreak,
  DailyQuests,
];
