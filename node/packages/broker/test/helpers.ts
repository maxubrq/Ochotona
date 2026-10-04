import type { Instant } from '@ochotona/model';
import { AbortedError } from '../src/transport';

/** Đồng hồ giả: `sleep` đẩy đồng hồ tới đúng thời điểm thức dậy, không chờ thật. */
export function fakeTime(startMs = Date.parse('2026-10-04T00:00:00Z')) {
  let now = startMs;
  const slept: number[] = [];
  return {
    nowMs: () => now,
    clock: () => new Date(now).toISOString() as Instant,
    advance: (ms: number) => {
      now += ms;
    },
    slept,
    sleep: async (ms: number, signal?: AbortSignal) => {
      if (signal?.aborted) throw new AbortedError();
      slept.push(ms);
      now += ms;
      await Promise.resolve();
      if (signal?.aborted) throw new AbortedError();
    },
  };
}
