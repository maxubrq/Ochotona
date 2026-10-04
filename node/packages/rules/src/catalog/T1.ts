import { defineRule } from '../define';
import { LOOSE, PASS, inferred, toleranceOf } from '../helpers';
import type { Verdict } from '../types';

const OPTIONAL = ['queue.consumers', 'queue.ready', 'queue.unacked'] as const;

/** T1 · classic queue bền giữ dữ liệu không được mất. */
export const T1 = defineRule({
  code: 'T1',
  appliesTo: 'queue',
  requires: ['queue.type', 'queue.durable', 'queue.autoDelete'],
  optional: OPTIONAL,
  variants: ['bare'],
  needs: OPTIONAL,
  evaluate(v, ctx): Verdict {
    if (
      v['queue.type'] !== 'classic' ||
      !v['queue.durable'] ||
      v['queue.autoDelete']
    )
      return PASS;
    const t = toleranceOf(ctx, v.ref);
    if (t === 'loose') return LOOSE;
    const consumers = v['queue.consumers'];
    const ready = v['queue.ready'];
    const unacked = v['queue.unacked'];
    const fail = (severity: 'S1' | 'S3'): Verdict => {
      const counts =
        consumers.state === 'known' &&
        ready.state === 'known' &&
        unacked.state === 'known'
          ? {
              messages: ready.value + unacked.value,
              consumers: consumers.value,
            }
          : null;
      return {
        result: 'fail',
        severity,
        urgency: 'at_risk',
        ...(counts ? {} : { variant: 'bare' }),
        evidence: [inferred('queue.type', 'classic')],
        params: counts ?? {},
        fix: { kind: 'argument_migration' },
      };
    };
    if (t === 'strict') return fail('S1');
    // undeclared: chỉ báo khi queue đang được dùng thật.
    if (consumers.state === 'unknown')
      return { result: 'needs', path: 'queue.consumers' };
    if (ready.state === 'unknown')
      return { result: 'needs', path: 'queue.ready' };
    if (unacked.state === 'unknown')
      return { result: 'needs', path: 'queue.unacked' };
    return consumers.value > 0 && ready.value + unacked.value > 0
      ? fail('S3')
      : PASS;
  },
});
