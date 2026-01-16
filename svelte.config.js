import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: '200.html'
    }),
    paths: {
      base: process.env.BASE_PATH ?? ''
    },
    serviceWorker: {
      register: false
    }
  }
};

export default config;
