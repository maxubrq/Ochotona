import { describe, expect, it } from 'vitest';
import { Throttle } from '../src/throttle';
import { AbortedError } from '../src/transport';
import { fakeTime } from './helpers';

/** Số request lớn nhất trong một cửa sổ 1 giây bất kỳ. */
function maxPerSecond(sent: number[]): number {
  let best = 0;
  let j = 0;
  for (let i = 0; i < sent.length; i++) {
    while (sent[i] - sent[j] >= 1000) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}

describe('Throttle', () => {
  it('200 request: không cửa sổ 1 giây nào vượt maxRps', async () => {
    for (const maxRps of [1, 5, 20]) {
      const t = fakeTime();
      const th = new Throttle(maxRps, 4, t);
      const workers = Array.from({ length: 4 }, async () => {
        for (let i = 0; i < 50; i++) {
          await th.acquire();
          t.advance(50);
          th.release(50);
        }
      });
      await Promise.all(workers);
      expect(th.sent).toHaveLength(200);
      expect(maxPerSecond(th.sent)).toBeLessThanOrEqual(maxRps);
    }
  });

  it('không quá concurrency request đang bay', async () => {
    const t = fakeTime();
    const th = new Throttle(20, 2, t);
    await th.acquire();
    await th.acquire();
    let third = false;
    const p = th.acquire().then(() => (third = true));
    await Promise.resolve();
    await Promise.resolve();
    expect(third).toBe(false);
    th.release(10);
    await p;
    expect(third).toBe(true);
  });

  it('phản hồi chậm 3 giây: tốc độ giảm một nửa', async () => {
    const t = fakeTime();
    const rates: number[] = [];
    const th = new Throttle(5, 2, { ...t, onRate: (r) => rates.push(r) });
    await th.acquire();
    th.release(3000);
    expect(th.rps).toBe(2.5);
    await th.acquire();
    th.release(3000);
    await th.acquire();
    th.release(3000);
    expect(th.rps).toBe(1);
    expect(rates).toEqual([2.5, 1.25, 1]);
  });

  it('chuỗi 10 phản hồi nhanh: tốc độ tăng 1, không vượt maxRps', async () => {
    const t = fakeTime();
    const th = new Throttle(5, 2, t);
    await th.acquire();
    th.release(3000);
    expect(th.rps).toBe(2.5);
    for (let i = 0; i < 9; i++) {
      await th.acquire();
      th.release(100);
    }
    expect(th.rps).toBe(2.5);
    await th.acquire();
    th.release(100);
    expect(th.rps).toBe(3.5);
    // Một phản hồi trung bình xoá chuỗi.
    for (let i = 0; i < 9; i++) {
      await th.acquire();
      th.release(100);
    }
    await th.acquire();
    th.release(1000);
    await th.acquire();
    th.release(100);
    expect(th.rps).toBe(3.5);
    for (let i = 0; i < 40; i++) {
      await th.acquire();
      th.release(100);
    }
    expect(th.rps).toBe(5);
  });

  it('Retry-After dừng mọi lượt và giảm tốc độ', async () => {
    const t = fakeTime();
    const pauses: number[] = [];
    const th = new Throttle(4, 2, { ...t, onPause: (ms) => pauses.push(ms) });
    await th.acquire();
    const at = t.nowMs();
    th.release(10, 60_000);
    expect(pauses).toEqual([30_000]);
    expect(th.rps).toBe(2);
    await th.acquire();
    expect(th.sent.at(-1)! - at).toBeGreaterThanOrEqual(30_000);
  });

  it('huỷ trong lúc chờ', async () => {
    const t = fakeTime();
    const th = new Throttle(1, 1, t);
    await th.acquire();
    const ac = new AbortController();
    const p = th.acquire(ac.signal);
    ac.abort();
    await expect(p).rejects.toBeInstanceOf(AbortedError);
    th.cancel();
  });

  it('setLimits hạ trần', async () => {
    const th = new Throttle(10, 2, fakeTime());
    th.setLimits(3, 1);
    expect(th.rps).toBe(3);
  });
});
