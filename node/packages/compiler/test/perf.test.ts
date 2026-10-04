import { describe, expect, it } from 'vitest';
import { Broker, scanBroker } from './fixtures';
import { nonInteractive, session } from './helpers';

/** 10.000 queue, 300 family ứng viên (mỗi family 3 thành viên), phần còn lại là luồng thường. */
function bigBroker(): Broker {
  const b = new Broker();
  for (let f = 0; f < 300; f++) {
    const ex = `svc${f}.jobs`;
    b.exchange(ex, 'direct');
    for (const m of ['alpha', 'beta', 'gamma'])
      b.bound(ex, `svc${f}_${m}_q`, `svc${f}_${m}`, {
        type: 'quorum',
        rate: f % 7,
      });
  }
  for (let e = 0; e < 100; e++) {
    const ex = `domain${e}`;
    b.exchange(ex, 'topic');
    for (let k = 0; k < 91; k++)
      b.bound(
        ex,
        `domain${e}.entity${k}.handler`,
        `domain${e}.event${k}.changed`,
        { rate: k },
      );
  }
  return b;
}

// Chạy riêng (`pnpm test` gọi sau bộ chính): chạy song song với property test
// 10.000 ca thì CPU bị tranh và số đo không còn là của compiler. Lấy trung vị
// ba lần để một lần GC hay máy bận không làm hỏng kết quả.
describe('hiệu năng', () => {
  it('import không tương tác: 10.000 queue, 300 family ứng viên, ≤ 2 giây cho suy luận, ghi và tự kiểm', () => {
    // Khởi động JIT bằng một broker nhỏ: số đo là của 10.000 queue, không phải của lần nạp mã đầu.
    nonInteractive(scanBroker().actual());
    const actual = bigBroker().actual();
    expect(actual.queues.state === 'known' && actual.queues.value.length).toBe(
      10_000,
    );
    const runs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const s = session(actual);
      expect(s.questions()).toHaveLength(300);
      s.answerDefaults();
      const r = s.result();
      runs.push(performance.now() - start);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.summary.flows).toBe(10_000);
    }
    const median = [...runs].sort((a, b) => a - b)[1];
    console.log(`import 10.000 queue: ${runs.map(Math.round).join(', ')} ms`);
    expect(median).toBeLessThan(2000);
  }, 60_000);
});
