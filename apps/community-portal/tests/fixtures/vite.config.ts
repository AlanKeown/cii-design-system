import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Isolated component harness, never included in the portal's routes or build.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [svelte({ configFile: false })],
  server: {
    fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] }
  }
});
