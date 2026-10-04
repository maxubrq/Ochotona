import { defineConfig } from 'vitest/config';

// Stryker chạy mọi test trừ hiệu năng (đo giờ); property test vòng tròn hạ
// còn 200 ca qua OCHO_PROPERTY_RUNS. Test chéo thư viện của quy tắc trích dẫn
// giữ nguyên số ca vì đó là test giết mutant của scalar.ts.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/perf.test.ts'],
    env: { OCHO_PROPERTY_RUNS: '200' },
  },
});
