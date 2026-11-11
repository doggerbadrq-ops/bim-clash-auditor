import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  optimizeDeps: {
    exclude: ['web-ifc']
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 3000
  }
});
