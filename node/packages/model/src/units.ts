// Đơn vị và biểu diễn chung. Chuyển đổi đơn vị chỉ xảy ra ở ingest/.
import type { ArgValue } from '@ochotona/spec';

/** Thời điểm, ISO 8601 UTC có mili-giây, đuôi `Z`: `2026-10-04T01:22:10.123Z`. */
export type Instant = string & { readonly __brand: 'Instant' };

/** Khoảng thời gian tính bằng giây, số thực ≥ 0. */
export type Seconds = number & { readonly __brand: 'Seconds' };

/** Tốc độ theo cửa sổ của management (mặc định 5 giây). */
export interface Rate {
  readonly perSecond: number;
  readonly windowSeconds: number;
}

// Kiểu và hàm phiên bản dùng chung nằm ở @ochotona/spec; model xuất lại để
// code gọi không đổi.
export type { ArgValue, Version } from '@ochotona/spec';
export { compareVersion, parseVersion } from '@ochotona/spec';

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
