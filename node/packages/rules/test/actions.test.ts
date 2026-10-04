import type { ObjectRef } from '@ochotona/model';
import { describe, expect, it } from 'vitest';
import '@ochotona/spec/i18n/en';
import { planActions } from '../src/actions';
import { toActionText } from '../src/finding';
import type { RuleResult } from '../src/types';

const q = (name: string, vhost = '/'): ObjectRef => ({
  kind: 'queue',
  vhost,
  name,
});
const r = (
  rule: string,
  object: ObjectRef,
  over: Partial<RuleResult> = {},
): RuleResult => ({
  rule: rule as RuleResult['rule'],
  object,
  result: 'fail',
  severity: 'S3',
  urgency: 'at_risk',
  evidence: [],
  params: {},
  experimental: false,
  tolerance: 'undeclared',
  ...over,
});

describe('planActions', () => {
  it('orders by severity, then urgency, then object count, then rule order', () => {
    const { actions } = planActions([
      r('T1', q('a'), { severity: 'S3', urgency: 'at_risk' }),
      r('T1', q('b'), { severity: 'S3', urgency: 'at_risk' }),
      r('T3', q('c'), { severity: 'S3', urgency: 'active_loss_path' }),
      r('C1', q('d'), { severity: 'S3', urgency: 'at_risk' }),
      r('T2', q('e'), {
        severity: 'S1',
        urgency: 'loss_occurred',
        fix: { kind: 'policy' },
      }),
    ]);
    expect(actions.map((a) => [a.rule, a.objects.length])).toEqual([
      ['T2', 1],
      ['T3', 1],
      ['T1', 2],
    ]);
  });

  it('breaks severity ties by urgency', () => {
    const { actions } = planActions([
      r('C1', q('a'), { severity: 'S1', urgency: 'at_risk' }),
      r('T5', q('b'), { severity: 'S1', urgency: 'active_loss_path' }),
    ]);
    expect(actions.map((a) => a.rule)).toEqual(['T5', 'C1']);
  });

  it('groups by rule, variant, fix kind and vhost', () => {
    const { actions } = planActions([
      r('T9', q('a'), { variant: 'ttl' }),
      r('T9', q('b'), { variant: 'expires' }),
      r('T9', q('c', 'v2'), { variant: 'ttl' }),
    ]);
    expect(actions).toHaveLength(3);
  });

  it('skips waived, experimental and S4–S5 results', () => {
    const waiver = {
      rule: 'T1',
      object: q('a'),
      reason: 'x',
      by: 'y',
      until: '2099-01-01',
    };
    const { actions } = planActions([
      r('T1', q('a'), { waiver }),
      r('T1', q('b'), { experimental: true }),
      r('C2', q('c'), { severity: 'S4' }),
      r('DX3', { kind: 'broker' }, { severity: 'S5' }),
    ]);
    expect(actions).toEqual([]);
  });

  it('counts not_checked results of rules that can be S1', () => {
    const nc = (rule: string) =>
      r(rule, q('x'), { result: 'not_checked', severity: undefined });
    expect(planActions([nc('T2'), nc('T5'), nc('DX1')]).uncheckedS1).toBe(2);
  });

  it('keeps three actions at most', () => {
    const rs = ['a', 'b', 'c', 'd'].map((n, i) =>
      r(['T1', 'T3', 'C1', 'R1'][i], q(n)),
    );
    expect(planActions(rs).actions).toHaveLength(3);
  });

  it('renders an action line', () => {
    const { actions } = planActions([
      r('T1', q('a')),
      r('T1', q('b')),
      r('T1', q('c')),
      r('T1', q('d')),
    ]);
    expect(
      toActionText(actions[0], 'en', (o) => ('name' in o ? o.name : o.kind)),
    ).toBe('Move a, b, c (+1) to quorum queues');
  });
});
