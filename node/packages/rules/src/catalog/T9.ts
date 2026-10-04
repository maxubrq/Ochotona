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
import type { Verdict } from '../types';

/**
 * T9 · message hết hạn (`ttl`) mà không qua dead-letter, hoặc cả queue hết hạn
 * (`expires`). Thêm dead-letter không cứu được queue hết hạn.
 */
export const T9 = defineRule({
  code: 'T9',
  appliesTo: 'queue',
  requires: ['queue.effective', 'queue.effectiveCheck'],
  optional: ['queue.appliedPolicy'],
  variants: ['ttl', 'expires'],
  evaluate(v, ctx): Verdict | Verdict[] {
    const eff = v['queue.effective'];
    const check = v['queue.effectiveCheck'];
    const ttl = num(eff['message-ttl']?.value);
    const expires = num(eff['expires']?.value);
    const hasDlx = eff['dead-letter-exchange'] !== undefined;
    const ttlFails = ttl !== undefined && !hasDlx;
    if (!ttlFails && expires === undefined) return PASS;
    const t = toleranceOf(ctx, v.ref);
    if (t === 'loose') return LOOSE;
    const common = {
      result: 'fail',
      severity: byTolerance(t),
      urgency: t === 'strict' ? 'active_loss_path' : 'at_risk',
    } as const;
    const out: Verdict[] = [];
    if (ttlFails)
      out.push({
        ...common,
        variant: 'ttl',
        evidence: [
          effectiveEvidence('queue.effective', eff, check, 'message-ttl'),
          effectiveEvidence(
            'queue.effective',
            eff,
            check,
            'dead-letter-exchange',
          ),
        ],
        params: { ttlMs: ttl, layer: layerLabel(eff['message-ttl']) },
        fix: policyFix(
          ctx,
          { ref: v.ref, appliedPolicy: v['queue.appliedPolicy'] },
          { 'dead-letter-exchange': ctx.caps.retry.mainQueueDeadLetter },
        ),
      });
    if (expires !== undefined)
      out.push({
        ...common,
        variant: 'expires',
        evidence: [effectiveEvidence('queue.effective', eff, check, 'expires')],
        params: { expiresMs: expires, layer: layerLabel(eff['expires']) },
        fix: { kind: 'config' },
      });
    return out;
  },
});
