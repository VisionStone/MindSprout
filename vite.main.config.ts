import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'electron/main.ts'),
      formats: ['cjs'],
      fileName: () => 'main.cjs',
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      external: (id: string) => {
        // Externalize all node_modules and built-in modules
        if (id.startsWith('node:')) return true;
        if (!id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0')) {
          return true;
        }
        return false;
      },
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
