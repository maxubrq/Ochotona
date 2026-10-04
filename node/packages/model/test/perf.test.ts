import { describe, expect, it } from 'vitest';
import { buildActual, checkInvariants } from '../src';
import {
  ctx,
  exchange,
  okRaw,
  overview,
  policy,
  queue,
  rawBroker,
} from './fixtures';

describe('hiệu năng', () => {
  it('10.000 queue, 20.000 binding, 200 policy: buildActual ≤ 500 ms', () => {
    const queues = Array.from({ length: 10_000 }, (_, i) =>
      queue(`svc${i % 50}.q${i}`, {
        type: i % 3 === 0 ? 'quorum' : 'classic',
        members: ['rabbit@a'],
      }),
    );
    const bindings = queues.flatMap((q, i) => [
      {
        vhost: '/',
        source: 'ex',
        destination: q.name,
        destination_type: 'queue',
        routing_key: `k${i}`,
        arguments: {},
      },
      {
        vhost: '/',
        source: 'ex',
        destination: q.name,
        destination_type: 'queue',
        routing_key: `k${i}.b`,
        arguments: {},
      },
    ]);
    const policies = Array.from({ length: 200 }, (_, i) =>
      policy(
        `p${i}`,
        `^svc${i % 50}\\.q${i}$`,
        { 'max-length': i + 1 },
        { priority: i },
      ),
    );
    const totals = {
      queues: 10_000,
      exchanges: 1,
      connections: 1,
      channels: 2,
      consumers: 1,
    };
    const raw = rawBroker({
      overview: okRaw(overview({ object_totals: totals })),
      totalsAtEnd: okRaw(overview({ object_totals: totals })),
      exchanges: okRaw([exchange('ex')]),
      queues: okRaw(queues),
      bindings: okRaw(bindings),
      policies: okRaw(policies),
    });
    buildActual(raw, ctx()); // làm nóng JIT
    const t0 = performance.now();
    const a = buildActual(raw, ctx());
    const ms = performance.now() - t0;
    expect(a.queues.state === 'known' && a.queues.value.length).toBe(10_000);
    expect(checkInvariants(a)).toEqual([]);
    expect(ms).toBeLessThan(500);
  });
});
