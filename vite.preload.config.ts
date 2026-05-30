import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'electron/preload.ts'),
      formats: ['cjs'],
      fileName: () => 'preload.cjs',
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      external: ['electron'],
    },
    sourcemap: process.env.NODE_ENV === 'development',
    minify: process.env.NODE_ENV !== 'development',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
