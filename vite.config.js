import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2015',
    outDir: 'dist',
    polyfillModulePreload: true,
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  esbuild: {
    target: 'es2015',
    jsxInject: `import React from 'react'`
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2015'
    }
  }
});