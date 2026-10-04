// Đơn vị và biểu diễn chung. Chuyển đổi đơn vị chỉ xảy ra ở ingest/.

/** Thời điểm, ISO 8601 UTC có mili-giây, đuôi `Z`: `2026-10-04T01:22:10.123Z`. */
export type Instant = string & { readonly __brand: 'Instant' };

/** Khoảng thời gian tính bằng giây, số thực ≥ 0. */
export type Seconds = number & { readonly __brand: 'Seconds' };

/** Tốc độ theo cửa sổ của management (mặc định 5 giây). */
export interface Rate {
  readonly perSecond: number;
  readonly windowSeconds: number;
}

export interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly pre?: string;
  readonly raw: string;
}

/** Giá trị argument hoặc policy, giữ nguyên kiểu JSON. */
export type ArgValue =
  | string
  | number
  | boolean
  | null
  | readonly ArgValue[]
  | { readonly [k: string]: ArgValue };

export type ArgMap = Readonly<Record<string, ArgValue>>;

/** Kết quả có lỗi; API công khai không ném ngoại lệ với dữ liệu xấu. */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): { ok: true; value: T } => ({
  ok: true,
  value,
});
export const err = <E>(error: E): { ok: false; error: E } => ({
  ok: false,
  error,
});

const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Đổi mili-giây Unix thành `Instant`.
 * @example instantFromMs(0) // '1970-01-01T00:00:00.000Z'
 */
export function instantFromMs(ms: number): Instant {
  return new Date(ms).toISOString() as Instant;
}

/** Chuẩn hoá chuỗi ngày giờ bất kỳ về `Instant`; không parse được thì `null`. */
export function parseInstant(s: string): Instant | null {
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? instantFromMs(ms) : null;
}

export function isInstant(s: unknown): s is Instant {
  return typeof s === 'string' && INSTANT_RE.test(s);
}

export function instantMs(i: Instant): number {
  return Date.parse(i);
}

/** `Instant` muộn nhất; chuỗi cùng định dạng nên so theo code unit là đủ. */
export function latestInstant(xs: readonly Instant[]): Instant | undefined {
  let best: Instant | undefined;
  for (const x of xs) if (best === undefined || x > best) best = x;
  return best;
}

const VERSION_RE = /^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/;

/**
 * Parse phiên bản RabbitMQ; thiếu patch thì là 0; không khớp thì `null`.
 * @example parseVersion('4.3.0-rc.1') // { major: 4, minor: 3, patch: 0, pre: 'rc.1', raw: '4.3.0-rc.1' }
 */
export function parseVersion(s: string): Version | null {
  const m = VERSION_RE.exec(s);
  if (!m) return null;
  const v = {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: m[3] === undefined ? 0 : Number(m[3]),
    raw: s,
  };
  return m[4] === undefined ? v : { ...v, pre: m[4] };
}

/**
 * So sánh theo semver: bản có `pre` nhỏ hơn bản phát hành cùng số.
 * @example compareVersion(parseVersion('4.0.0-rc.1')!, parseVersion('4.0')!) // -1
 */
export function compareVersion(a: Version, b: Version): -1 | 0 | 1 {
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  if (a.pre === b.pre) return 0;
  if (a.pre === undefined) return 1;
  if (b.pre === undefined) return -1;
  const pa = a.pre.split('.');
  const pb = b.pre.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]) ? Number(pa[i]) : NaN;
    const nb = /^\d+$/.test(pb[i]) ? Number(pb[i]) : NaN;
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na < nb ? -1 : 1;
    } else if (!Number.isNaN(na)) return -1;
    else if (!Number.isNaN(nb)) return 1;
    else if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** Số đếm hợp lệ: nguyên, ≥ 0, ≤ `Number.MAX_SAFE_INTEGER`. */
export function isCount(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

export function isArgValue(v: unknown): v is ArgValue {
  if (v === null) return true;
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(v);
    case 'object':
      if (Array.isArray(v)) return v.every(isArgValue);
      if (Object.getPrototypeOf(v) !== Object.prototype) return false;
      return Object.values(v as object).every(isArgValue);
    default:
      return false;
  }
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype ||
      Object.getPrototypeOf(v) === null)
  );
}
