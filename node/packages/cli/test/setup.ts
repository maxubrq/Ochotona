import { afterAll, expect } from 'vitest';
import { PASSWORD, USER } from './io';
import { SECRET_NEEDLES, drainOutput } from './secrets';

// Không có mật khẩu, không có base64 của `user:pass` trong bất cứ thứ gì CLI in ra.
afterAll(() => {
  const leaks = drainOutput().filter((s) =>
    SECRET_NEEDLES(PASSWORD, USER).some((n) => s.includes(n)),
  );
  expect(leaks).toEqual([]);
});
