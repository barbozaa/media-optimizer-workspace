import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['projects/media-optimizer/src/test-setup.ts'],
    include: ['projects/media-optimizer/src/**/*.spec.ts'],
  },
});
