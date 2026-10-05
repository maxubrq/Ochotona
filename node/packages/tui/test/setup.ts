// React báo lỗi (vòng lặp setState, key trùng…) qua console.error rồi chạy
// tiếp, nên test vẫn có thể xanh. Ở đây mọi console.error trong lúc test làm
// test đó fail.

import { afterEach, beforeEach, expect, vi } from 'vitest';

let errors: string[] = [];

beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  vi.mocked(console.error).mockRestore();
  expect(errors).toEqual([]);
});
