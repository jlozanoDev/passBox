import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // PBKDF2 with 600k iterations dominates each crypto test; give the
    // suite headroom over the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
