import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import Catalogue from './Catalogue.vue';
import Playground from './Playground.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Playground', Playground);
    app.component('Catalogue', Catalogue);
  },
} satisfies Theme;
