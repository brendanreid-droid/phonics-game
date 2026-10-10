import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/game/src/**/*.test.ts'],
    environment: 'node',
  },
});
