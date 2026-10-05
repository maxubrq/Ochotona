// Exit code của `doctor`. Bước 1 đến 4 của thuật toán (Ctrl-C, lỗi nội bộ, lỗi
// cách dùng, nhận diện thất bại) đi qua ngoại lệ ở `run.ts`; hàm ở đây làm
// bước 2 (phần `internal`), 5, 6, 7 trên kết quả đã chấm.

import type { RuleResult } from '@ochotona/rules';
import { type Severity, rule } from '@ochotona/spec';

const rank = (s: Severity) => Number(s.slice(1));

/** `s` bằng hoặc cao hơn `threshold` (S1 cao nhất). */
export function atOrAbove(s: Severity, threshold: Severity): boolean {
  return rank(s) <= rank(threshold);
}

/**
 * 2. `internal` không rỗng → 5.
 * 5. Có `fail` không miễn trừ, không experimental, mức bằng hoặc cao hơn ngưỡng → 1.
 * 6. Có `not_checked` của luật mà `meta.severities` chứa một mức bằng hoặc cao
 *    hơn ngưỡng → 2. Đọc `meta.severities`, không đọc mức của kết quả: T1 có
 *    thể ra S1, nên T1 chưa kiểm được thì không được coi là sạch dưới S1.
 * 7. Còn lại → 0.
 */
export function doctorExit(
  results: readonly RuleResult[],
  opts: { readonly failOn: Severity; readonly internal: number },
): 0 | 1 | 2 | 5 {
  if (opts.internal > 0) return 5;
  const counts = (r: RuleResult) => !r.waiver && !r.experimental;
  if (
    results.some(
      (r) =>
        r.result === 'fail' &&
        counts(r) &&
        r.severity !== undefined &&
        atOrAbove(r.severity, opts.failOn),
    )
  )
    return 1;
  if (
    results.some(
      (r) =>
        r.result === 'not_checked' &&
        counts(r) &&
        rule(r.rule).severities.some((s) => atOrAbove(s, opts.failOn)),
    )
  )
    return 2;
  return 0;
}
