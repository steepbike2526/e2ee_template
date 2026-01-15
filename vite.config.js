import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

const config = {
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      manifest: {
        name: 'E2EE Notes Demo',
        short_name: 'E2EE Notes',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          {
            src: '/pwa-icon.svg',
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
  build: {
    commonjsOptions: {
      ignore: ['argon2-browser/dist/argon2.wasm']
    }
  }
};

export default config;
