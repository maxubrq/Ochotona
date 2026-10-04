import type { ReadSource, SourceState } from '../actual';
import {
  type Observed,
  type SourceId,
  type UnknownReason,
  known,
  unknown,
} from '../observed';
import {
  type ArgMap,
  type Instant,
  type Rate,
  isArgValue,
  isCount,
  isPlainObject,
} from '../units';

/** Đầu vào thô do `@ochotona/broker` thu về. */
export type RawResult<T = unknown> =
  | { status: 'ok'; pages: readonly { body: T; observedAt: Instant }[] }
  | { status: 'http_error'; code: number; note?: HttpErrorNote }
  | { status: 'network_error'; message: string; kind?: NetworkErrorKind }
  | { status: 'not_attempted'; reason?: NotAttemptedReason };

export type NetworkErrorKind = 'dns' | 'connect' | 'timeout' | 'reset' | 'tls';
/** `code` của `http_error` có `note` là mã HTTP của response cuối cùng nhận được. */
export type HttpErrorNote =
  'parse_error' | 'body_too_large' | 'pagination_runaway';
/** `capability`: phiên bản broker không có endpoint; `off`: người dùng tắt nguồn. */
export type NotAttemptedReason = 'capability' | 'off';

export interface RawResponses {
  overview: RawResult;
  whoami: RawResult;
  nodes: RawResult;
  vhosts: RawResult;
  featureFlags: RawResult;
  deprecatedUsed: RawResult;
  exchanges: RawResult;
  queues: RawResult;
  bindings: RawResult;
  policies: RawResult;
  operatorPolicies: RawResult;
  connections: RawResult;
  channels: RawResult;
  consumers: RawResult;
  /** Văn bản exposition. */
  prometheus: RawResult<string>;
  /** Overview đọc lại lúc cuối, để phát hiện page_shift. */
  totalsAtEnd: RawResult;
}

/** Cửa sổ mặc định của management. */
export const RATE_WINDOW_SECONDS = 5;

/** Lý do `unknown` cho cả một endpoint không trả 200. */
export function reasonOf(
  raw: Exclude<RawResult, { status: 'ok' }>,
): UnknownReason {
  switch (raw.status) {
    case 'http_error':
      if (raw.code === 401 || raw.code === 403)
        return { kind: 'forbidden', status: raw.code };
      if (raw.code === 404) return { kind: 'endpoint_missing', status: 404 };
      return {
        kind: 'error',
        message: raw.note
          ? `${raw.note} (HTTP ${raw.code})`
          : `HTTP ${raw.code}`,
      };
    case 'network_error':
      return { kind: 'error', message: raw.message };
    case 'not_attempted':
      if (raw.reason === 'capability')
        return { kind: 'endpoint_missing', status: 404 };
      return { kind: 'source_unavailable' };
  }
}

export function sourceStateOf(raw: RawResult<unknown>): SourceState {
  if (raw.status === 'ok') return 'ok';
  if (raw.status === 'not_attempted') return 'not_attempted';
  if (raw.status === 'http_error' && (raw.code === 401 || raw.code === 403))
    return 'forbidden';
  return 'unavailable';
}

/** Phần tử của một trang: mảng trần, hoặc `{ items: [...] }` khi gọi có phân trang. */
export function pageItems(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (isPlainObject(body) && Array.isArray(body.items)) return body.items;
  return null;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split('.')) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** Ngữ cảnh đọc trường của một phần tử trên một trang. */
export interface FieldCtx {
  readonly endpoint: string;
  readonly observedAt: Instant;
  readonly sources: Readonly<Record<ReadSource, SourceState>>;
}

/**
 * Đọc một trường. Trường vắng: thuộc `http.stats` mà thống kê không `ok` thì
 * `source_unavailable`, còn lại `field_absent`. Giá trị sai kiểu thì `error`.
 */
export function field<T>(
  item: unknown,
  apiPath: string,
  source: 'http.list' | 'http.stats',
  fc: FieldCtx,
  convert: (v: unknown) => T | undefined,
): Observed<T> {
  const path = `http:${fc.endpoint}#${apiPath}`;
  const raw = getPath(item, apiPath);
  if (raw === undefined) {
    const reason: UnknownReason =
      source === 'http.stats' && fc.sources['http.stats'] !== 'ok'
        ? { kind: 'source_unavailable' }
        : { kind: 'field_absent' };
    return unknown(reason, source, path);
  }
  const v = convert(raw);
  if (v === undefined) {
    return unknown(
      { kind: 'error', message: `unexpected value ${JSON.stringify(raw)}` },
      source,
      path,
    );
  }
  return known(v, { source, path, observedAt: fc.observedAt });
}

export function knownAt<T>(
  value: T,
  source: SourceId,
  path: string,
  observedAt: Instant,
): Observed<T> {
  return known(value, { source, path, observedAt });
}

// Bộ chuyển đổi: trả `undefined` khi sai kiểu.
export const asString = (v: unknown) => (typeof v === 'string' ? v : undefined);
export const asBool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
export const asCount = (v: unknown) => (isCount(v) ? v : undefined);
export const asRate = (v: unknown): Rate | undefined =>
  typeof v === 'number' && Number.isFinite(v)
    ? { perSecond: v, windowSeconds: RATE_WINDOW_SECONDS }
    : undefined;
export const asNullableName = (v: unknown) =>
  v === '' || v === null ? null : asString(v);
export const asArgMap = (v: unknown): ArgMap | undefined => {
  // Erlang trả proplist rỗng thành `[]`.
  if (Array.isArray(v) && v.length === 0) return {};
  return isPlainObject(v) && isArgValue(v) ? (v as ArgMap) : undefined;
};
