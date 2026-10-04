import {
  type Actual,
  type Desired,
  type Topology,
  argsKey,
  known,
  normalizeTopology,
  parseVersion,
} from '@ochotona/model';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { roundTrip } from '../src';
import {
  Broker,
  T0,
  T1,
  loadRecording,
  recordings,
  scanBroker,
  topologyOf,
} from './fixtures';
import { nonInteractive, run, session } from './helpers';

/** Số ca của property test; Stryker hạ xuống qua `OCHO_PROPERTY_RUNS` để mỗi mutant chạy nhanh. */
const PROPERTY_RUNS = Number(process.env.OCHO_PROPERTY_RUNS ?? 10_000);

const prov = { source: 'http.list' as const, path: 'test', observedAt: T1 };

/** `Actual` có đúng topology `t`; phần còn lại lấy từ một broker trống. */
export function actualWith(t: Topology): Actual {
  const base = new Broker().actual();
  const pol =
    (kind: 'policy' | 'operator_policy') =>
    (p: Topology['policies'][number]) => ({
      ref: { kind, vhost: p.vhost, name: p.name },
      pattern: p.pattern,
      applyTo: p.applyTo,
      priority: p.priority,
      definition: p.definition,
    });
  return {
    ...base,
    exchanges: known(
      t.exchanges.map((e) => ({
        ...e,
        ref: { kind: 'exchange' as const, vhost: e.vhost, name: e.name },
      })) as never,
      prov,
    ),
    queues: known(
      t.queues.map((q) => ({
        ...q,
        exclusive: false,
        ref: { kind: 'queue' as const, vhost: q.vhost, name: q.name },
        publishRate: {
          state: 'unknown',
          reason: { kind: 'field_absent' },
          source: 'http.stats',
          path: 'x',
        },
      })) as never,
      prov,
    ),
    bindings: known(
      t.bindings.map((b) => ({
        ref: {
          kind: 'binding' as const,
          vhost: b.vhost,
          source: b.source,
          destinationType: b.destinationType,
          destination: b.destination,
          routingKey: b.routingKey,
          argsKey: argsKey(b.arguments),
        },
        arguments: b.arguments,
      })),
      prov,
    ),
    policies: known(t.policies.map(pol('policy')) as never, prov),
    operatorPolicies: known(
      t.operatorPolicies.map(pol('operator_policy')) as never,
      prov,
    ),
  };
}

// Bộ sinh dùng chung với test topology của model.
const name = fc
  .string({ unit: 'grapheme', minLength: 1, maxLength: 12 })
  .filter((s) => !s.startsWith('amq.') && !s.startsWith('mqtt-subscription-'));
const json: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  v: fc.oneof(
    { depthSize: 'small' },
    fc.string(),
    fc.integer({ min: -(2 ** 53) + 1, max: 2 ** 53 - 1 }),
    fc
      .double({ noNaN: true, noDefaultInfinity: true })
      .map((x) => (Object.is(x, -0) ? 0 : x)),
    fc.boolean(),
    fc.constant(null),
    fc.array(tie('v'), { maxLength: 3 }),
    fc.dictionary(fc.string(), tie('v'), { maxKeys: 3 }),
  ),
})).v;
const args = fc.dictionary(fc.string({ minLength: 1 }), json, {
  maxKeys: 3,
}) as fc.Arbitrary<Record<string, never>>;
const vhost = fc.oneof(fc.constant('/'), name);
const topology: fc.Arbitrary<Topology> = fc.record({
  exchanges: fc.array(
    fc.record({
      vhost,
      name,
      type: fc.constantFrom('direct', 'topic', 'fanout', 'headers'),
      durable: fc.boolean(),
      autoDelete: fc.boolean(),
      internal: fc.boolean(),
      arguments: args,
    }),
    { maxLength: 4 },
  ),
  queues: fc.array(
    fc.record({
      vhost,
      name,
      type: fc.constantFrom(
        'classic' as const,
        'quorum' as const,
        'stream' as const,
      ),
      durable: fc.boolean(),
      autoDelete: fc.boolean(),
      arguments: args,
    }),
    { maxLength: 4 },
  ),
  bindings: fc.array(
    fc.record({
      vhost,
      source: name,
      destinationType: fc.constantFrom('queue' as const, 'exchange' as const),
      destination: name,
      routingKey: fc.string(),
      arguments: args,
    }),
    { maxLength: 4 },
  ),
  policies: fc.array(
    fc.record({
      vhost,
      name,
      pattern: fc.string(),
      applyTo: fc.constantFrom(
        'all' as const,
        'queues' as const,
        'exchanges' as const,
      ),
      priority: fc.integer({ min: -10, max: 10 }),
      definition: args,
    }),
    { maxLength: 3 },
  ),
  operatorPolicies: fc.array(
    fc.record({
      vhost,
      name,
      pattern: fc.string(),
      applyTo: fc.constant('queues' as const),
      priority: fc.integer({ min: 0, max: 10 }),
      definition: args,
    }),
    { maxLength: 2 },
  ),
});
/** Broker không có hai đối tượng cùng khoá. */
const dedupe = (t: Topology): Topology => {
  const n = normalizeTopology(t);
  const uniq = <T>(xs: readonly T[], key: (x: T) => string) => [
    ...new Map(xs.map((x) => [key(x), x])).values(),
  ];
  const vn = (e: { vhost: string; name: string }) =>
    JSON.stringify([e.vhost, e.name]);
  return {
    exchanges: uniq(n.exchanges, vn),
    queues: uniq(n.queues, vn),
    bindings: n.bindings,
    policies: uniq(n.policies, vn),
    operatorPolicies: uniq(n.operatorPolicies, vn),
  };
};

const empty = (t: Topology): Desired => ({
  spec: '0.4',
  broker: { minVersion: parseVersion('4.2')! },
  families: {},
  flows: {},
  services: {},
  waivers: [],
  topology: t,
});

describe('roundTrip', () => {
  it('property: topology ngẫu nhiên qua import không tương tác, 7 bước xanh sau 10.000 ca', () => {
    fc.assert(
      fc.property(topology, (t0) => {
        const actual = actualWith(dedupe(t0));
        const s = session(actual);
        s.answerDefaults();
        const r = s.result();
        if (!r.ok) throw new Error(JSON.stringify(r.error));
      }),
      { numRuns: PROPERTY_RUNS },
    );
  }, 120_000);

  it('số nguyên không an toàn trong argument ghi dạng mũ, đọc lại đúng giá trị', () => {
    const t = normalizeTopology(
      topologyOf(
        new Broker().queue('q', { args: { 'x-big': 2 ** 60 } }).actual(),
      ),
    );
    const r = roundTrip(empty(t), actualWith(t), T0);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value.text).toContain(`x-big: ${(2 ** 60).toExponential()}`);
  });

  it('bước 4 hỏng: Desired không dựng lại được', () => {
    const t = normalizeTopology(topologyOf(new Broker().actual()));
    const d = { ...empty(t), spec: '9.0' };
    expect(roundTrip(d, actualWith(t), T0)).toMatchObject({
      ok: false,
      error: { step: 4 },
    });
  });

  it('bước 5 hỏng: topology khác broker, tối đa 20 khác biệt', () => {
    const b = new Broker();
    for (let i = 0; i < 30; i++) b.queue(`q${i}`);
    const actual = b.actual();
    const r = roundTrip(
      empty(normalizeTopology(topologyOf(new Broker().actual()))),
      actual,
      T0,
    );
    expect(r).toMatchObject({ ok: false, error: { step: 5 } });
    if (!r.ok) {
      expect(r.error.differences).toHaveLength(20);
      expect(r.error.differences[0]).toBe('- queue q0');
    }
  });

  it('bước 1 hỏng: topology của broker không biết', () => {
    const actual = new Broker().actual();
    const broken = {
      ...actual,
      queues: {
        state: 'unknown',
        reason: { kind: 'forbidden', status: 403 },
        source: 'http.list',
        path: 'x',
      },
    } as Actual;
    expect(
      roundTrip(empty(normalizeTopology(topologyOf(actual))), broken, T0),
    ).toMatchObject({
      ok: false,
      error: { step: 1, differences: ['topology unknown: depends_on'] },
    });
  });
});

describe('fixture import', () => {
  const recs = recordings().filter((r) => r.endsWith('/full'));

  it.skipIf(recs.length === 0).each(recs)(
    'bản ghi thật %s: không tương tác và tương tác đều xanh',
    (rec) => {
      const actual = loadRecording(rec);
      const a = nonInteractive(actual);
      expect(a.roundTrip).toBe('ok');
      const b = run(session(actual), (q) =>
        q.kind === 'tolerance'
          ? { kind: 'tolerance', value: 'strict', scope: 'exchange' }
          : { kind: 'family', action: 'accept' },
      );
      expect(
        Object.values(b.desired.flows).every((f) => f.tolerance === 'strict'),
      ).toBe(true);
      // Import lại trên cùng broker cho đúng file cũ.
      expect(nonInteractive(actual, b.yaml).yaml).toBe(b.yaml);
    },
  );

  it('fixture có family: chấp nhận đề xuất, tự kiểm xanh, plan sau import rỗng (U3)', () => {
    const actual = scanBroker().actual();
    const r = run(session(actual), (q) =>
      q.kind === 'family'
        ? { kind: 'family', action: 'rename', param: 'engine_id' }
        : { kind: 'tolerance', value: 'strict', scope: 'flow' },
    );
    expect(Object.keys(r.desired.families)).toEqual([
      'scan.request/request_{engine_id}',
    ]);
    expect(roundTrip(r.desired, actual, T0)).toMatchObject({ ok: true });
  });
});
