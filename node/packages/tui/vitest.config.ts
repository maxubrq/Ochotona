import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    // Test đầu-cuối đọc mock qua bộ giới hạn thích nghi của broker (5 req/s).
    testTimeout: 30_000,
  },
});
