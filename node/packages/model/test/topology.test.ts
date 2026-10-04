import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Instant,
  type Topology,
  buildActual,
  buildDesired,
  diffTopology,
  normalizeTopology,
  topologyFromActual,
} from '../src';
import { ctx, exchange, httpError, okRaw, queue, rawBroker } from './fixtures';

const NOW = '2026-10-04T01:00:00.000Z' as Instant;

/** Dạng `import` sẽ ghi vào `ocho.yaml` (snake_case). */
function toYamlObject(t: Topology) {
  const pol = (p: Topology['policies'][number]) => ({
    vhost: p.vhost,
    name: p.name,
    pattern: p.pattern,
    apply_to: p.applyTo,
    priority: p.priority,
    definition: p.definition,
  });
  return {
    spec: '0.4',
    broker: { min_version: '3.13' },
    topology: {
      exchanges: t.exchanges.map((e) => ({
        vhost: e.vhost,
        name: e.name,
        type: e.type,
        durable: e.durable,
        auto_delete: e.autoDelete,
        internal: e.internal,
        arguments: e.arguments,
      })),
      queues: t.queues.map((q) => ({
        vhost: q.vhost,
        name: q.name,
        type: q.type,
        durable: q.durable,
        auto_delete: q.autoDelete,
        arguments: q.arguments,
      })),
      bindings: t.bindings.map((b) => ({
        vhost: b.vhost,
        source: b.source,
        destination: b.destination,
        destination_type: b.destinationType,
        routing_key: b.routingKey,
        arguments: b.arguments,
      })),
      policies: t.policies.map(pol),
      operator_policies: t.operatorPolicies.map(pol),
    },
  };
}

describe('topologyFromActual và normalizeTopology', () => {
  it('bỏ exchange mặc định, amq.*, queue exclusive và tên sinh tự động', () => {
    const a = buildActual(
      rawBroker({
        queues: okRaw([
          queue('request_clamav_q'),
          queue('request_yara_q'),
          queue('excl', { exclusive: true }),
          queue('amq.gen-123'),
          queue('mqtt-subscription-abc'),
        ]),
      }),
      ctx(),
    );
    const t = topologyFromActual(a);
    if (t.state !== 'known') throw new Error('unknown');
    const n = normalizeTopology(t.value);
    expect(n.exchanges.map((e) => e.name)).toEqual(['scan.request']);
    expect(n.queues.map((q) => q.name)).toEqual([
      'request_clamav_q',
      'request_yara_q',
    ]);
    expect(n.bindings).toHaveLength(2);
  });

  it('giữ binding đi ra từ amq.*, bỏ trường flow', () => {
    const n = normalizeTopology({
      exchanges: [
        {
          vhost: '/',
          name: 'x',
          type: 'direct',
          durable: true,
          autoDelete: false,
          internal: false,
          arguments: {},
          flow: 'f',
        },
      ],
      queues: [],
      bindings: [
        {
          vhost: '/',
          source: 'amq.topic',
          destinationType: 'queue',
          destination: 'q',
          routingKey: '#',
          arguments: {},
        },
      ],
      policies: [],
      operatorPolicies: [],
    });
    expect(n.exchanges[0]).not.toHaveProperty('flow');
    expect(n.bindings).toHaveLength(1);
  });

  it('một bộ sưu tập unknown thì cả topology unknown', () => {
    const a = buildActual(rawBroker({ bindings: httpError(403) }), ctx());
    expect(topologyFromActual(a)).toMatchObject({
      state: 'unknown',
      reason: { kind: 'depends_on' },
    });
  });
});

describe('diffTopology', () => {
  const empty: Topology = {
    exchanges: [],
    queues: [],
    bindings: [],
    policies: [],
    operatorPolicies: [],
  };
  const q = (name: string, args = {}) => ({
    vhost: '/',
    name,
    type: 'classic' as const,
    durable: true,
    autoDelete: false,
    arguments: args,
  });
  const b = (args = {}) => ({
    vhost: '/',
    source: 'x',
    destinationType: 'queue' as const,
    destination: 'a',
    routingKey: 'k',
    arguments: args,
  });

  it('add, remove, update theo thứ tự loại rồi refKey', () => {
    const from = { ...empty, queues: [q('a', { 'x-max-length': 1 }), q('b')] };
    const to = {
      ...empty,
      queues: [q('a', { 'x-max-length': 2 }), q('c')],
      exchanges: [
        {
          vhost: '/',
          name: 'x',
          type: 'topic',
          durable: true,
          autoDelete: false,
          internal: false,
          arguments: {},
        },
      ],
    };
    const d = diffTopology(normalizeTopology(from), normalizeTopology(to));
    expect(d.map((c) => [c.op, (c.ref as { name: string }).name])).toEqual([
      ['add', 'x'],
      ['update', 'a'],
      ['remove', 'b'],
      ['add', 'c'],
    ]);
    expect(d[1]).toMatchObject({
      op: 'update',
      fields: [{ path: ['arguments', 'x-max-length'], before: 1, after: 2 }],
    });
  });

  it('đổi argument của binding là remove + add', () => {
    const d = diffTopology(
      { ...empty, bindings: [b({ 'x-match': 'all' })] },
      { ...empty, bindings: [b({ 'x-match': 'any' })] },
    );
    expect(d.map((c) => c.op).sort()).toEqual(['add', 'remove']);
  });

  it('mảng so nguyên khối', () => {
    const d = diffTopology(
      { ...empty, queues: [q('a', { l: [1, 2] })] },
      { ...empty, queues: [q('a', { l: [1, 3] })] },
    );
    expect(d[0]).toMatchObject({
      fields: [{ path: ['arguments', 'l'], before: [1, 2], after: [1, 3] }],
    });
  });
});

describe('vòng tròn import', () => {
  it('fixture: broker → yaml → Desired → diff rỗng', () => {
    const a = buildActual(
      rawBroker({
        exchanges: okRaw([
          exchange(''),
          exchange('scan.request', {
            arguments: { 'alternate-exchange': 'ae' },
          }),
        ]),
      }),
      ctx(),
    );
    const t = topologyFromActual(a);
    if (t.state !== 'known') throw new Error('unknown');
    const d = buildDesired(
      JSON.parse(JSON.stringify(toYamlObject(t.value))),
      NOW,
    );
    if (!d.ok) throw new Error(JSON.stringify(d.error));
    expect(
      diffTopology(
        normalizeTopology(t.value),
        normalizeTopology(d.value.topology),
      ),
    ).toEqual([]);
  });

  const name = fc
    .string({ unit: 'grapheme', minLength: 1, maxLength: 12 })
    .filter(
      (s) => !s.startsWith('amq.') && !s.startsWith('mqtt-subscription-'),
    );
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
  // Broker không có hai đối tượng cùng khoá.
  const dedupe = (t: Topology): Topology => {
    const n = normalizeTopology(t);
    const uniq = <T>(xs: readonly T[], key: (x: T) => string) => [
      ...new Map(xs.map((x) => [key(x), x])).values(),
    ];
    return {
      exchanges: uniq(n.exchanges, (e) => JSON.stringify([e.vhost, e.name])),
      queues: uniq(n.queues, (e) => JSON.stringify([e.vhost, e.name])),
      bindings: n.bindings,
      policies: uniq(n.policies, (e) => JSON.stringify([e.vhost, e.name])),
      operatorPolicies: uniq(n.operatorPolicies, (e) =>
        JSON.stringify([e.vhost, e.name]),
      ),
    };
  };

  it('property: topology ngẫu nhiên → yaml → parse → buildDesired → diff rỗng', () => {
    fc.assert(
      fc.property(topology, (t0) => {
        const t = dedupe(t0);
        const parsed = JSON.parse(JSON.stringify(toYamlObject(t)));
        const d = buildDesired(parsed, NOW);
        if (!d.ok) throw new Error(JSON.stringify(d.error));
        expect(
          diffTopology(
            normalizeTopology(t),
            normalizeTopology(d.value.topology),
          ),
        ).toEqual([]);
      }),
      { numRuns: 10_000 },
    );
  });
});
