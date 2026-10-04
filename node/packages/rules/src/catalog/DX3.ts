import { defineRule } from '../define';
import { PASS, observed, round, threshold } from '../helpers';
import type { Verdict } from '../types';

/** DX3 · connection hoặc queue bị tạo liên tục; một kết quả cho mỗi loại vượt ngưỡng. */
export const DX3 = defineRule({
  code: 'DX3',
  appliesTo: 'broker',
  requires: ['broker.churn'],
  optional: [],
  variants: ['connection', 'queue'],
  evaluate(v): Verdict | Verdict[] {
    const churn = v['broker.churn'];
    const limit = threshold('DX3', 'perSecond');
    const out: Verdict[] = [];
    for (const [kind, rate] of [
      ['connection', churn.connectionCreated.perSecond],
      ['queue', churn.queueCreated.perSecond],
    ] as const) {
      if (rate <= limit) continue;
      out.push({
        result: 'fail',
        severity: 'S5',
        urgency: 'hygiene',
        variant: kind,
        evidence: [
          observed('broker.churn', v.prov('broker.churn'), { kind, rate }),
        ],
        params: { kind, rate: round(rate, 1) },
        fix: { kind: 'client_change' },
      });
    }
    return out.length > 0 ? out : PASS;
  },
});
