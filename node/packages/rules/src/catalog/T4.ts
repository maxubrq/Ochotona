import { compareVersion, parseVersion } from '@ochotona/model';
import { defineRule } from '../define';
import { policyFix } from '../fix';
import { PASS, effectiveEvidence, layerLabel, num, observed } from '../helpers';
import type { Ctx } from '../types';

const V4 = parseVersion('4.0.0')!;

/** Khoá đặt cùng lúc để một lần sửa qua cả T4 và T5. */
export const deadLetterSet = (ctx: Ctx) => ({
  'delivery-limit': ctx.caps.ochoSets.deliveryLimit,
  'dead-letter-exchange': ctx.caps.retry.mainQueueDeadLetter,
  'dead-letter-strategy': 'at-least-once',
  overflow: 'reject-publish',
});

/** T4 · message độc bị bỏ (`drop`) hoặc lặp vô hạn (`loop`). */
export const T4 = defineRule({
  code: 'T4',
  appliesTo: 'queue',
  requires: [
    'queue.type',
    'queue.effective',
    'queue.effectiveCheck',
    'broker.version',
  ],
  optional: ['queue.appliedPolicy'],
  variants: ['drop', 'loop'],
  evaluate(v, ctx) {
    if (v['queue.type'] !== 'quorum') return PASS;
    const eff = v['queue.effective'];
    const check = v['queue.effectiveCheck'];
    const version = v['broker.version'];
    const limitEntry = eff['delivery-limit'];
    // Từ 4.0, delivery-limit âm là không giới hạn.
    const limit = num(limitEntry?.value);
    const bounded = limit !== undefined && limit >= 0;
    const evidence = [
      effectiveEvidence('queue.effective', eff, check, 'dead-letter-exchange'),
      effectiveEvidence('queue.effective', eff, check, 'delivery-limit'),
      observed('broker.version', v.prov('broker.version'), version.raw),
    ];
    const fix = policyFix(
      ctx,
      { ref: v.ref, appliedPolicy: v['queue.appliedPolicy'] },
      deadLetterSet(ctx),
    );
    if (!eff['dead-letter-exchange'] && bounded)
      return {
        result: 'fail',
        severity: 'S1',
        urgency: 'active_loss_path',
        variant: 'drop',
        evidence,
        params: { limit, limitLayer: layerLabel(limitEntry) },
        fix,
      };
    if (!bounded && compareVersion(version, V4) < 0)
      return {
        result: 'fail',
        severity: 'S3',
        urgency: 'hygiene',
        variant: 'loop',
        evidence,
        params: {},
        fix,
      };
    return PASS;
  },
});
