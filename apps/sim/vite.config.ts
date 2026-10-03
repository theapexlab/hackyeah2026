import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: { exclude: ['@pomoc/core'] },
  build: {
    target: 'esnext',
    // Single offline bundle (base './'): splitting adds requests, not speed. ~685 kB min today.
    chunkSizeWarningLimit: 1000,
  },
});
