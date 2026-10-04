import { defineRule } from '../define';
import { policyFix } from '../fix';
import { PASS, effectiveEvidence, layerLabel, str } from '../helpers';

/**
 * T5 · quorum queue có dead-letter mà không đồng thời at-least-once và
 * reject-publish. Không phụ thuộc dung sai: dead-letter là đường người dùng đã
 * chọn để giữ message.
 */
export const T5 = defineRule({
  code: 'T5',
  appliesTo: 'queue',
  requires: ['queue.type', 'queue.effective', 'queue.effectiveCheck'],
  optional: ['queue.appliedPolicy'],
  evaluate(v, ctx) {
    if (v['queue.type'] !== 'quorum') return PASS;
    const eff = v['queue.effective'];
    if (!eff['dead-letter-exchange']) return PASS;
    const strategy = eff['dead-letter-strategy'];
    const overflow = eff['overflow'];
    if (
      strategy?.value === 'at-least-once' &&
      overflow?.value === 'reject-publish'
    )
      return PASS;
    const check = v['queue.effectiveCheck'];
    return {
      result: 'fail',
      severity: 'S1',
      urgency: 'active_loss_path',
      evidence: [
        'dead-letter-exchange',
        'dead-letter-strategy',
        'overflow',
      ].map((k) => effectiveEvidence('queue.effective', eff, check, k)),
      params: {
        strategy: str(strategy?.value),
        overflow: str(overflow?.value),
        strategyLayer: layerLabel(strategy),
        overflowLayer: layerLabel(overflow),
      },
      fix: policyFix(
        ctx,
        { ref: v.ref, appliedPolicy: v['queue.appliedPolicy'] },
        { 'dead-letter-strategy': 'at-least-once', overflow: 'reject-publish' },
      ),
    };
  },
});
