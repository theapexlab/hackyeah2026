import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: './',
  optimizeDeps: {
    exclude: ['@pomoc/core'],
  },
  build: {
    target: 'esnext',
  },
});
