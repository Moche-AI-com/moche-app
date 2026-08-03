import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'test/**/*.test.ts', 'trigger/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Match the tsconfig "@/*" path alias.
      '@': path.resolve(__dirname, '.'),
      // `server-only` throws outside the React Server bundler; stub it for unit tests.
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
});
