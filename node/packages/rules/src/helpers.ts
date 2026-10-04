// Hàm dùng chung cho các luật: dung sai, bằng chứng, giá trị hiệu lực, ngưỡng.
import type {
  ArgValue,
  Effective,
  EffectiveCheck,
  EffectiveEntry,
  ObjectRef,
  Provenance,
  Severity,
} from '@ochotona/model';
import { type RuleCode, type Tolerance, rule } from '@ochotona/spec';
import type { FieldPath } from './paths';
import type { Ctx, Evidence, Verdict } from './types';

export const LOOSE: Verdict = { result: 'pass', note: 'loose_by_declaration' };
export const PASS: Verdict = { result: 'pass' };

export const toleranceOf = (ctx: Ctx, ref: ObjectRef): Tolerance =>
  ctx.flows.toleranceOf(ref);

/** Mức theo dung sai cho luật `strict`: S1, `undeclared`: S3. */
export const byTolerance = (t: Tolerance): Severity =>
  t === 'strict' ? 'S1' : 'S3';

/** Bằng chứng đọc thẳng từ API, Prometheus. */
export function observed(
  path: FieldPath,
  prov: Provenance | undefined,
  value: unknown,
): Evidence {
  return { kind: 'observed', path, value, ...(prov ? { prov } : {}) };
}

export function inferred(
  path: FieldPath,
  value: unknown,
  note?: string,
): Evidence {
  return { kind: 'inferred', path, value, ...(note ? { note } : {}) };
}

/**
 * Một khoá của `Effective` thành bằng chứng, theo bảng "Khi nào bằng chứng là
 * observed": lớp `argument` luôn observed; lớp policy chỉ observed khi broker
 * đã xác nhận (`verified`); mặc định của Ocho luôn inferred. Khoá vắng trong
 * `Effective` đã `verified` là observed.
 */
export function effectiveEvidence(
  path: FieldPath,
  eff: Effective,
  check: EffectiveCheck,
  key: string,
): Evidence {
  const e = eff[key];
  const note = `key:${key}`;
  if (!e)
    return check === 'verified'
      ? { kind: 'observed', path, value: null, note }
      : { kind: 'inferred', path, value: null, note };
  const isObserved =
    e.layer === 'argument' ||
    ((e.layer === 'policy' || e.layer === 'operator_policy') &&
      check === 'verified');
  return { kind: isObserved ? 'observed' : 'inferred', path, value: e, note };
}

/** Tên lớp cho văn bản: `policy ha-all`, `argument`, `default`. */
export function layerLabel(e: EffectiveEntry | undefined): string {
  if (!e) return 'none';
  if (e.by !== null) return `${e.layer.replace('_', ' ')} ${e.by}`;
  return e.layer === 'builtin_default' || e.layer === 'vhost_default'
    ? 'default'
    : e.layer;
}

export const num = (v: ArgValue | undefined): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

export const str = (v: ArgValue | undefined): string =>
  v === undefined ? 'none' : typeof v === 'string' ? v : JSON.stringify(v);

/** Ngưỡng số trong `rules.json`; thiếu là lỗi dữ liệu. */
export function threshold(code: RuleCode, name: string): number {
  const v = rule(code).thresholds?.[name];
  if (v === undefined)
    throw new Error(`${code}: threshold ${name} is missing in rules.json`);
  return v;
}

export const round = (n: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export const isAmqp091 = (protocol: string): boolean =>
  /^AMQP 0-9-1/.test(protocol);
