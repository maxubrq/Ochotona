// Hook quét bí mật cho cả bộ test: stdout, stderr và file đã ghi của mọi lần
// chạy đi qua `trackOutput`; `test/setup.ts` quét chúng sau mỗi file test.

const sink: string[] = [];

export const SECRET_NEEDLES = (password: string, user: string): string[] => [
  password,
  Buffer.from(`${user}:${password}`).toString('base64'),
];

export function trackOutput(...chunks: string[]): void {
  sink.push(...chunks);
}

export function drainOutput(): string[] {
  return sink.splice(0);
}
