import { defineConfig } from 'vitest/config';

// Stryker chạy test đơn vị của các file bị đột biến (exit, target, args,
// layout); test đầu-cuối đọc mock qua bộ giới hạn của broker nên quá chậm để
// chạy cho mỗi mutant. i18n.test.ts không có ở đây: nó đọc bộ kiểm của gói
// spec qua đường dẫn tương đối, không có trong sandbox của Stryker.
export default defineConfig({
  test: {
    include: [
      'test/args.test.ts',
      'test/exit.test.ts',
      'test/layout.test.ts',
      'test/target.test.ts',
      'test/contexts.test.ts',
    ],
    setupFiles: ['test/setup.ts'],
  },
});
