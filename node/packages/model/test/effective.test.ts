import { describe, expect, it } from 'vitest';
import {
  APPLY_TO,
  type ApplyTo,
  type ArgMap,
  DEFAULT_CAPABILITY_TABLE,
  type Instant,
  type Policy,
  type QueueType,
  capabilitiesFor,
  hasUnsupportedPcre,
  known,
  parseVersion,
  resolveEffective,
  unknown,
} from '../src';
import { selfCheck } from '../src/effective';

const at = '2026-10-04T01:22:11.000Z' as Instant;
const caps = (v: string) =>
  capabilitiesFor(DEFAULT_CAPABILITY_TABLE, parseVersion(v)!);
const C40 = caps('4.0.0');
const C313 = caps('3.13.7');
const list = (ps: Policy[]) =>
  known(ps as readonly Policy[], {
    source: 'http.list',
    path: 'http:/api/policies',
    observedAt: at,
  });
const NONE = list([]);

const pol = (
  name: string,
  definition: ArgMap,
  over: Partial<Omit<Policy, 'ref'>> & {
    vhost?: string;
    kind?: 'policy' | 'operator_policy';
  } = {},
): Policy => ({
  ref: { kind: over.kind ?? 'policy', vhost: over.vhost ?? '/', name },
  pattern: over.pattern ?? '.*',
  applyTo: over.applyTo ?? 'all',
  priority: over.priority ?? 0,
  definition,
});

const q = (
  name: string,
  queueType: QueueType | undefined,
  args: ArgMap = {},
) =>
  queueType === undefined
    ? { ref: { kind: 'exchange' as const, vhost: '/', name }, arguments: args }
    : {
        ref: { kind: 'queue' as const, vhost: '/', name },
        queueType,
        arguments: args,
        vhostDefaultQueueType: null,
      };

describe('chọn policy', () => {
  const expected: Record<ApplyTo, Record<string, boolean>> = {
    all: { exchange: true, classic: true, quorum: true, stream: true },
    exchanges: { exchange: true, classic: false, quorum: false, stream: false },
    queues: { exchange: false, classic: true, quorum: true, stream: true },
    classic_queues: {
      exchange: false,
      classic: true,
      quorum: false,
      stream: false,
    },
    quorum_queues: {
      exchange: false,
      classic: false,
      quorum: true,
      stream: false,
    },
    streams: { exchange: false, classic: false, quorum: false, stream: true },
  };
  for (const applyTo of APPLY_TO) {
    for (const target of ['exchange', 'classic', 'quorum', 'stream'] as const) {
      it(`applyTo ${applyTo} × ${target}`, () => {
        const r = resolveEffective(
          q('x', target === 'exchange' ? undefined : target),
          list([pol('p', { 'max-length-bytes': 5 }, { applyTo })]),
          NONE,
          C40,
        );
        expect(r.chosen.policy).toBe(expected[applyTo][target] ? 'p' : null);
      });
    }
  }

  it('priority cao nhất thắng; khác vhost bị bỏ', () => {
    const r = resolveEffective(
      q('orders', 'classic'),
      list([
        pol('low', { 'max-length': 1 }, { priority: 1 }),
        pol('high', { 'max-length': 2 }, { priority: 5 }),
        pol(
          'other-vhost',
          { 'max-length': 3 },
          { priority: 9, vhost: 'billing' },
        ),
        pol(
          'no-match',
          { 'max-length': 4 },
          { priority: 9, pattern: '^billing' },
        ),
      ]),
      NONE,
      C40,
    );
    expect(r.chosen.policy).toBe('high');
  });

  it('hai policy cùng priority cao nhất thì tie', () => {
    const r = resolveEffective(
      q('a', 'classic'),
      list([pol('b', {}), pol('a', {})]),
      NONE,
      C40,
    );
    expect(r.effective).toMatchObject({
      state: 'unknown',
      reason: { kind: 'tie', policies: ['a', 'b'] },
    });
  });

  it('pattern ngoài tập hỗ trợ thì regex_unsupported', () => {
    const r = resolveEffective(
      q('a', 'classic'),
      list([pol('bad', {}, { pattern: '(?i)^A' })]),
      NONE,
      C40,
    );
    expect(r.effective).toMatchObject({
      state: 'unknown',
      reason: { kind: 'regex_unsupported', policy: 'bad' },
    });
  });

  it('pattern khớp không neo', () => {
    const r = resolveEffective(
      q('my.orders.q', 'classic'),
      list([pol('p', {}, { pattern: 'orders' })]),
      NONE,
      C40,
    );
    expect(r.chosen.policy).toBe('p');
  });

  it('danh sách policy unknown thì depends_on', () => {
    const u = unknown(
      { kind: 'forbidden', status: 403 },
      'http.list',
      'http:/api/policies',
    );
    const r = resolveEffective(q('a', 'classic'), u, NONE, C40);
    expect(r.effective).toMatchObject({
      state: 'unknown',
      reason: { kind: 'depends_on', reason: { kind: 'forbidden' } },
    });
  });
});

describe('regex PCRE', () => {
  const bad = [
    '(?>a)',
    '(?|a)',
    '(?#c)',
    '(?(1)a)',
    '(?R)',
    '(?P<n>a)',
    '(?i)a',
    '(?i:a)',
    'a*+',
    'a++',
    'a?+',
    'a{2}+',
    '\\Aa',
    'a\\Z',
    'a\\z',
    '\\G',
    '\\Qa\\E',
    'a\\K',
    '\\R',
    '\\h',
    '\\v',
    '\\p{L}',
  ];
  const good = [
    '^orders\\.',
    '.*',
    'a+?',
    '(?:a|b)',
    '(?=a)',
    '(?<n>a)',
    '[+*]+',
    '\\++',
    'a{2,3}',
    '\\d+',
  ];
  for (const p of bad)
    it(`từ chối ${p}`, () => expect(hasUnsupportedPcre(p)).toBe(true));
  for (const p of good)
    it(`chấp nhận ${p}`, () => expect(hasUnsupportedPcre(p)).toBe(false));
});

describe('gộp giá trị', () => {
  const P = (d: ArgMap) => list([pol('pol', d)]);
  const O = (d: ArgMap) => list([pol('op', d, { kind: 'operator_policy' })]);
  const eff = (
    args: ArgMap,
    p: ArgMap | null,
    o: ArgMap | null,
    type: QueueType = 'quorum',
    c = C40,
  ) => {
    const r = resolveEffective(
      q('q', type, args),
      p ? P(p) : NONE,
      o ? O(o) : NONE,
      c,
    );
    if (r.effective.state !== 'known') throw new Error('unknown');
    return r.effective.value;
  };

  it('chỉ argument', () => {
    expect(eff({ 'x-max-length': 10 }, null, null)['max-length']).toEqual({
      value: 10,
      layer: 'argument',
      by: null,
      overridden: [],
    });
  });
  it('chỉ policy', () => {
    expect(eff({}, { 'max-length': 10 }, null)['max-length']).toMatchObject({
      value: 10,
      layer: 'policy',
      by: 'pol',
    });
  });
  it('chỉ operator', () => {
    expect(eff({}, null, { 'max-length': 10 })['max-length']).toMatchObject({
      value: 10,
      layer: 'operator_policy',
      by: 'op',
    });
  });
  it('argument + policy, khoá nhỏ hơn thắng', () => {
    expect(
      eff({ 'x-max-length': 50 }, { 'max-length': 10 }, null)['max-length'],
    ).toEqual({
      value: 10,
      layer: 'policy',
      by: 'pol',
      overridden: [
        { layer: 'argument', by: null, value: 50, why: 'lower_wins' },
      ],
    });
  });
  it('argument + policy, khoá argument thắng', () => {
    expect(
      eff(
        { 'x-dead-letter-exchange': 'dlx-a' },
        { 'dead-letter-exchange': 'dlx-p' },
        null,
      )['dead-letter-exchange'],
    ).toEqual({
      value: 'dlx-a',
      layer: 'argument',
      by: null,
      overridden: [
        { layer: 'policy', by: 'pol', value: 'dlx-p', why: 'argument_wins' },
      ],
    });
  });
  it('policy + operator, số nhỏ hơn thắng', () => {
    expect(
      eff({}, { 'max-length': 10 }, { 'max-length': 5 })['max-length'],
    ).toEqual({
      value: 5,
      layer: 'operator_policy',
      by: 'op',
      overridden: [
        { layer: 'policy', by: 'pol', value: 10, why: 'lower_wins' },
      ],
    });
  });
  it('cả ba', () => {
    const e = eff(
      { 'x-message-ttl': 1000 },
      { 'message-ttl': 5000 },
      { 'message-ttl': 3000 },
    );
    expect(e['message-ttl']).toEqual({
      value: 1000,
      layer: 'argument',
      by: null,
      overridden: [
        { layer: 'operator_policy', by: 'op', value: 3000, why: 'lower_wins' },
        { layer: 'policy', by: 'pol', value: 5000, why: 'lower_wins' },
      ],
    });
  });
  it('operator policy có khoá không phải số thì ghi bất thường', () => {
    const r = resolveEffective(
      q('q', 'classic'),
      NONE,
      O({ overflow: 'reject-publish' }),
      C40,
    );
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].kind).toBe('unexpected_operator_key');
  });
  it('khoá ngoài bảng: argument thắng, bỏ tiền tố x-', () => {
    expect(
      eff(
        { 'x-single-active-consumer': true },
        { 'single-active-consumer': false },
        null,
      )['single-active-consumer'],
    ).toMatchObject({
      value: true,
      layer: 'argument',
    });
  });

  it('mặc định dựng sẵn theo phiên bản và loại queue', () => {
    expect(eff({}, null, null, 'quorum', C40)['delivery-limit']).toMatchObject({
      value: 20,
      layer: 'builtin_default',
    });
    expect(
      eff({}, null, null, 'quorum', C313)['delivery-limit'],
    ).toBeUndefined();
    expect(
      eff({}, null, null, 'quorum', C40)['dead-letter-strategy'],
    ).toMatchObject({ value: 'at-most-once' });
    expect(
      eff({}, null, null, 'classic', C40)['dead-letter-strategy'],
    ).toBeUndefined();
    expect(eff({}, null, null, 'classic', C40)['overflow']).toMatchObject({
      value: 'drop-head',
      layer: 'builtin_default',
    });
    expect(eff({}, null, null, 'classic', C40)['queue-type']).toMatchObject({
      value: 'classic',
      layer: 'builtin_default',
    });
  });

  it('queue-type lấy vhost default khi không có argument', () => {
    const r = resolveEffective(
      { ...q('q', 'quorum'), vhostDefaultQueueType: 'quorum' },
      NONE,
      NONE,
      C40,
    );
    expect(
      r.effective.state === 'known' && r.effective.value['queue-type'],
    ).toMatchObject({ value: 'quorum', layer: 'vhost_default' });
  });
});

describe('tự kiểm với broker', () => {
  const r = resolveEffective(
    q('q', 'classic'),
    list([pol('scan-dlx', { 'dead-letter-exchange': 'dlx' })]),
    NONE,
    C40,
  );
  const k = <T>(v: T) =>
    known(v, { source: 'http.list', path: 'http:/api/queues', observedAt: at });

  it('khớp mọi trường thì verified', () => {
    const s = selfCheck(r, {
      appliedPolicy: k('scan-dlx'),
      appliedOperatorPolicy: k(null),
      brokerEffectivePolicy: k({ 'dead-letter-exchange': 'dlx' }),
    });
    expect(s.effectiveCheck).toBe('verified');
    expect(s.effective.state).toBe('known');
  });

  it('trường broker unknown thì unverified nhưng vẫn known', () => {
    const s = selfCheck(r, {
      appliedPolicy: k('scan-dlx'),
      appliedOperatorPolicy: k(null),
      brokerEffectivePolicy: unknown(
        { kind: 'field_absent' },
        'http.list',
        'x',
      ),
    });
    expect(s).toMatchObject({
      effectiveCheck: 'unverified',
      effective: { state: 'known' },
    });
  });

  it('lệch thì model_mismatch', () => {
    const s = selfCheck(r, {
      appliedPolicy: k('catch-all'),
      appliedOperatorPolicy: k(null),
      brokerEffectivePolicy: k({ 'dead-letter-exchange': 'dlx' }),
    });
    expect(s.effective).toMatchObject({
      state: 'unknown',
      reason: {
        kind: 'model_mismatch',
        detail: 'policy: model=scan-dlx broker=catch-all',
      },
    });
  });
});
