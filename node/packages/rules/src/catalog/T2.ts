import { defineRule } from '../define';
import { policyFix } from '../fix';
import {
  LOOSE,
  PASS,
  effectiveEvidence,
  inferred,
  observed,
  toleranceOf,
} from '../helpers';
import type { Evidence, Urgency } from '../types';

/** T2 · exchange có binding đi ra mà không có alternate exchange dùng được. */
export const T2 = defineRule({
  code: 'T2',
  appliesTo: 'exchange',
  requires: [
    'exchange.type',
    'exchange.effective',
    'exchange.effectiveCheck',
    'binding.destination',
  ],
  optional: ['broker.counters.unroutableDropped', 'exchange.appliedPolicy'],
  variants: ['dropped', 'dropped_node', 'at_risk'],
  evaluate(v, ctx) {
    const outgoing = v['binding.destination'];
    // Fanout có binding giao mọi message: không có gì để không định tuyến được.
    if (outgoing.length === 0 || v['exchange.type'] === 'fanout') return PASS;
    const eff = v['exchange.effective'];
    const ae = eff['alternate-exchange'];
    let reason: 'missing' | 'dangling' | 'unbound';
    if (!ae) reason = 'missing';
    else {
      const target = ctx.index.exchange({
        kind: 'exchange',
        vhost: v.ref.vhost,
        name: String(ae.value),
      });
      if (!target) reason = 'dangling';
      else if (ctx.index.bindingsBySource(target.ref).length === 0)
        reason = 'unbound';
      else return PASS;
    }
    const t = toleranceOf(ctx, v.ref);
    if (t === 'loose') return LOOSE;

    const c = v['broker.counters.unroutableDropped'];
    const counted = c.state === 'known' && c.value.count > 0 ? c : null;
    const evidence: Evidence[] = [
      effectiveEvidence(
        'exchange.effective',
        eff,
        v['exchange.effectiveCheck'],
        'alternate-exchange',
      ),
      inferred('binding.destination', outgoing.length),
    ];
    let params: Record<string, string | number> = { reason };
    let variant = 'at_risk';
    if (counted) {
      const scope = counted.value.scope;
      variant = scope.kind === 'node' ? 'dropped_node' : 'dropped';
      params = {
        reason,
        count: counted.value.count,
        since: counted.value.completeSince,
        ...(scope.kind === 'node' ? { node: scope.node } : {}),
      };
      evidence.push({
        ...observed(
          'broker.counters.unroutableDropped',
          counted.prov,
          counted.value.count,
        ),
        since: counted.value.completeSince,
      });
    }
    const urgency: Urgency = counted
      ? 'loss_occurred'
      : t === 'strict'
        ? 'active_loss_path'
        : 'at_risk';
    return {
      result: 'fail',
      severity: t === 'strict' || counted ? 'S1' : 'S3',
      urgency,
      variant,
      evidence,
      params,
      fix: policyFix(
        ctx,
        { ref: v.ref, appliedPolicy: v['exchange.appliedPolicy'] },
        { 'alternate-exchange': 'ocho.unroutable' },
      ),
    };
  },
});
