import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: '/mycraft/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'ES2020',
    outDir: 'dist',
  },
  worker: {
    format: 'es',
  },
});
