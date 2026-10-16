import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

const base = process.env['DOCS_BASE'] ?? '/';

export default defineConfig({
  title: 'PortoJS',
  head: [['link', { rel: 'icon', href: `${base}logo.svg` }]],
  description:
    'A headless TypeScript game engine with a Unity-style Game, GameObject and Component model.',
  base,
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['**/README.md'],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Tutorials', link: '/tutorials/' },
      { text: 'Catalogue', link: '/catalogue' },
      { text: 'Playground', link: '/playground' },
      { text: 'API', link: '/api/' },
      { text: 'Roadmap', link: '/roadmap' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/getting-started' },
          { text: 'Offline progress', link: '/offline-progress' },
          { text: 'Saves and migrations', link: '/saves-and-migrations' },
          { text: 'Prestige', link: '/prestige' },
          { text: 'Components and the game model', link: '/components' },
          { text: 'ECS and rendering', link: '/ecs-and-render' },
          { text: 'Input and audio', link: '/input-and-audio' },
          { text: 'Assets', link: '/assets' },
          { text: 'Tweens and easing', link: '/tween' },
          { text: 'Math and random numbers', link: '/math' },
          { text: 'Translations', link: '/i18n' },
          { text: 'Tilemaps', link: '/tilemap' },
          { text: 'In-canvas UI', link: '/ui' },
          { text: 'Testing', link: '/testing' },
          { text: 'Physics', link: '/physics' },
          { text: 'Web Worker', link: '/worker' },
          { text: 'Platforms', link: '/platforms' },
          { text: 'Balancing and devtools', link: '/balancing-and-devtools' },
          { text: 'UI bindings', link: '/bindings' },
          { text: 'Coming from Unity or Phaser', link: '/from-unity' },
        ],
      },
      {
        text: 'Tutorials',
        items: [
          { text: 'Overview', link: '/tutorials/' },
          { text: 'Hello, game', link: '/tutorials/hello-game' },
          { text: 'Your first idle game', link: '/tutorials/idle-game' },
          { text: 'A sprite game', link: '/tutorials/sprite-game' },
          { text: 'A bouncing ball', link: '/tutorials/bouncing-ball' },
        ],
      },
      {
        text: 'Try it',
        items: [
          { text: 'Catalogue', link: '/catalogue' },
          { text: 'Playground', link: '/playground' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'API reference', link: '/api/' },
          { text: 'Engineering audit and roadmap', link: '/roadmap' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/lucasgmagalhaes/portoJS' }],
    search: { provider: 'local' },
    footer: { message: 'Released under the MIT License.' },
  },
  vite: {
    resolve: {
      alias: {
        '@portojs/core/bignum': fileURLToPath(
          new URL('../../packages/core/src/bignum.ts', import.meta.url),
        ),
        '@portojs/core': fileURLToPath(
          new URL('../../packages/core/src/index.ts', import.meta.url),
        ),
        '@portojs/runtime': fileURLToPath(
          new URL('../../packages/runtime/src/index.ts', import.meta.url),
        ),
        '@portojs/idle': fileURLToPath(
          new URL('../../packages/idle/src/index.ts', import.meta.url),
        ),
        '@portojs/react': fileURLToPath(
          new URL('../../packages/react/src/index.ts', import.meta.url),
        ),
        '@portojs/svelte': fileURLToPath(
          new URL('../../packages/svelte/src/index.ts', import.meta.url),
        ),
        '@portojs/solid': fileURLToPath(
          new URL('../../packages/solid/src/index.ts', import.meta.url),
        ),
        '@portojs/vue': fileURLToPath(new URL('../../packages/vue/src/index.ts', import.meta.url)),
        '@portojs/assets': fileURLToPath(
          new URL('../../packages/assets/src/index.ts', import.meta.url),
        ),
        '@portojs/tween': fileURLToPath(
          new URL('../../packages/tween/src/index.ts', import.meta.url),
        ),
        '@portojs/math': fileURLToPath(
          new URL('../../packages/math/src/index.ts', import.meta.url),
        ),
        '@portojs/i18n': fileURLToPath(
          new URL('../../packages/i18n/src/index.ts', import.meta.url),
        ),
        '@portojs/tilemap': fileURLToPath(
          new URL('../../packages/tilemap/src/index.ts', import.meta.url),
        ),
        '@portojs/ui': fileURLToPath(
          new URL('../../packages/ui/src/index.ts', import.meta.url),
        ),
        '@portojs/testing': fileURLToPath(
          new URL('../../packages/testing/src/index.ts', import.meta.url),
        ),
        '@portojs/physics': fileURLToPath(
          new URL('../../packages/physics/src/index.ts', import.meta.url),
        ),
        '@portojs/tools': fileURLToPath(
          new URL('../../packages/tools/src/index.ts', import.meta.url),
        ),
        '@portojs/devtools': fileURLToPath(
          new URL('../../packages/devtools/src/index.ts', import.meta.url),
        ),
        '@portojs/worker': fileURLToPath(
          new URL('../../packages/worker/src/index.ts', import.meta.url),
        ),
        '@portojs/platform': fileURLToPath(
          new URL('../../packages/platform/src/index.ts', import.meta.url),
        ),
        portojs: fileURLToPath(new URL('../../packages/portojs/src/index.ts', import.meta.url)),
      },
    },
  },
});
