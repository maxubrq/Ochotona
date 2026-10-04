import { defineConfig } from 'vitest/config';

// Stryker chạy mọi test trừ hiệu năng (đo giờ) và test trên broker sống.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/perf.test.ts', 'test/live.test.ts'],
  },
});
