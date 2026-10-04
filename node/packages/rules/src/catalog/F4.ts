import { defineRule } from '../define';
import { PASS, observed, round, threshold } from '../helpers';

/** F4 · tỷ lệ giao lại cao: message lỗi được requeue thành vòng lặp. */
export const F4 = defineRule({
  code: 'F4',
  appliesTo: 'queue',
  requires: ['queue.deliverRate', 'queue.redeliverRate'],
  optional: [],
  evaluate(v) {
    const deliver = v['queue.deliverRate'].perSecond;
    const redeliver = v['queue.redeliverRate'].perSecond;
    if (deliver < threshold('F4', 'minDeliverRate')) return PASS;
    const ratio = redeliver / deliver;
    if (ratio <= threshold('F4', 'ratio')) return PASS;
    return {
      result: 'fail',
      severity: 'S3',
      urgency: 'at_risk',
      evidence: [
        observed('queue.deliverRate', v.prov('queue.deliverRate'), deliver),
        observed(
          'queue.redeliverRate',
          v.prov('queue.redeliverRate'),
          redeliver,
        ),
      ],
      params: { ratio: round(ratio, 2), deliverRate: round(deliver, 1) },
      fix: { kind: 'client_change' },
    };
  },
});
