import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  optimizeDeps: {
    include: ['@picomart/config'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
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
  plugins: [
    react(),
  ],
})
