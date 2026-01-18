import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { fileURLToPath } from 'node:url';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const basePath = process.env.BASE_PATH ?? (repository ? `/${repository}` : '');

const config = {
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      manifest: {
        name: 'E2EE Notes Demo',
        short_name: 'E2EE Notes',
        start_url: basePath || '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          {
            src: `${basePath}/pwa-icon.svg`,
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  server: {
    fs: {
      allow: [fileURLToPath(new URL('./convex', import.meta.url))]
    }
  },
  build: {
    commonjsOptions: {
      ignore: ['argon2-browser/dist/argon2.wasm']
    }
  }
};

export default config;
