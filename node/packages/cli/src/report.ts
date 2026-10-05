// Kết quả của một lần `doctor`, dùng chung cho renderer văn bản và JSON.

import type { Actual } from '@ochotona/model';
import type {
  Action,
  AnyRuleDef,
  InternalIssue,
  RuleResult,
} from '@ochotona/rules';
import { type Severity, blindSpots, rule } from '@ochotona/spec';
import { fmtInstant } from './render/layout';

export interface DoctorOutcome {
  readonly actual: Actual;
  readonly results: readonly RuleResult[];
  readonly internal: readonly InternalIssue[];
  readonly actions: readonly Action[];
  readonly uncheckedS1: number;
  readonly rules: readonly AnyRuleDef[];
  readonly exitCode: 0 | 1 | 2 | 5;
  readonly failOn: Severity;
  readonly filters: {
    readonly vhosts: readonly string[];
    readonly flow: string | null;
    readonly targetVersion: string | null;
  };
  readonly startedAt: string;
  readonly durationMs: number;
  /** Tên hiện ở dòng đầu (context, hoặc host). */
  readonly name: string;
  /** Thời gian tới khi nhận diện xong; `null` khi đọc từ ảnh chụp. */
  readonly connectMs: number | null;
}

export interface Summary {
  readonly rules: number;
  readonly fail: number;
  readonly pass: number;
  readonly not_checked: number;
  readonly not_applicable: number;
  readonly waived: number;
}

/** Đếm theo kết quả; `fail` có miễn trừ còn hiệu lực đếm vào `waived`. */
export function summarize(
  results: readonly RuleResult[],
  rules: readonly AnyRuleDef[],
): Summary {
  const s = { fail: 0, pass: 0, not_checked: 0, not_applicable: 0, waived: 0 };
  for (const r of results) {
    if (r.waiver) s.waived++;
    else s[r.result]++;
  }
  return { rules: new Set(rules.map((d) => d.code)).size, ...s };
}

/**
 * Tham số kiểu `instant` của luật in một dạng cho cả hai ngôn ngữ
 * (`2026-09-12 03:10 UTC`) trước khi điền khuôn câu.
 */
export function displayResult(r: RuleResult): RuleResult {
  const types = rule(r.rule).params;
  let changed = false;
  const params: Record<string, RuleResult['params'][string]> = {};
  for (const [k, v] of Object.entries(r.params)) {
    if (types[k] === 'instant' && typeof v === 'string') {
      params[k] = fmtInstant(v);
      changed = true;
    } else params[k] = v;
  }
  return changed ? { ...r, params } : r;
}

/** Mã lỗi của lesson mà doctor không thấy từ broker, theo thứ tự của spec. */
export function invisibleBlindSpots(): readonly string[] {
  return blindSpots.filter((b) => b.caughtBy !== 'doctor').map((b) => b.id);
}
