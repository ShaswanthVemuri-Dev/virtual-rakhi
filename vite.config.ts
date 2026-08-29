import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  // Three.js is intentionally isolated in the lazy wrist-renderer chunk.
  build: { chunkSizeWarningLimit: 750 },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
