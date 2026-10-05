// Ngân sách của spec trên broker giả 10.000 queue, ở tốc độ mặc định 5 request
// mỗi giây: `doctor` ≤ 3 phút, `explain` một queue ≤ 2 giây, dòng xác nhận
// ≤ 100 ms sau khi `run` bắt đầu. Khởi động của tệp thực thi đo ở bin.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MockServer } from '../../broker/tools/mock-mgmt.ts';
import { startBigBroker } from './big-broker';
import { PASSWORD, USER, expectSingleJson, fakeIO, tempDir } from './helpers';
import { run } from '../src/run';
import { expectValid } from './schemas';

const env = { OCHO_PASSWORD: PASSWORD };

describe('ngân sách trên broker 10.000 queue', () => {
  let mock: MockServer;
  beforeAll(async () => {
    mock = await startBigBroker({ queues: 10_000, exchanges: 300, vhosts: 3 });
  });
  afterAll(() => mock.close());
  const flags = () => ['--url', mock.url, '--user', USER, '--no-prometheus'];

  it('doctor --json ở 5 request/giây: dưới 3 phút, đọc đủ 10.000 queue', async () => {
    const dir = await tempDir();
    const io = fakeIO({ env, cwd: dir }, dir);
    const t0 = performance.now();
    const code = await run(['doctor', '--json', ...flags()], io);
    const ms = performance.now() - t0;
    const doc = expectSingleJson(io.out.join(''));
    expectValid(doc);
    expect([0, 1, 2]).toContain(code);
    // 10.000 queue, trang 500: đủ 20 trang.
    const pages = mock.requests
      .filter((q) => q.path === '/api/queues')
      .map((q) => Number(q.query.get('page')));
    expect(Math.max(...pages)).toBe(20);
    expect(ms).toBeLessThan(180_000);
    console.log(
      `doctor: ${Math.round(ms)} ms, ${mock.requests.length} requests`,
    );
  }, 200_000);

  it('explain queue: dưới 2 giây, 6 request', async () => {
    const before = mock.requests.length;
    const dir = await tempDir();
    const io = fakeIO({ env, cwd: dir }, dir);
    const t0 = performance.now();
    const code = await run(
      ['explain', 'queue', 'q-04242', '--vhost', 'v0', ...flags()],
      io,
    );
    const ms = performance.now() - t0;
    expect(code).toBe(0);
    expect(io.out.join('').split('\n')[0]).toBe(
      'queue q-04242 · classic · vhost v0',
    );
    expect(mock.requests.length - before).toBe(6);
    expect(ms).toBeLessThan(2_000);
    console.log(`explain: ${Math.round(ms)} ms`);
  });

  it('dòng xác nhận in trước mọi request, dưới 100 ms', async () => {
    const dir = await tempDir();
    const before = mock.requests.length;
    let at = -1;
    let requestsThen = -1;
    const io = fakeIO({ env, cwd: dir, tty: { stderr: true } }, dir);
    const t0 = performance.now();
    const write = io.stderr.write;
    io.stderr.write = (s: string) => {
      if (at < 0 && s.includes('Connecting to')) {
        at = performance.now() - t0;
        requestsThen = mock.requests.length - before;
      }
      write(s);
    };
    const ac = new AbortController();
    // Chỉ cần tới dòng xác nhận: dừng đọc ngay sau đó.
    const p = run(['doctor', ...flags()], { ...io, signal: ac.signal });
    while (at < 0) await new Promise((r) => setTimeout(r, 5));
    ac.abort();
    await p;
    expect(requestsThen).toBe(0);
    expect(at).toBeLessThan(100);
  });
});
