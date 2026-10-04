import { defineRule } from '../define';
import { policyFix } from '../fix';
import {
  LOOSE,
  PASS,
  byTolerance,
  effectiveEvidence,
  layerLabel,
  num,
  toleranceOf,
} from '../helpers';

/** T3 · giới hạn chiều dài với overflow drop-head bỏ message cũ nhất. */
export const T3 = defineRule({
  code: 'T3',
  appliesTo: 'queue',
  requires: ['queue.effective', 'queue.effectiveCheck'],
  optional: ['queue.appliedPolicy'],
  evaluate(v, ctx) {
    const eff = v['queue.effective'];
    const len = num(eff['max-length']?.value);
    const bytes = num(eff['max-length-bytes']?.value);
    if (len === undefined && bytes === undefined) return PASS;
    const overflow = eff['overflow'];
    if (overflow?.value !== 'drop-head') return PASS;
    const t = toleranceOf(ctx, v.ref);
    if (t === 'loose') return LOOSE;
    const check = v['queue.effectiveCheck'];
    const key = len !== undefined ? 'max-length' : 'max-length-bytes';
    return {
      result: 'fail',
      severity: byTolerance(t),
      urgency: t === 'strict' ? 'active_loss_path' : 'at_risk',
      evidence: [
        effectiveEvidence('queue.effective', eff, check, key),
        effectiveEvidence('queue.effective', eff, check, 'overflow'),
      ],
      params: {
        limit: (len ?? bytes)!,
        limitKind: len !== undefined ? 'messages' : 'bytes',
        overflowLayer: layerLabel(overflow),
      },
      fix: policyFix(
        ctx,
        { ref: v.ref, appliedPolicy: v['queue.appliedPolicy'] },
        { overflow: 'reject-publish' },
      ),
    };
  },
});
