import { defineConfig } from 'vitest/config';

// Unit tests: fast, no database, no network. Live next to the code as *.spec.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // The Reflect metadata polyfill is loaded implicitly by @nestjs/core at runtime.
    // Unit tests that don't import Nest (e.g. env validation via class-transformer)
    // still rely on it, so load it once per test file, exactly like the app does.
    setupFiles: ['reflect-metadata'],
  },
});
