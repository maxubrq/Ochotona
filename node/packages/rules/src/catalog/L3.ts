import { type Policy, matchingPolicies, stableJson } from '@ochotona/model';
import { keyByPolicy } from '@ochotona/spec';
import { defineRule } from '../define';
import { PASS, observed } from '../helpers';
import type { Ctx, Verdict } from '../types';

/** Khoá an toàn: thua ở policy bị bỏ qua là mất một lớp bảo vệ. */
const SAFETY_KEYS = [
  'alternate-exchange',
  'dead-letter-exchange',
  'dead-letter-strategy',
  'overflow',
  'delivery-limit',
] as const;

type Target = 'exchange' | 'classic' | 'quorum' | 'stream';

/**
 * ≥ 2 policy người dùng khớp một đối tượng; RabbitMQ chỉ áp một. S1 khi
 * policy thua mang khoá an toàn (áp được cho loại đối tượng) mà policy thắng
 * không có hoặc khác giá trị.
 */
function evaluateL3(
  ref: { kind: 'exchange' | 'queue'; vhost: string; name: string },
  target: Target,
  ctx: Ctx,
  prov: Parameters<typeof observed>[1],
): Verdict {
  const all = ctx.actual.policies;
  if (all.state !== 'known') throw new Error('policies must be known here');
  const m = matchingPolicies(
    { ref, ...(target === 'exchange' ? {} : { queueType: target }) },
    all.value,
  );
  if (!m.ok)
    return {
      result: 'not_checked',
      path: 'policy.pattern',
      reason: m.reason,
      source: all.prov.path,
    };
  const ps = m.policies;
  if (ps.length < 2) return PASS;
  const [winner, ...losers] = ps;
  const evidence = ps.map((p) =>
    observed('policy.definition', prov, { [p.ref.name]: p.definition }),
  );
  const base = {
    result: 'fail',
    urgency: 'at_risk',
    evidence,
    fix: { kind: 'config' },
  } as const;
  const params = (keys: readonly string[]) => ({
    winner: winner.ref.name,
    losers: losers.map((p) => p.ref.name),
    keys,
  });
  if (losers[0].priority === winner.priority)
    return { ...base, severity: 'S3', variant: 'tie', params: params([]) };
  const lost = new Set<string>();
  for (const p of losers)
    for (const k of lostKeys(p, winner, target)) lost.add(k);
  const keys = [...lost].sort();
  return keys.length > 0
    ? { ...base, severity: 'S1', variant: 'keys', params: params(keys) }
    : { ...base, severity: 'S3', params: params([]) };
}

function lostKeys(loser: Policy, winner: Policy, target: Target): string[] {
  return SAFETY_KEYS.filter((k) => {
    if (!(k in loser.definition)) return false;
    const def = keyByPolicy(k);
    if (def && !(def.appliesTo as readonly string[]).includes(target))
      return false;
    return (
      !(k in winner.definition) ||
      stableJson(winner.definition[k]) !== stableJson(loser.definition[k])
    );
  });
}

const REQUIRES = [
  'policy.pattern',
  'policy.applyTo',
  'policy.priority',
  'policy.definition',
] as const;

/** L3 trên exchange. */
export const L3Exchange = defineRule({
  code: 'L3',
  appliesTo: 'exchange',
  requires: REQUIRES,
  optional: [],
  variants: ['keys', 'tie'],
  evaluate: (v, ctx) =>
    evaluateL3(v.ref, 'exchange', ctx, v.prov('policy.definition')),
});

/** L3 trên queue. */
export const L3Queue = defineRule({
  code: 'L3',
  appliesTo: 'queue',
  requires: [...REQUIRES, 'queue.type'],
  optional: [],
  variants: ['keys', 'tie'],
  evaluate: (v, ctx) =>
    evaluateL3(v.ref, v['queue.type'], ctx, v.prov('policy.definition')),
});
