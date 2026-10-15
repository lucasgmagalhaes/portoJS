import { createCore } from './core/core.js';
import type { Core, CoreOfflineOptions, CoreOptions } from './core/core.js';
import type { AnyPlugin } from './core/plugin.js';
import { achievements } from './mechanics/achievements/index.js';
import type {
  AchievementDef,
  AchievementsApi,
  AchievementsEvents,
} from './mechanics/achievements/index.js';
import { prestige } from './mechanics/prestige/index.js';
import type { PrestigeApi, PrestigeConfig, PrestigeEvents } from './mechanics/prestige/index.js';
import { RESOURCES_PLUGIN, PRESTIGE_PLUGIN, resources } from './mechanics/index.js';
import type {
  ResourcesApi,
  ResourcesConfig,
  ResourcesEvents,
  ResourcesOfflineOptions,
} from './mechanics/resources/index.js';

/** What achievement conditions can read: the resources API plus prestige when configured. */
export type GameView<R extends string, G extends string, U extends string, PR> = ResourcesApi<
  R,
  G,
  U
> &
  (PR extends undefined ? unknown : PrestigeApi);

/** Options for {@link createGame}. */
export type GameConfig<
  R extends string,
  G extends string,
  U extends string,
  A extends string,
  PR extends PrestigeConfig<NoInfer<R>, NoInfer<G>, NoInfer<U>> | undefined,
> = Omit<ResourcesConfig<R, G, U>, 'offline'> &
  Omit<CoreOptions, 'plugins' | 'offline'> & {
    /** Offline cap and efficiency, plus tuning for production that has no closed form. */
    readonly offline?: CoreOfflineOptions & ResourcesOfflineOptions;
    /** Optional prestige layer. */
    readonly prestige?: PR;
    /** Optional achievements; each condition receives the game API. */
    readonly achievements?: { readonly [K in A]: AchievementDef<GameView<R, G, U, PR>> };
    /** How often achievement conditions are checked, in ms of game time. Default `1000`. */
    readonly achievementCheckIntervalMs?: number;
  };

type Optional<Condition, T> = Condition extends true ? T : unknown;

/** The object returned by {@link createGame}: the core plus every configured feature. */
export type Game<R extends string, G extends string, U extends string, A extends string, PR> = Core<
  ResourcesEvents<R, G, U> &
    (PR extends undefined ? object : PrestigeEvents) &
    ([A] extends [never] ? object : AchievementsEvents<A>)
> &
  ResourcesApi<R, G, U> &
  Optional<PR extends undefined ? false : true, PrestigeApi> &
  ([A] extends [never] ? unknown : AchievementsApi<A>);

/**
 * Creates a complete idle game from one declarative object: resources, generators,
 * upgrades, and optionally prestige and achievements, on top of the game-agnostic core.
 *
 * For custom mechanics or a different feature mix, compose plugins yourself with
 * {@link createCore}.
 *
 * @example
 * const game = createGame({
 *   resources: { gold: { initial: 10 } },
 *   generators: {
 *     miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 1 },
 *   },
 * });
 * game.start();
 * game.buy('miner', 10);
 * const save = game.save();
 * game.load(save);
 */
export function createGame<
  R extends string,
  G extends string = never,
  U extends string = never,
  A extends string = never,
  PR extends PrestigeConfig<NoInfer<R>, NoInfer<G>, NoInfer<U>> | undefined = undefined,
>(config: GameConfig<R, G, U, A, PR>): Game<R, G, U, A, PR> {
  const {
    resources: resourceDefs,
    generators,
    upgrades,
    prestige: prestigeConfig,
    achievements: achievementDefs,
    achievementCheckIntervalMs,
    offline,
    ...coreOptions
  } = config;

  const plugins: AnyPlugin[] = [
    resources<R, G, U>({
      resources: resourceDefs,
      ...(generators === undefined ? {} : { generators }),
      ...(upgrades === undefined ? {} : { upgrades }),
      ...(offline?.maxChain === undefined && offline?.maxSteps === undefined
        ? {}
        : {
            offline: {
              ...(offline.maxChain === undefined ? {} : { maxChain: offline.maxChain }),
              ...(offline.maxSteps === undefined ? {} : { maxSteps: offline.maxSteps }),
            },
          }),
    }),
  ];
  if (prestigeConfig !== undefined) plugins.push(prestige(prestigeConfig));
  if (achievementDefs !== undefined) {
    plugins.push(
      achievements<GameView<R, G, U, PR>, A>({
        // Conditions see one flat object with the resources and prestige APIs.
        context: (kernel) =>
          Object.assign(
            {},
            kernel.require<ResourcesApi<R, G, U>>(RESOURCES_PLUGIN),
            prestigeConfig === undefined ? {} : kernel.require<PrestigeApi>(PRESTIGE_PLUGIN),
          ) as GameView<R, G, U, PR>,
        definitions: achievementDefs,
        ...(achievementCheckIntervalMs === undefined
          ? {}
          : { checkIntervalMs: achievementCheckIntervalMs }),
      }),
    );
  }

  const core = createCore({
    ...coreOptions,
    ...(offline === undefined ? {} : { offline }),
    plugins,
  });
  // `plugins` is assembled dynamically, so the merged type is asserted once here; the
  // `Game` type mirrors exactly which plugins were added above.
  return core as unknown as Game<R, G, U, A, PR>;
}
