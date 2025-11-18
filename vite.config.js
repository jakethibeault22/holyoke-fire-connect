import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2015',
    outDir: 'dist',
    modulePreload: {
      polyfill: true
    },
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  esbuild: {
    target: 'es2015'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2015'
    }
  }
});