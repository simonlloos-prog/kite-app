/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages serves the app under /<repo>/: the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  // ios-test.html: the iPhone status-bar test app (src/lib/iosTest.ts), next to the real one.
  build: { rollupOptions: { input: { main: 'index.html', iosTest: 'ios-test.html' } } },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kite Bassin — vent AROME',
        short_name: 'Kite Bassin',
        description: "Vent AROME 0,01° sur le Bassin d'Arcachon",
        lang: 'fr',
        start_url: '.',
        scope: '.',
        // Full screen where supported (Android): the map uses the whole screen. iOS ignores it
        // and stays standalone; main.ts handles its shortened viewport.
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait',
        theme_color: '#0b1320',
        background_color: '#0b1320',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // .mjs: the MapLibre worker, needed for the map to work offline. assets/*.bin: the Bassin's relief.
        // Data files (data/) are cached at runtime.
        globPatterns: ['**/*.{js,mjs,css,html,svg}', 'assets/*.bin'],
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
            // Points to the latest run: always ask the network first.
            urlPattern: ({ url }) => url.pathname.endsWith('/data/meta.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'arome-meta', networkTimeoutSeconds: 4 },
          },
          {
            // Hour files live under a per-run folder, so they never change once published.
            urlPattern: ({ url }) => /\/data\/.+\.bin$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'arome-hours', expiration: { maxEntries: 120, maxAgeSeconds: 2 * 24 * 3600 } },
          },
        ],
      },
    }),
    {
      // The test page brings its own manifest (start_url ios-test.html, "Kite test"): drop the
      // one vite-plugin-pwa adds to every page.
      name: 'ios-test-manifest',
      enforce: 'post',
      generateBundle(_, bundle) {
        const page = bundle['ios-test.html']
        if (page?.type === 'asset') page.source = String(page.source).replace(/<link rel="manifest" href="[^"]*\/manifest\.webmanifest">/, '')
      },
    },
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
