import { defineConfig } from 'vitest/config';
import path from 'node:path';

const alias = {
  '@': path.resolve(__dirname, 'src'),
  '@shared': path.resolve(__dirname, 'supabase/functions/_shared'),
};

export default defineConfig({
  resolve: { alias },
  test: {
    // db files share one cluster and each clone their own database; run files sequentially.
    fileParallelism: false,
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          environment: 'node',
          // One embedded Postgres cluster per run; each file clones the template database.
          globalSetup: ['tests/db/global-setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
