// Model đọc dữ liệu dùng chung từ @ochotona/spec thay vì viết cứng.
import * as spec from '@ochotona/spec';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAPABILITY_TABLE,
  EFFECTIVE_KEYS,
  type Instant,
  type Policy,
  canonicalArgKey,
  capabilitiesFor,
  compareVersion,
  known,
  matchesExclusion,
  normalizeTopology,
  parseVersion,
  resolveEffective,
} from '../src';

const v = (s: string) => parseVersion(s)!;
const at = '2026-10-04T01:22:11.000Z' as Instant;

describe('re-exports from spec', () => {
  it('parseVersion and compareVersion are the spec functions', () => {
    expect(parseVersion).toBe(spec.parseVersion);
    expect(compareVersion).toBe(spec.compareVersion);
  });

  it('the key table is keys.json', () => {
    expect(EFFECTIVE_KEYS).toBe(spec.keys);
    expect(canonicalArgKey('x-delivery-limit')).toBe('delivery-limit');
    expect(canonicalArgKey('x-single-active-consumer')).toBe(
      'single-active-consumer',
    );
  });
});

describe('capability table from spec', () => {
  it('has one entry per spec range, with the same defaults', () => {
    expect(DEFAULT_CAPABILITY_TABLE.map((e) => e.since)).toEqual(
      spec.capabilityRanges.map((r) => r.from),
    );
    for (const s of ['3.13.7', '4.1.0', '4.2.3', '4.4.0']) {
      const c = capabilitiesFor(DEFAULT_CAPABILITY_TABLE, v(s));
      expect(c.defaults.quorum, s).toEqual(spec.defaultsFor(v(s), 'quorum'));
      expect(c.defaults.classic, s).toEqual(spec.defaultsFor(v(s), 'classic'));
    }
  });

  it('ignores pre-release when picking a range', () => {
    const c = capabilitiesFor(DEFAULT_CAPABILITY_TABLE, v('4.3.0-rc.1'));
    expect(c.spec?.retry.mechanism).toBe('quorum_delayed_retry');
    expect(
      capabilitiesFor(DEFAULT_CAPABILITY_TABLE, v('3.13.7')).defaults.quorum,
    ).not.toHaveProperty('delivery-limit');
  });
});

describe('operator policy keys', () => {
  const ops = (definition: Record<string, string | number>) =>
    known(
      [
        {
          ref: { kind: 'operator_policy', vhost: '/', name: 'op' },
          pattern: '.*',
          applyTo: 'queues',
          priority: 0,
          definition,
        } satisfies Policy,
      ] as readonly Policy[],
      {
        source: 'http.list',
        path: 'http:/api/operator-policies',
        observedAt: at,
      },
    );
  const none = known([] as readonly Policy[], {
    source: 'http.list',
    path: 'http:/api/policies',
    observedAt: at,
  });
  const target = {
    ref: { kind: 'queue' as const, vhost: '/', name: 'q' },
    queueType: 'quorum' as const,
    arguments: {},
  };
  const caps = capabilitiesFor(DEFAULT_CAPABILITY_TABLE, v('4.2.0'));

  it('flags a key the spec does not allow in operator policies', () => {
    const r = resolveEffective(
      target,
      none,
      ops({ 'dead-letter-exchange': 'dlx' }),
      caps,
    );
    expect(r.anomalies.map((a) => a.detail)).toEqual([
      'key dead-letter-exchange is not allowed in operator policies',
    ]);
  });

  it('accepts an allowed numeric key', () => {
    const r = resolveEffective(
      target,
      none,
      ops({ 'delivery-limit': 5 }),
      caps,
    );
    expect(r.anomalies).toEqual([]);
  });
});

describe('system exclusions', () => {
  const ex = (id: string) => spec.exclusions.find((x) => x.id === id)!;

  it('matches by the declarative conditions', () => {
    expect(matchesExclusion(ex('EX1'), { name: '' })).toBe(true);
    expect(matchesExclusion(ex('EX2'), { name: 'amq.topic' })).toBe(true);
    expect(
      matchesExclusion(ex('EX3'), {
        name: 'amq.topic',
        hasOutgoingBindings: true,
      }),
    ).toBe(false);
    expect(matchesExclusion(ex('EX4'), { name: 'q', exclusive: true })).toBe(
      true,
    );
    expect(
      matchesExclusion(ex('EX9'), { queue: 'amq.rabbitmq.reply-to' }),
    ).toBe(true);
    expect(matchesExclusion(ex('EX5'), { name: 'orders' })).toBe(false);
  });

  it('normalizeTopology drops what the topology exclusions name, and keeps ocho.* queues', () => {
    const q = (name: string) => ({
      vhost: '/',
      name,
      type: 'quorum' as const,
      durable: true,
      autoDelete: false,
      arguments: {},
    });
    const x = (name: string) => ({
      vhost: '/',
      name,
      type: 'direct',
      durable: true,
      autoDelete: false,
      internal: false,
      arguments: {},
    });
    const t = normalizeTopology({
      exchanges: [x(''), x('amq.direct'), x('orders')],
      queues: [
        q('amq.gen-1'),
        q('mqtt-subscription-a'),
        q('ocho.retry'),
        q('orders'),
      ],
      bindings: [
        {
          vhost: '/',
          source: '',
          destination: 'orders',
          destinationType: 'queue',
          routingKey: 'orders',
          arguments: {},
        },
      ],
      policies: [],
      operatorPolicies: [],
    });
    expect(t.exchanges.map((e) => e.name)).toEqual(['orders']);
    expect(t.queues.map((e) => e.name)).toEqual(['ocho.retry', 'orders']);
    expect(t.bindings).toEqual([]);
  });
});
