import { defineConfig } from 'vitest/config';

// Pure-TS modules only (particles, highlight, geometry, event cursor, regions). No component tests.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
