import { describe, expect, it } from 'vitest';
import type { ReadEvent } from '../src/events';
import { fetchWithRetry, type FetchCtx } from '../src/fetch';
import { Throttle } from '../src/throttle';
import type { GetOutcome, Transport } from '../src/transport';
import { fakeTime } from './helpers';

type Step =
  Partial<Extract<GetOutcome, { kind: 'response' }>> | { error: unknown };

/** Transport giả trả lần lượt các bước; mỗi bước tốn `latencyMs` trên đồng hồ giả. */
function scripted(steps: Step[], t: ReturnType<typeof fakeTime>) {
  const calls: number[] = [];
  const transport: Transport = {
    async get() {
      calls.push(t.nowMs());
      const s = steps.shift() ?? { status: 200 };
      t.advance(10);
      if ('error' in s) return { kind: 'error', error: s.error, latencyMs: 10 };
      return {
        kind: 'response',
        status: 200,
        headers: {},
        body: Buffer.from('{}'),
        bytes: 2,
        latencyMs: 10,
        ...s,
      };
    },
  };
  return { transport, calls };
}

function ctxOf(
  transport: Transport,
  t: ReturnType<typeof fakeTime>,
  random = () => 0.5,
) {
  const events: ReadEvent[] = [];
  const ctx: FetchCtx = {
    transport,
    throttle: new Throttle(20, 2, t),
    nowMs: t.nowMs,
    sleep: t.sleep,
    random,
    redact: (s) => s,
    emit: (e) => events.push(e),
    debug: () => {},
    counters: { requests: 0, retries: 0, bytes: 0 },
  };
  return { ctx, events };
}

const opts = { endpoint: 'queues', kind: 'json', maxBytes: 1000 } as const;

describe('fetchWithRetry', () => {
  it('503 hai lần rồi thành công: 3 lượt, chờ theo jitter', async () => {
    const t = fakeTime();
    const { transport, calls } = scripted(
      [{ status: 503 }, { status: 503 }, {}],
      t,
    );
    const { ctx, events } = ctxOf(transport, t);
    const r = await fetchWithRetry(ctx, 'http://h/api/queues', opts);
    expect(r).toEqual({ ok: true, status: 200, body: {} });
    expect(calls).toHaveLength(3);
    // random 0,5: lần 1 chờ 500, lần 2 chờ 1000.
    expect(t.slept).toEqual([500, 1000]);
    expect(events.filter((e) => e.type === 'retry')).toEqual([
      { type: 'retry', endpoint: 'queues', attempt: 2, reason: 'HTTP 503' },
      { type: 'retry', endpoint: 'queues', attempt: 3, reason: 'HTTP 503' },
    ]);
    expect(ctx.counters).toMatchObject({ requests: 3, retries: 2 });
  });

  it('hết lượt: trả lỗi của lượt cuối', async () => {
    const t = fakeTime();
    const { transport, calls } = scripted(
      [{ status: 502 }, { status: 502 }, { status: 504 }],
      t,
    );
    const { ctx } = ctxOf(transport, t);
    const r = await fetchWithRetry(ctx, 'http://h/api/queues', opts);
    expect(r).toMatchObject({
      ok: false,
      failure: { raw: { status: 'http_error', code: 504 } },
    });
    expect(calls).toHaveLength(3);
  });

  it('500 thử lại đúng một lần', async () => {
    const t = fakeTime();
    const { transport, calls } = scripted(
      [{ status: 500 }, { status: 500 }, {}],
      t,
    );
    const { ctx } = ctxOf(transport, t);
    const r = await fetchWithRetry(ctx, 'http://h/api/queues', opts);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('Retry-After dạng giây và dạng ngày HTTP thay jitter, trần 30 giây', async () => {
    const t = fakeTime();
    const start = t.nowMs();
    const date = new Date(start + 8000).toUTCString();
    const { transport, calls } = scripted(
      [
        { status: 429, headers: { 'retry-after': '2' } },
        { status: 429, headers: { 'retry-after': date } },
        {},
      ],
      t,
    );
    const { ctx, events } = ctxOf(transport, t);
    const r = await fetchWithRetry(ctx, 'http://h/api/queues', opts);
    expect(r.ok).toBe(true);
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(2000);
    // Dạng ngày: chờ tới đúng thời điểm đó.
    expect(calls[2] - start).toBeGreaterThanOrEqual(8000);
    expect(calls[2] - start).toBeLessThan(8100);
    expect(
      events.some((e) => e.type === 'warning' && e.code === 'retry_after'),
    ).toBe(false);

    const t2 = fakeTime();
    const s2 = scripted(
      [{ status: 503, headers: { 'retry-after': '600' } }, {}],
      t2,
    );
    const c2 = ctxOf(s2.transport, t2);
    await fetchWithRetry(c2.ctx, 'http://h/api/queues', opts);
    expect(s2.calls[1] - s2.calls[0]).toBeGreaterThanOrEqual(30_000);
    expect(s2.calls[1] - s2.calls[0]).toBeLessThan(31_000);
  });

  it('lỗi mạng: ECONNREFUSED không thử lại, ECONNRESET có', async () => {
    const t = fakeTime();
    const refused = Object.assign(new Error('x'), { code: 'ECONNREFUSED' });
    const a = scripted([{ error: refused }, {}], t);
    const r = await fetchWithRetry(
      ctxOf(a.transport, t).ctx,
      'http://h/api/x',
      opts,
    );
    expect(r).toMatchObject({
      ok: false,
      failure: { raw: { kind: 'connect' } },
    });
    expect(a.calls).toHaveLength(1);

    const reset = Object.assign(new Error('x'), { code: 'ECONNRESET' });
    const b = scripted([{ error: reset }, {}], t);
    expect(
      (await fetchWithRetry(ctxOf(b.transport, t).ctx, 'http://h/api/x', opts))
        .ok,
    ).toBe(true);
  });

  it('body không phải JSON và body quá lớn: không thử lại', async () => {
    const t = fakeTime();
    const a = scripted([{ body: Buffer.from('<html>') }], t);
    expect(
      await fetchWithRetry(ctxOf(a.transport, t).ctx, 'http://h/api/x', opts),
    ).toMatchObject({
      ok: false,
      failure: {
        raw: { status: 'http_error', code: 200, note: 'parse_error' },
      },
    });
    const b = scripted([{ body: null, bytes: 2000 }], t);
    expect(
      await fetchWithRetry(ctxOf(b.transport, t).ctx, 'http://h/api/x', opts),
    ).toMatchObject({
      ok: false,
      failure: { raw: { note: 'body_too_large' } },
    });
    expect(a.calls.length + b.calls.length).toBe(2);
  });

  it('huỷ giữa lúc chờ backoff: không gửi thêm request', async () => {
    const t = fakeTime();
    const ac = new AbortController();
    const { transport, calls } = scripted([{ status: 503 }, {}], t);
    const { ctx } = ctxOf(transport, t);
    const sleep = async (ms: number, signal?: AbortSignal) => {
      ac.abort();
      await t.sleep(ms, signal);
    };
    await expect(
      fetchWithRetry(
        { ...ctx, sleep, signal: ac.signal },
        'http://h/api/x',
        opts,
      ),
    ).rejects.toThrow('aborted');
    expect(calls).toHaveLength(1);
  });
});
