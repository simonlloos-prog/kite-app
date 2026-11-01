/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kite Bassin — vent AROME HD',
        short_name: 'Kite Bassin',
        description: "Vent AROME HD sur le Bassin d'Arcachon",
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0b1320',
        background_color: '#0b1320',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // .mjs: the MapLibre worker, needed for the map to work offline.
        globPatterns: ['**/*.{js,mjs,css,html,svg}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'tiles',
              expiration: { maxEntries: 800, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://api.open-meteo.com',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'open-meteo',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 3600 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
