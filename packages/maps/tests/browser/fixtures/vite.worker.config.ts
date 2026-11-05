import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: fileURLToPath(new URL('./generated', import.meta.url)),
    lib: {
      entry: fileURLToPath(new URL('./projection-worker.ts', import.meta.url)),
      name: 'CiiProjectionSpike',
      formats: ['iife'],
      fileName: () => 'projection-worker.js'
    }
  }
});
