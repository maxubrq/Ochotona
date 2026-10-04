import { defineRule } from '../define';
import { PASS, observed, round, threshold } from '../helpers';

/** C2 · prefetch 0 (không giới hạn), hoặc 1 trên queue giao nhanh. */
export const C2 = defineRule({
  code: 'C2',
  appliesTo: 'consumer',
  requires: ['consumer.prefetch', 'consumer.queue'],
  optional: ['queue.deliverRate'],
  variants: ['one'],
  needs: ['queue.deliverRate'],
  evaluate(v) {
    const prefetch = v['consumer.prefetch'];
    const queue = v['consumer.queue'].name;
    const evidence = [
      observed('consumer.prefetch', v.prov('consumer.prefetch'), prefetch),
    ];
    if (prefetch === 0)
      return {
        result: 'fail',
        severity: 'S3',
        urgency: 'at_risk',
        evidence,
        params: { queue, prefetch },
        fix: { kind: 'client_change' },
      };
    if (prefetch !== 1) return PASS;
    const rate = v['queue.deliverRate'];
    if (rate.state === 'unknown')
      return { result: 'needs', path: 'queue.deliverRate' };
    const perSecond = rate.value[0]?.value.perSecond;
    if (perSecond === undefined || perSecond <= threshold('C2', 'highRate'))
      return PASS;
    return {
      result: 'fail',
      severity: 'S4',
      urgency: 'hygiene',
      variant: 'one',
      evidence: [
        ...evidence,
        observed('queue.deliverRate', rate.prov, perSecond),
      ],
      params: { queue, prefetch, rate: round(perSecond, 1) },
      fix: { kind: 'client_change' },
    };
  },
});
