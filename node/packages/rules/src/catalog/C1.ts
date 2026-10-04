import { defineRule } from '../define';
import { LOOSE, PASS, byTolerance, observed, toleranceOf } from '../helpers';

/** C1 · consumer dùng ack tự động. Direct reply-to đã bị EX9 loại. */
export const C1 = defineRule({
  code: 'C1',
  appliesTo: 'consumer',
  requires: ['consumer.ackRequired', 'consumer.queue', 'consumer.connection'],
  optional: [],
  evaluate(v, ctx) {
    if (v['consumer.ackRequired']) return PASS;
    const queue = v['consumer.queue'];
    const t = toleranceOf(ctx, queue);
    if (t === 'loose') return LOOSE;
    return {
      result: 'fail',
      severity: byTolerance(t),
      urgency: 'at_risk',
      evidence: [
        observed('consumer.ackRequired', v.prov('consumer.ackRequired'), false),
      ],
      params: { queue: queue.name, connection: v['consumer.connection'] },
      fix: { kind: 'client_change' },
    };
  },
});
