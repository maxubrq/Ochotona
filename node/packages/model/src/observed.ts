import { type Instant, latestInstant } from './units';

export type SourceId = 'http.list' | 'http.stats' | 'prometheus' | 'derived';

export interface Provenance {
  readonly source: SourceId;
  /** 'http:/api/queues#messages_ready', 'prom:<metric>', 'derived:effective' */
  readonly path: string;
  /** Lúc trang chứa giá trị được trả về. */
  readonly observedAt: Instant;
}

export interface Known<T> {
  readonly state: 'known';
  readonly value: T;
  readonly prov: Provenance;
}

export interface Unknown {
  readonly state: 'unknown';
  readonly reason: UnknownReason;
  readonly source: SourceId;
  readonly path: string;
}

/** Kiểu duy nhất cho mọi giá trị đọc hoặc suy ra từ broker. */
export type Observed<T> = Known<T> | Unknown;

export type UnknownReason =
  | { readonly kind: 'source_unavailable' }
  | { readonly kind: 'forbidden'; readonly status: 401 | 403 }
  | { readonly kind: 'endpoint_missing'; readonly status: 404 }
  | { readonly kind: 'field_absent' }
  | { readonly kind: 'model_mismatch'; readonly detail: string }
  | { readonly kind: 'tie'; readonly policies: readonly string[] }
  | {
      readonly kind: 'regex_unsupported';
      readonly policy: string;
      readonly pattern: string;
    }
  | { readonly kind: 'inconsistent_read'; readonly detail: string }
  | {
      readonly kind: 'depends_on';
      readonly path: string;
      readonly reason: UnknownReason;
    }
  | { readonly kind: 'error'; readonly message: string };

type ValuesOf<T extends readonly Observed<unknown>[]> = {
  [K in keyof T]: T[K] extends Observed<infer V> ? V : never;
};

/** Tạo giá trị đã biết. */
export function known<T>(value: T, prov: Provenance): Known<T> {
  return { state: 'known', value, prov };
}

/** Tạo giá trị chưa biết, mang lý do có cấu trúc. */
export function unknown(
  reason: UnknownReason,
  source: SourceId,
  path: string,
): Unknown {
  return { state: 'unknown', reason, source, path };
}

export function isKnown<T>(o: Observed<T>): o is Known<T> {
  return o.state === 'known';
}

/** Biến đổi giá trị, giữ `prov`; `unknown` đi qua nguyên vẹn. */
export function map<T, U>(o: Observed<T>, f: (v: T) => U): Observed<U> {
  return o.state === 'known' ? known(f(o.value), o.prov) : o;
}

function dependsOn(u: Unknown, source: SourceId, path: string): Unknown {
  return unknown(
    { kind: 'depends_on', path: u.path, reason: u.reason },
    source,
    path,
  );
}

/**
 * Gộp nhiều giá trị. `unknown` đầu tiên theo thứ tự tham số thắng, bọc bằng
 * `depends_on`. Kết quả `known` có `source = 'derived'` và `observedAt` muộn nhất.
 * @example all([known(1, p), known('a', p)]) // known([1, 'a'])
 */
export function all<const T extends readonly Observed<unknown>[]>(
  os: T,
  path = 'derived:all',
): Observed<ValuesOf<T>> {
  const values: unknown[] = [];
  const times: Instant[] = [];
  for (const o of os) {
    if (o.state === 'unknown') return dependsOn(o, 'derived', path);
    values.push(o.value);
    times.push(o.prov.observedAt);
  }
  const observedAt = latestInstant(times);
  if (observedAt === undefined) {
    return unknown(
      { kind: 'error', message: 'all() of nothing' },
      'derived',
      path,
    );
  }
  return known(values as ValuesOf<T>, { source: 'derived', path, observedAt });
}

/** Giá trị `known` đầu tiên; không có thì `unknown` của tham số đầu. */
export function firstKnown<T>(...os: Observed<T>[]): Observed<T> {
  for (const o of os) if (o.state === 'known') return o;
  return os[0];
}

/**
 * `all` rồi `f`; `prov.source = 'derived'`, `observedAt` muộn nhất của các đầu vào.
 * @example derive([a, b], ([x, y]) => x + y, 'derived:sum')
 */
export function derive<const T extends readonly Observed<unknown>[], U>(
  inputs: T,
  f: (values: ValuesOf<T>) => U,
  path: string,
): Observed<U> {
  const a = all(inputs, path);
  return a.state === 'known' ? known(f(a.value), a.prov) : a;
}

/** Bóc hết `depends_on` để lấy nguyên nhân thật. */
export function rootReason(u: Unknown | UnknownReason): UnknownReason {
  let r: UnknownReason = 'state' in u ? u.reason : u;
  while (r.kind === 'depends_on') r = r.reason;
  return r;
}

/** Chỉ để in. Lint cấm gọi hàm này trong `@ochotona/rules`. */
export function displayOr<T>(o: Observed<T>, text: string): string {
  if (o.state === 'unknown') return text;
  return typeof o.value === 'string' ? o.value : JSON.stringify(o.value);
}
