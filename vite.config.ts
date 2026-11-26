import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version takes over at once and the page reloads, so a phone never mixes an old page with new files
      // (which gave a blank screen right after a release).
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Endpoint Clients Construction',
        short_name: 'EndPoint',
        description: 'Track every payment on your house build.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#F5F5F5',
        background_color: '#F5F5F5',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Add payment', short_name: 'Add', url: '/add', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Add miscellaneous cost', short_name: 'Misc', url: '/add?misc=1', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,woff}'],
        navigateFallback: '/index.html',
        // Invite preview URLs are Vercel functions. Let them reach the network so link crawlers receive Open Graph HTML;
        // the app also has an /api/invite fallback route for phones still running an older service worker.
        navigateFallbackDenylist: [/^\/api\//],
        importScripts: ['/push-sw.js'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
})
