import { compareVersion, parseVersion } from '@ochotona/model';
import { defineRule } from '../define';
import { PASS, observed } from '../helpers';

const V4 = parseVersion('4.0.0')!;

/** VT1 · classic queue mirrored qua `ha-mode` sẽ mất bản sao khi lên 4.0. */
export const VT1 = defineRule({
  code: 'VT1',
  appliesTo: 'queue',
  requires: [
    'queue.type',
    'queue.appliedPolicy',
    'policy.definition',
    'broker.version',
  ],
  optional: [],
  evaluate(v, ctx) {
    const target = ctx.targetVersion;
    if (target === null) return { result: 'not_applicable' };
    if (
      compareVersion(target, V4) < 0 ||
      compareVersion(v['broker.version'], V4) >= 0
    )
      return PASS;
    if (v['queue.type'] !== 'classic') return PASS;
    const name = v['queue.appliedPolicy'];
    if (name === null) return PASS;
    const p = v['policy.definition'].find(
      (r) =>
        r.ref.kind === 'policy' &&
        r.ref.vhost === v.ref.vhost &&
        r.ref.name === name,
    );
    if (!p || !('ha-mode' in p.value)) return PASS;
    return {
      result: 'fail',
      severity: 'S1',
      urgency: 'at_risk',
      evidence: [
        observed('queue.appliedPolicy', v.prov('queue.appliedPolicy'), name),
        observed('policy.definition', v.prov('policy.definition'), p.value),
      ],
      params: { policy: name, targetVersion: target.raw },
      fix: { kind: 'argument_migration' },
    };
  },
});
