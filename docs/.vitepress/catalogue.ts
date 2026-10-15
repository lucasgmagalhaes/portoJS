export type ItemKind = 'package' | 'component' | 'system' | 'tool' | 'example';

/**
 * One entry of the catalogue page.
 */
export interface CatalogueItem {
  /**
   * Name as you import it, or the example folder.
   */
  readonly name: string;
  readonly kind: ItemKind;
  /**
   * The package that exports it (without the @portojs/ prefix), when it is code.
   */
  readonly package?: string;
  readonly summary: string;
  /**
   * Page of the guide that explains it.
   */
  readonly link: string;
}

export const KINDS: readonly ItemKind[] = ['package', 'component', 'system', 'tool', 'example'];

type Row = readonly [name: string, kind: ItemKind, pkg: string, summary: string, link: string];

const GITHUB = 'https://github.com/lucasgmagalhaes/portoJS/tree/main/';

const PACKAGES: readonly Row[] = [
  [
    '@portojs/core',
    'package',
    '',
    'Big numbers, clock, fixed-timestep engine, events, offline math and versioned saves.',
    '/getting-started',
  ],
  [
    '@portojs/runtime',
    'package',
    '',
    'Game, GameObject and Component, with coroutines, prefabs and JSON scenes.',
    '/components',
  ],
  [
    '@portojs/idle',
    'package',
    '',
    'Idle mechanics as components: resources, generators, upgrades, prestige and more.',
    '/components',
  ],
  ['@portojs/react', 'package', '', 'useGame hook for React.', '/bindings'],
  ['@portojs/vue', 'package', '', 'useGame composable for Vue.', '/bindings'],
  ['@portojs/svelte', 'package', '', 'useGame as a Svelte store.', '/bindings'],
  ['@portojs/solid', 'package', '', 'useGame as a Solid signal.', '/bindings'],
  [
    '@portojs/ecs',
    'package',
    '',
    'Typed-array ECS: integer entities, cached queries and systems.',
    '/ecs-and-render',
  ],
  [
    '@portojs/render',
    'package',
    '',
    'Camera and auto-batching sprites on WebGPU with a WebGL2 fallback.',
    '/ecs-and-render',
  ],
  [
    '@portojs/input',
    'package',
    '',
    'Keyboard, pointer and gamepad input with named actions.',
    '/input-and-audio',
  ],
  [
    '@portojs/audio',
    'package',
    '',
    'Web Audio mixer with buses and playback control.',
    '/input-and-audio',
  ],
  [
    '@portojs/physics',
    'package',
    '',
    '2D rigid bodies and collision events on Rapier.',
    '/physics',
  ],
  [
    '@portojs/tools',
    'package',
    '',
    'Balancing simulator and game inspector.',
    '/balancing-and-devtools',
  ],
  [
    '@portojs/devtools',
    'package',
    '',
    'React panel to inspect, edit and fast-forward a game.',
    '/balancing-and-devtools',
  ],
  [
    '@portojs/worker',
    'package',
    '',
    'Run a game in a Web Worker, driven over a typed channel.',
    '/worker',
  ],
  [
    '@portojs/platform',
    'package',
    '',
    'Telegram, TikTok and web adapters: storage, lifecycle, haptics.',
    '/platforms',
  ],
  [
    'portojs',
    'package',
    '',
    'The umbrella: core, runtime and idle, with subpath entries.',
    '/getting-started',
  ],
];

const CODE: readonly Row[] = [
  [
    'Resource',
    'component',
    'idle',
    'A balance such as gold, with earn, spend and a production rate.',
    '/components',
  ],
  [
    'Generator',
    'component',
    'idle',
    'Produces a resource or another generator; bulk buy and exact offline gains.',
    '/components',
  ],
  [
    'Upgrade',
    'component',
    'idle',
    'Levels that apply multipliers to generators or resources.',
    '/components',
  ],
  [
    'Prestige',
    'component',
    'idle',
    'Resets for permanent bonuses, in stackable layers.',
    '/prestige',
  ],
  [
    'Achievement',
    'component',
    'idle',
    'Condition-based goals with an optional persistent effect.',
    '/components',
  ],
  [
    'Unlock',
    'component',
    'idle',
    'Gates generators and upgrades behind a condition.',
    '/components',
  ],
  ['AutoBuyer', 'component', 'idle', 'Buys a generator on a timer.', '/components'],
  [
    'Challenge',
    'component',
    'idle',
    'Restart with a handicap and earn a permanent reward.',
    '/components',
  ],
  [
    'Boost',
    'component',
    'idle',
    'Time-limited multipliers, such as 2x for 30 seconds.',
    '/components',
  ],
  [
    'LiveEvent',
    'component',
    'idle',
    'Calendar windows with multipliers, such as double gold on weekends.',
    '/components',
  ],
  ['DataStore', 'component', 'idle', 'Free-form saved data.', '/components'],
  ['EcsWorld', 'component', 'ecs', 'Runs ECS systems inside the fixed update.', '/ecs-and-render'],
  [
    'InputComponent',
    'component',
    'input',
    'Owns an Input and ends each step for you.',
    '/input-and-audio',
  ],
  [
    'AudioManager',
    'component',
    'audio',
    'Owns an AudioEngine and suspends it with the game.',
    '/input-and-audio',
  ],
  [
    'PhysicsWorld',
    'component',
    'physics',
    'Steps a Rapier world once per fixed update.',
    '/physics',
  ],
  [
    'RigidBody2D',
    'component',
    'physics',
    'A body with one collider, with collision events.',
    '/physics',
  ],
  [
    'World',
    'system',
    'ecs',
    'Entities, typed-array components, cached queries and systems.',
    '/ecs-and-render',
  ],
  [
    'createSpriteSystem',
    'system',
    'render',
    'Copies transforms and sprites from the ECS into a batch every frame.',
    '/ecs-and-render',
  ],
  [
    'SpriteBatch',
    'system',
    'render',
    'Groups sprites by layer and texture into one instanced draw each.',
    '/ecs-and-render',
  ],
  [
    'createRenderer',
    'system',
    'render',
    'WebGPU first, WebGL2 when it is not available.',
    '/ecs-and-render',
  ],
  [
    'solveFlows',
    'system',
    'idle',
    'Exact closed-form production across chained generators.',
    '/offline-progress',
  ],
  [
    'loadScene',
    'system',
    'runtime',
    'Builds objects and components from a JSON scene.',
    '/components',
  ],
  [
    'format',
    'system',
    'core',
    'Scientific, engineering, suffix and localised number formatting.',
    '/getting-started',
  ],
  [
    'bindPlatform',
    'system',
    'platform',
    'Load, autosave, suspend and resume a game on its platform.',
    '/platforms',
  ],
  [
    'simulate',
    'tool',
    'tools',
    'Fast-forward a game with a scripted player and report milestones.',
    '/balancing-and-devtools',
  ],
  [
    'inspectGame',
    'tool',
    'tools',
    'Plain-data snapshot of every object, component and saved state.',
    '/balancing-and-devtools',
  ],
  [
    'costChartSvg',
    'tool',
    'idle',
    'Draw cost curves as an SVG chart for balancing.',
    '/balancing-and-devtools',
  ],
  ['Devtools', 'tool', 'devtools', 'React inspector panel.', '/balancing-and-devtools'],
  ['serveGame', 'tool', 'worker', 'Serve a game from inside a Web Worker.', '/worker'],
  ['connectGame', 'tool', 'worker', 'Drive a worker game from the page.', '/worker'],
];

const EXAMPLES: readonly Row[] = [
  [
    'examples/clicker',
    'example',
    '',
    'A small clicker with saves and offline progress, built with Vite.',
    `${GITHUB}examples/clicker`,
  ],
  [
    'examples/sprites',
    'example',
    '',
    'Ten thousand moving sprites on WebGPU or WebGL2.',
    `${GITHUB}examples/sprites`,
  ],
];

function toItem([name, kind, pkg, summary, link]: Row): CatalogueItem {
  return pkg === '' ? { name, kind, summary, link } : { name, kind, package: pkg, summary, link };
}

export const catalogue: readonly CatalogueItem[] = [...PACKAGES, ...CODE, ...EXAMPLES].map(toItem);

export interface CatalogueFilter {
  readonly query?: string;
  readonly kind?: ItemKind | undefined;
}

/**
 * The items matching a free-text query (name, package or summary) and an optional kind.
 */
export function filterCatalogue(
  items: readonly CatalogueItem[],
  filter: CatalogueFilter,
): CatalogueItem[] {
  const words = (filter.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const result: CatalogueItem[] = [];
  for (const item of items) {
    if (filter.kind !== undefined && item.kind !== filter.kind) continue;
    const text = `${item.name} ${item.package ?? ''} ${item.summary}`.toLowerCase();
    if (words.every((word) => text.includes(word))) result.push(item);
  }
  return result;
}
