import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'supabase/functions/_shared'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The db suite boots an embedded Postgres once per file; give it room.
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
