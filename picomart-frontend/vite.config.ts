import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {VitePWA} from 'vite-plugin-pwa'
import path from 'path'
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import {visualizer} from "rollup-plugin-visualizer";
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'buffer': path.resolve(__dirname, 'node_modules/buffer/index.js'),
    },
  },
  define: {
    global: 'window',
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  build: {
    target: "es2020",
  },
  plugins: [
    react(),
    nodePolyfills({
      overrides: {
        buffer: path.resolve(__dirname, 'node_modules/vite-plugin-node-polyfills/shims/buffer'),
      },
    }),
    visualizer({filename: "stats.html"}),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Picomart — Scan, Shop, Pay in a Flash',
        short_name: 'Picomart',
        description: 'Shop with QR codes and pay instantly with crypto or card. Powered by Picomart.',
        theme_color: '#000000',
        background_color: '#ffffff',
        icons: [
          {
            src: '/logo-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/logo-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Add runtime caching for better performance
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          }
        ]
      }
    })
  ],
})
