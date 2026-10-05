import type { RawResult } from '@ochotona/model';

export type RawFailure = Exclude<RawResult, { status: 'ok' }>;

/** Số lượt tối đa cho một request: 1 lượt đầu + 2 lần thử lại. */
export const MAX_ATTEMPTS = 3;
/** Trần chờ của `Retry-After`, cả khi thử lại lẫn khi throttle dừng. */
export const RETRY_AFTER_CAP_MS = 30_000;

export type IdentifyDiag = 'CX1' | 'CX2' | 'CX3' | 'CX9';

/** Một lỗi đã phân loại: có thử lại không, thành `RawResult` gì, và mã CX ở pha nhận diện. */
export interface Failure {
  readonly raw: RawFailure;
  /** `once`: chỉ thử lại một lần (HTTP 500). */
  readonly retry: 'no' | 'yes' | 'once';
  readonly diag: IdentifyDiag;
  /** Lý do ngắn cho sự kiện `retry` và dòng `--debug`. */
  readonly reason: string;
  readonly retryAfterMs?: number;
}

const TLS_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function errorCode(e: unknown): string | undefined {
  for (let cur = e, i = 0; cur && i < 4; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Phân loại lỗi mạng (không có response). `redact` thay origin trong thông báo
 * gốc của undici và Node trước khi thông báo rời gói.
 */
export function classifyError(
  error: unknown,
  redact: (s: string) => string,
): Failure {
  const code = errorCode(error) ?? 'UNKNOWN';
  // Lỗi gộp (AggregateError khi localhost từ chối cả IPv4 lẫn IPv6) có thông báo rỗng.
  const text = errorMessage(error);
  const message = redact(text ? `${code}: ${text}` : code);
  const net = (
    kind: 'dns' | 'connect' | 'timeout' | 'reset' | 'tls',
    retry: 'no' | 'yes',
  ): Failure => ({
    raw: { status: 'network_error', message, kind },
    retry,
    diag: kind === 'tls' ? 'CX2' : 'CX1',
    reason: code,
  });
  if (code === 'ENOTFOUND') return net('dns', 'no');
  if (code === 'EAI_AGAIN') return net('dns', 'yes');
  if (
    code === 'ECONNREFUSED' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH'
  )
    return net('connect', 'no');
  if (
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT' ||
    code === 'OCHO_DEADLINE'
  )
    return net('timeout', 'yes');
  if (
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'UND_ERR_SOCKET' ||
    code === 'UND_ERR_CLOSED'
  )
    return net('reset', 'yes');
  if (
    code.startsWith('CERT_') ||
    TLS_CODES.has(code) ||
    code.startsWith('ERR_TLS_') ||
    code.startsWith('ERR_SSL_')
  )
    return net('tls', 'no');
  if (code === 'UND_ERR_RES_EXCEEDED_MAX_SIZE') return bodyTooLarge(200);
  return net('connect', 'no');
}

/** Phân loại một response không phải 2xx. */
export function classifyStatus(
  status: number,
  headers: Readonly<Record<string, string | string[] | undefined>>,
  nowMs: number,
): Failure {
  const raw: RawFailure = { status: 'http_error', code: status };
  const reason = `HTTP ${status}`;
  if (status === 401) return { raw, retry: 'no', diag: 'CX3', reason };
  if (status === 403) return { raw, retry: 'no', diag: 'CX9', reason };
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    const h = headers['retry-after'];
    const retryAfterMs = parseRetryAfter(Array.isArray(h) ? h[0] : h, nowMs);
    return {
      raw,
      retry: 'yes',
      diag: 'CX1',
      reason,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    };
  }
  if (status === 500) return { raw, retry: 'once', diag: 'CX1', reason };
  return { raw, retry: 'no', diag: 'CX1', reason };
}

export function parseError(status: number): Failure {
  return {
    raw: { status: 'http_error', code: status, note: 'parse_error' },
    retry: 'no',
    diag: 'CX1',
    reason: 'parse_error',
  };
}

export function bodyTooLarge(status: number): Failure {
  return {
    raw: { status: 'http_error', code: status, note: 'body_too_large' },
    retry: 'no',
    diag: 'CX1',
    reason: 'body_too_large',
  };
}

/**
 * `Retry-After` dạng giây hoặc dạng ngày HTTP, tính ra mili-giây, trần 30 giây.
 * @example parseRetryAfter('2', 0) // 2000
 */
export function parseRetryAfter(
  value: string | undefined,
  nowMs: number,
): number | undefined {
  if (value === undefined) return undefined;
  const v = value.trim();
  let ms: number;
  if (/^\d+$/.test(v)) ms = Number(v) * 1000;
  else {
    const at = Date.parse(v);
    if (Number.isNaN(at)) return undefined;
    ms = at - nowMs;
  }
  return Math.min(RETRY_AFTER_CAP_MS, Math.max(0, ms));
}

/** Có thử lại sau lượt thứ `attempt` (bắt đầu từ 1) không. */
export function shouldRetry(f: Failure, attempt: number): boolean {
  if (f.retry === 'no') return false;
  if (f.retry === 'once') return attempt < 2;
  return attempt < MAX_ATTEMPTS;
}

/**
 * Thời gian chờ trước lần thử lại thứ `retry` (bắt đầu từ 1): jitter đầy đủ
 * trong `[0, min(2000, 500 × 2^retry)]`; `Retry-After` thay thế giá trị này.
 */
export function backoffMs(
  retry: number,
  random: () => number,
  retryAfterMs?: number,
): number {
  if (retryAfterMs !== undefined)
    return Math.min(RETRY_AFTER_CAP_MS, retryAfterMs);
  return Math.floor(random() * Math.min(2000, 500 * 2 ** retry));
}
