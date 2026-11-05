import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: [
      ...(process.env.CII_LEAFLET_MODULE
        ? [{ find: /^leaflet$/, replacement: process.env.CII_LEAFLET_MODULE }]
        : []),
      ...(process.env.CII_LEAFLET_CSS
        ? [
            {
              find: /^leaflet\/dist\/leaflet\.css$/,
              replacement: process.env.CII_LEAFLET_CSS
            }
          ]
        : [])
    ]
  },
  plugins: [svelte({ configFile: false })],
  optimizeDeps: {
    // Workers are loaded after the page: prebundle sql.js before measurements
    // start so discovering its CommonJS entry cannot trigger a page reload.
    include: ['sql.js'],
    exclude: ['@sqlite.org/sqlite-wasm']
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    fs: {
      allow: [
        fileURLToPath(new URL('../../../../..', import.meta.url)),
        ...(process.env.CII_LEAFLET_MODULE
          ? [
              fileURLToPath(
                new URL('.', `file://${process.env.CII_LEAFLET_MODULE}`)
              )
            ]
          : [])
      ]
    }
  }
});
