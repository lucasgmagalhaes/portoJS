import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'PortoJS',
  description:
    'A headless TypeScript game engine with a Unity-style Game, GameObject and Component model.',
  base: process.env['DOCS_BASE'] ?? '/',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['**/README.md'],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
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
          { text: 'UI bindings', link: '/bindings' },
          { text: 'Coming from Unity or Phaser', link: '/from-unity' },
        ],
      },
      {
        text: 'Try it',
        items: [{ text: 'Playground', link: '/playground' }],
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
        '@portojs/vue': fileURLToPath(new URL('../../packages/vue/src/index.ts', import.meta.url)),
        portojs: fileURLToPath(new URL('../../packages/portojs/src/index.ts', import.meta.url)),
      },
    },
  },
});
