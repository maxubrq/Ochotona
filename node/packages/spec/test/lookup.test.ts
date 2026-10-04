import { describe, expect, it } from 'vitest';
import {
  BROKER_SUPPORT,
  CONTRACTS,
  SPEC_VERSION,
  blindSpots,
  capabilitiesFor,
  capabilityRanges,
  codeEntry,
  codes,
  compareVersion,
  compatKey,
  defaultsFor,
  docsUrl,
  exclusionsFor,
  exitCodes,
  keyByArgument,
  keyByCanonical,
  keyByPolicy,
  parseVersion,
  rule,
  rules,
  severities,
  type RuleCode,
} from '../src';

const v = (s: string) => parseVersion(s)!;

describe('constants', () => {
  it('match spec.json', () => {
    expect(SPEC_VERSION).toBe('0.4.0');
    expect(CONTRACTS).toEqual({
      finding: 1,
      report: 1,
      snapshot: 1,
      ochoYaml: '0.1',
    });
    expect(BROKER_SUPPORT.minSupported).toBe('3.13.0');
    expect(severities.map((s) => s.label.en)).toEqual([
      'DATA SAFETY',
      'SEMANTICS',
      'OPERABILITY',
      'PERFORMANCE',
      'COST',
    ]);
    expect(
      Object.keys(exitCodes)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([0, 1, 2, 3, 4, 5, 130]);
  });
});

describe('versions', () => {
  it('parses and compares', () => {
    expect(v('4.3.0-rc.1')).toEqual({
      major: 4,
      minor: 3,
      patch: 0,
      pre: 'rc.1',
      raw: '4.3.0-rc.1',
    });
    expect(v('3.13')).toMatchObject({ major: 3, minor: 13, patch: 0 });
    expect(parseVersion('four')).toBeNull();
    expect(compareVersion(v('4.3.0-rc.1'), v('4.3.0'))).toBe(-1);
    expect(compareVersion(v('4.3.0-rc.2'), v('4.3.0-rc.10'))).toBe(-1);
    expect(compareVersion(v('4.2.9'), v('4.3.0'))).toBe(-1);
    expect(compareVersion(v('4.3'), v('4.3.0'))).toBe(0);
  });

  it('compatKey groups 0.minor before 1.0 and major after', () => {
    expect(compatKey(v('0.4.0'))).toBe('0.4');
    expect(compatKey(v('0.4.9'))).toBe('0.4');
    expect(compatKey(v('0.5.0'))).toBe('0.5');
    expect(compatKey(v('1.2.3'))).toBe('1');
  });
});

describe('capabilitiesFor', () => {
  const cases: [string, string, string | null][] = [
    ['3.12.9', 'unsupported', null],
    ['3.13.0', 'supported', '3.13.0'],
    ['3.13.7', 'supported', '3.13.0'],
    ['4.1.5', 'untested', '4.0.0'],
    ['4.2.0', 'supported', '4.2.0'],
    ['4.3.0-rc.1', 'untested', '4.3.0'],
    ['4.4.0', 'untested', '4.3.0'],
    ['5.0.0', 'untested', '4.3.0'],
  ];
  it.each(cases)('%s → %s', (version, status, from) => {
    const r = capabilitiesFor(v(version));
    expect(r.status).toBe(status);
    if (r.status !== 'unsupported') expect(r.range.from).toBe(from);
  });

  it('reads the right values per range', () => {
    const at = (s: string) => {
      const r = capabilitiesFor(v(s));
      if (r.status === 'unsupported') throw new Error(s);
      return r.caps;
    };
    expect(at('3.13.1').mirroredClassicQueues).toBe('available');
    expect(at('4.1.0').metadataDefault).toBe('mnesia');
    expect(at('4.2.0').metadataDefault).toBe('khepri');
    expect(at('4.3.0-rc.1').retry.mechanism).toBe('quorum_delayed_retry');
    expect(at('4.3.0').nackCountsTowardDeliveryLimit).toBe(false);
    expect(capabilityRanges).toHaveLength(4);
  });
});

describe('defaultsFor', () => {
  it('gives builtin defaults per queue type', () => {
    expect(defaultsFor(v('4.2.1'), 'quorum')).toEqual({
      overflow: 'drop-head',
      'dead-letter-strategy': 'at-most-once',
      'delivery-limit': 20,
    });
    expect(defaultsFor(v('3.13.0'), 'quorum')).toEqual({
      overflow: 'drop-head',
      'dead-letter-strategy': 'at-most-once',
    });
    expect(defaultsFor(v('4.0.0'), 'classic')).toEqual({
      overflow: 'drop-head',
    });
    expect(defaultsFor(v('4.0.0'), 'stream')).toEqual({});
    expect(defaultsFor(v('3.12.0'), 'quorum')).not.toHaveProperty(
      'delivery-limit',
    );
  });
});

describe('keys', () => {
  it('looks up by argument, policy and canonical name', () => {
    expect(keyByArgument('x-delivery-limit')?.canonical).toBe('delivery-limit');
    expect(keyByArgument('alternate-exchange')?.canonical).toBe(
      'alternate-exchange',
    );
    expect(keyByPolicy('message-ttl')?.resolution).toBe('lower_wins');
    expect(keyByPolicy('queue-type')).toBeUndefined();
    expect(keyByCanonical('queue-type')?.resolution).toBe('argument_only');
    expect(keyByArgument('x-unknown')).toBeUndefined();
  });
});

describe('exclusions', () => {
  it('splits by scope', () => {
    expect(exclusionsFor('exchange', 'topology').map((x) => x.id)).toEqual([
      'EX1',
      'EX2',
    ]);
    expect(exclusionsFor('exchange', 'rules').map((x) => x.id)).toEqual([
      'EX1',
      'EX3',
    ]);
    expect(exclusionsFor('queue', 'rules').map((x) => x.id)).toEqual([
      'EX4',
      'EX5',
      'EX6',
      'EX7',
    ]);
    expect(exclusionsFor('consumer', 'topology')).toEqual([]);
  });
});

describe('rules and codes', () => {
  it('rule() returns metadata and throws on unknown codes', () => {
    expect(rule('T2').severities).toEqual(['S1', 'S3']);
    expect(rule('VT1').targetVersionOnly).toBe(true);
    expect(() => rule('ZZ1' as RuleCode)).toThrow(/unknown rule ZZ1/);
  });

  it('every rule is registered', () => {
    for (const r of rules) expect(codeEntry(r.code), r.code).toBeDefined();
  });

  it('codeEntry returns undefined for unknown codes', () => {
    expect(codeEntry('CX3')?.kind).toBe('diagnostic');
    expect(codeEntry('NOPE1')).toBeUndefined();
    expect(new Set(codes.map((c) => c.code)).size).toBe(codes.length);
  });

  it('blind spots not caught by doctor', () => {
    expect(
      blindSpots.filter((b) => b.caughtBy !== 'doctor').map((b) => b.id),
    ).toEqual([
      'LE2',
      'LE5',
      'LE6',
      'LE8',
      'LE10',
      'LE14',
      'LE17',
      'LE19',
      'LE20',
    ]);
  });
});

describe('docsUrl', () => {
  it('fills the template and lowercases the anchor', () => {
    expect(
      docsUrl('spec', 'CT-30', { toolVersion: '0.1.0', specVersion: '0.4' }),
    ).toBe(
      'https://github.com/<org>/ochotona/blob/v0.1.0/docs/spec/0.4.md#ct-30',
    );
    expect(
      docsUrl('lesson', 'T2', { toolVersion: '0.1.0', specVersion: '0.4' }),
    ).toMatch(/lesson\.md#t2$/);
  });
});
