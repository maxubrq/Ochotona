import { defineRule } from '../define';
import { LOOSE, PASS, byTolerance, observed, toleranceOf } from '../helpers';

/** R1 · channel đã publish mà không bật publisher confirm. */
export const R1 = defineRule({
  code: 'R1',
  appliesTo: 'channel',
  requires: [
    'channel.publishCount',
    'channel.confirm',
    'channel.connection',
    'channel.user',
  ],
  optional: [],
  evaluate(v, ctx) {
    const count = v['channel.publishCount'];
    if (count === 0 || v['channel.confirm']) return PASS;
    // Dung sai của channel đi qua khối services theo user.
    const t = toleranceOf(ctx, v.ref);
    if (t === 'loose') return LOOSE;
    return {
      result: 'fail',
      severity: byTolerance(t),
      urgency: 'at_risk',
      evidence: [
        observed('channel.publishCount', v.prov('channel.publishCount'), count),
        observed('channel.confirm', v.prov('channel.confirm'), false),
      ],
      params: {
        connection: v['channel.connection'],
        user: v['channel.user'],
        publishCount: count,
      },
      fix: { kind: 'client_change' },
    };
  },
});
