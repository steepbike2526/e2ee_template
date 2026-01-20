import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const basePath = process.env.BASE_PATH ?? (repository ? `/${repository}` : '');

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: '200.html'
    }),
    paths: {
      base: basePath
    },
    prerender: {
      entries: ['*'],
      handleHttpError: ({ path, message }) => {
        if (basePath && path === '/') {
          return;
        }

        throw new Error(message);
      }
    },
    serviceWorker: {
      register: false
    }
  }
};

export default config;
