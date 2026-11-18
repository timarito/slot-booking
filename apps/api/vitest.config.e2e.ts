import { defineConfig } from 'vitest/config';

// E2E tests: boot the whole AppModule and send real HTTP requests to it.
// They need a running Postgres (`pnpm db:up`) and apps/api/.env, so they are slower
// and run separately from unit tests.
export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    // Each file boots its own app and DB pool; run files one by one so they
    // don't compete for the same database once tests start writing data (M2+).
    fileParallelism: false,
  },
});
