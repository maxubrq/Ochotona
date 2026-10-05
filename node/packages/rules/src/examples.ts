import type { Result, RuleCode, Severity } from '@ochotona/spec';
import { EXAMPLES } from './gen/examples';

/**
 * Rút gọn của một fixture tầng đơn vị, cho `ocho explain <MÃ>`: tên ca, đối
 * tượng và kết quả mà luật phải ra. Sinh từ `fixtures/unit` bằng `pnpm examples`.
 */
export interface RuleExample {
  readonly kind: 'fail' | 'near';
  /** Tên ca trong fixture, tiếng Anh. */
  readonly title: string;
  /** `refLabel` của đối tượng. */
  readonly object: string;
  readonly result: Result | 'none';
  readonly severity?: Severity;
  readonly variant?: string;
}

/**
 * Ca `fail` đầu tiên và ca `near` đầu tiên của luật.
 * @example ruleExamples('T2')[0].title // 'no alternate exchange, nothing dropped yet, undeclared'
 */
export function ruleExamples(code: RuleCode): readonly RuleExample[] {
  return EXAMPLES[code] ?? [];
}
