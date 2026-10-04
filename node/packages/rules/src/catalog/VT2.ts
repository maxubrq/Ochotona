import { compareVersion, parseVersion } from '@ochotona/model';
import { capabilitiesFor } from '@ochotona/spec';
import { defineRule } from '../define';
import { policyFix } from '../fix';
import { PASS, effectiveEvidence, observed } from '../helpers';
import { deadLetterSet } from './T4';

const V4 = parseVersion('4.0.0')!;

/** VT2 · quorum queue không dead-letter, không delivery-limit, sẽ nhận limit mặc định sau nâng cấp. */
export const VT2 = defineRule({
  code: 'VT2',
  appliesTo: 'queue',
  requires: [
    'queue.type',
    'queue.effective',
    'queue.effectiveCheck',
    'broker.version',
  ],
  optional: ['queue.appliedPolicy'],
  evaluate(v, ctx) {
    const target = ctx.targetVersion;
    if (target === null) return { result: 'not_applicable' };
    if (
      compareVersion(target, V4) < 0 ||
      compareVersion(v['broker.version'], V4) >= 0
    )
      return PASS;
    if (v['queue.type'] !== 'quorum') return PASS;
    const eff = v['queue.effective'];
    if (eff['dead-letter-exchange'] || eff['delivery-limit']) return PASS;
    const found = capabilitiesFor(target);
    if (found.status === 'unsupported') return PASS;
    const defaultLimit = found.caps.defaults.quorum.deliveryLimit;
    if (defaultLimit === null) return PASS;
    const check = v['queue.effectiveCheck'];
    return {
      result: 'fail',
      severity: 'S1',
      urgency: 'active_loss_path',
      evidence: [
        observed(
          'broker.version',
          v.prov('broker.version'),
          v['broker.version'].raw,
        ),
        effectiveEvidence(
          'queue.effective',
          eff,
          check,
          'dead-letter-exchange',
        ),
        effectiveEvidence('queue.effective', eff, check, 'delivery-limit'),
      ],
      params: { targetVersion: target.raw, defaultLimit },
      fix: policyFix(
        ctx,
        { ref: v.ref, appliedPolicy: v['queue.appliedPolicy'] },
        deadLetterSet(ctx),
      ),
    };
  },
});
