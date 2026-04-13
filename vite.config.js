import { defineConfig } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        map: resolve(__dirname, 'map.html'),
      },
    },
  },
  resolve: {
    alias: {
      '/pretext.js': '/node_modules/@chenglou/pretext/dist/layout.js',
    },
  },
})
