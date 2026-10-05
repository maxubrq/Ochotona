import type { RuleResult } from '@ochotona/rules';
import { describe, expect, it } from 'vitest';
import { atOrAbove, doctorExit } from '../src/exit';

const base = {
  object: { kind: 'queue', vhost: '/', name: 'q' },
  evidence: [],
  params: {},
  experimental: false,
  tolerance: 'undeclared',
} as const;

const fail = (rule: string, severity: string, extra: object = {}) =>
  ({
    ...base,
    rule,
    result: 'fail',
    severity,
    urgency: 'at_risk',
    ...extra,
  }) as unknown as RuleResult;
const notChecked = (rule: string, extra: object = {}) =>
  ({ ...base, rule, result: 'not_checked', ...extra }) as unknown as RuleResult;
const pass = (rule: string) =>
  ({ ...base, rule, result: 'pass' }) as unknown as RuleResult;

describe('atOrAbove', () => {
  it('S1 is the highest', () => {
    expect(atOrAbove('S1', 'S1')).toBe(true);
    expect(atOrAbove('S1', 'S3')).toBe(true);
    expect(atOrAbove('S2', 'S1')).toBe(false);
    expect(atOrAbove('S3', 'S3')).toBe(true);
    expect(atOrAbove('S4', 'S3')).toBe(false);
  });
});

describe('doctorExit', () => {
  const S1 = { failOn: 'S1' as const, internal: 0 };

  it('step 2: internal issues win over everything else', () => {
    expect(doctorExit([fail('T2', 'S1')], { failOn: 'S1', internal: 1 })).toBe(
      5,
    );
  });

  it('step 5: a counted fail at or above the threshold', () => {
    expect(doctorExit([fail('T2', 'S1')], S1)).toBe(1);
    expect(doctorExit([fail('T3', 'S3')], S1)).toBe(0);
    expect(doctorExit([fail('T3', 'S3')], { failOn: 'S3', internal: 0 })).toBe(
      1,
    );
    expect(doctorExit([fail('T3', 'S2')], { failOn: 'S3', internal: 0 })).toBe(
      1,
    );
  });

  it('step 5: waived and experimental fails do not count', () => {
    const waiver = {
      rule: 'T2',
      object: base.object,
      reason: 'r',
      by: 'b',
      until: '2099-01-01',
    };
    expect(doctorExit([fail('T2', 'S1', { waiver })], S1)).toBe(0);
    expect(doctorExit([fail('T2', 'S1', { experimental: true })], S1)).toBe(0);
  });

  it('step 6: not_checked of a rule that can reach the threshold, by meta.severities', () => {
    // T1 có thể ra S1, nên chưa kiểm được thì không sạch dưới --fail-on S1.
    expect(doctorExit([notChecked('T1')], S1)).toBe(2);
    // Q3 chỉ ra S3.
    expect(doctorExit([notChecked('Q3')], S1)).toBe(0);
    expect(doctorExit([notChecked('Q3')], { failOn: 'S3', internal: 0 })).toBe(
      2,
    );
    expect(doctorExit([notChecked('T1', { experimental: true })], S1)).toBe(0);
  });

  it('only fail results with a severity count in step 5', () => {
    expect(doctorExit([notChecked('Q3', { severity: 'S1' })], S1)).toBe(0);
    expect(doctorExit([fail('T2', undefined as unknown as string)], S1)).toBe(
      0,
    );
  });

  it('fail beats not_checked; nothing left is 0', () => {
    expect(doctorExit([notChecked('T1'), fail('T2', 'S1')], S1)).toBe(1);
    expect(doctorExit([pass('T2')], S1)).toBe(0);
    expect(doctorExit([], S1)).toBe(0);
  });
});
