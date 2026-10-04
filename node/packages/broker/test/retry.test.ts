import { describe, expect, it } from 'vitest';
import {
  backoffMs,
  classifyError,
  classifyStatus,
  parseRetryAfter,
  shouldRetry,
} from '../src/retry';

const err = (code: string, message = 'boom') =>
  Object.assign(new Error(message), { code });
const id = (s: string) => s;

describe('classifyError: mỗi dòng của bảng lỗi', () => {
  const cases: [string, string, 'no' | 'yes', string][] = [
    ['ENOTFOUND', 'dns', 'no', 'CX1'],
    ['EAI_AGAIN', 'dns', 'yes', 'CX1'],
    ['ECONNREFUSED', 'connect', 'no', 'CX1'],
    ['UND_ERR_CONNECT_TIMEOUT', 'timeout', 'yes', 'CX1'],
    ['ECONNRESET', 'reset', 'yes', 'CX1'],
    ['EPIPE', 'reset', 'yes', 'CX1'],
    ['UND_ERR_SOCKET', 'reset', 'yes', 'CX1'],
    ['UND_ERR_HEADERS_TIMEOUT', 'timeout', 'yes', 'CX1'],
    ['UND_ERR_BODY_TIMEOUT', 'timeout', 'yes', 'CX1'],
    ['CERT_HAS_EXPIRED', 'tls', 'no', 'CX2'],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'tls', 'no', 'CX2'],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'tls', 'no', 'CX2'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls', 'no', 'CX2'],
  ];
  for (const [code, kind, retry, diag] of cases) {
    it(code, () => {
      const f = classifyError(err(code), id);
      expect(f.raw).toMatchObject({ status: 'network_error', kind });
      expect(f.retry).toBe(retry);
      expect(f.diag).toBe(diag);
    });
  }
  it('đọc mã trong cause', () => {
    const e = new Error('fetch failed', { cause: err('ECONNREFUSED') });
    expect(classifyError(e, id).raw).toMatchObject({ kind: 'connect' });
  });
  it('body vượt trần của undici', () => {
    expect(classifyError(err('UND_ERR_RES_EXCEEDED_MAX_SIZE'), id).raw).toEqual(
      {
        status: 'http_error',
        code: 200,
        note: 'body_too_large',
      },
    );
  });
  it('che origin trong thông báo', () => {
    const f = classifyError(
      err('ECONNREFUSED', 'connect ECONNREFUSED http://h:1'),
      (s) => s.replace('http://h:1', '<prod>'),
    );
    expect(f.raw).toMatchObject({
      message: 'ECONNREFUSED: connect ECONNREFUSED <prod>',
    });
  });
});

describe('classifyStatus', () => {
  const cases: [number, 'no' | 'yes' | 'once', string][] = [
    [401, 'no', 'CX3'],
    [403, 'no', 'CX9'],
    [404, 'no', 'CX1'],
    [429, 'yes', 'CX1'],
    [502, 'yes', 'CX1'],
    [503, 'yes', 'CX1'],
    [504, 'yes', 'CX1'],
    [500, 'once', 'CX1'],
    [400, 'no', 'CX1'],
    [418, 'no', 'CX1'],
  ];
  for (const [status, retry, diag] of cases) {
    it(String(status), () => {
      const f = classifyStatus(status, {}, 0);
      expect(f.raw).toEqual({ status: 'http_error', code: status });
      expect(f.retry).toBe(retry);
      expect(f.diag).toBe(diag);
    });
  }
  it('Retry-After', () => {
    expect(classifyStatus(429, { 'retry-after': '3' }, 0).retryAfterMs).toBe(
      3000,
    );
    expect(classifyStatus(503, { 'retry-after': ['1'] }, 0).retryAfterMs).toBe(
      1000,
    );
  });
});

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-10-04T00:00:00Z');
  it('dạng giây', () => {
    expect(parseRetryAfter('5', now)).toBe(5000);
    expect(parseRetryAfter(' 0 ', now)).toBe(0);
  });
  it('dạng ngày HTTP', () => {
    expect(parseRetryAfter('Sun, 04 Oct 2026 00:00:07 GMT', now)).toBe(7000);
    expect(parseRetryAfter('Sat, 03 Oct 2026 00:00:00 GMT', now)).toBe(0);
  });
  it('trần 30 giây', () => {
    expect(parseRetryAfter('120', now)).toBe(30_000);
    expect(parseRetryAfter('Mon, 05 Oct 2026 00:00:00 GMT', now)).toBe(30_000);
  });
  it('rác', () => {
    expect(parseRetryAfter('soon', now)).toBeUndefined();
    expect(parseRetryAfter(undefined, now)).toBeUndefined();
  });
});

describe('thử lại', () => {
  it('tối đa 3 lượt, 500 chỉ 2 lượt', () => {
    const yes = classifyStatus(503, {}, 0);
    expect([1, 2, 3].map((a) => shouldRetry(yes, a))).toEqual([
      true,
      true,
      false,
    ]);
    const once = classifyStatus(500, {}, 0);
    expect([1, 2].map((a) => shouldRetry(once, a))).toEqual([true, false]);
    expect(shouldRetry(classifyStatus(401, {}, 0), 1)).toBe(false);
  });
  it('jitter đầy đủ, trần 2 giây', () => {
    expect(backoffMs(1, () => 0)).toBe(0);
    expect(backoffMs(1, () => 0.999999)).toBe(999);
    expect(backoffMs(2, () => 0.5)).toBe(1000);
    expect(backoffMs(5, () => 0.999999)).toBe(1999);
  });
  it('Retry-After thay jitter, trần 30 giây', () => {
    expect(backoffMs(1, () => 0.9, 4000)).toBe(4000);
    expect(backoffMs(1, () => 0.9, 90_000)).toBe(30_000);
  });
});
