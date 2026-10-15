import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

const source = fileURLToPath(new URL('../../src/index.ts', import.meta.url));

export default defineConfig({
  title: 'PortoJS',
  description: 'A headless TypeScript engine for idle and incremental games.',
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
          { text: 'Writing plugins', link: '/plugins' },
          { text: 'UI bindings', link: '/bindings' },
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
  vite: { resolve: { alias: { portojs: source } } },
});
