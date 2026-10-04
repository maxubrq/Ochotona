import { describe, expect, it } from 'vitest';
import { buildActual, checkInvariants } from '../src';
import { ctx, httpError, okRaw, overview, rawBroker, T0 } from './fixtures';

/** Overview của broker tắt thống kê: không có message_stats, churn_rates. */
function statsOff(version: string, totals: Record<string, number> = {}) {
  const ov = overview({
    rabbitmq_version: version,
    object_totals: { queues: 2, exchanges: 3, connections: 1, ...totals },
  }) as Record<string, unknown>;
  delete ov.message_stats;
  delete ov.churn_rates;
  return okRaw(ov, T0);
}

const empty = (page = false) =>
  okRaw(page ? { items: [], page: 1, page_count: 0 } : []);

describe('danh sách hoạt động khi thống kê tắt (CL2)', () => {
  it('4.3: connections, channels trả 200 rỗng thành unknown: source_unavailable', () => {
    const a = buildActual(
      rawBroker({
        overview: statsOff('4.3.0'),
        connections: empty(true),
        channels: empty(true),
        consumers: httpError(400),
      }),
      ctx(),
    );
    expect(checkInvariants(a)).toEqual([]);
    for (const l of [a.connections, a.channels, a.consumers]) {
      expect(l).toMatchObject({
        state: 'unknown',
        reason: { kind: 'source_unavailable' },
        source: 'http.stats',
      });
    }
  });

  it('4.3: kể cả khi object_totals bằng 0, theo bảng năng lực', () => {
    const a = buildActual(
      rawBroker({
        overview: statsOff('4.3.2', { connections: 0 }),
        connections: empty(true),
      }),
      ctx(),
    );
    expect(a.connections).toMatchObject({
      state: 'unknown',
      reason: { kind: 'source_unavailable' },
    });
  });

  it('4.2: 400 thành source_unavailable; connections vẫn đọc được', () => {
    const a = buildActual(
      rawBroker({
        overview: statsOff('4.2.1'),
        channels: httpError(400),
        consumers: httpError(400),
      }),
      ctx(),
    );
    expect(a.channels).toMatchObject({
      state: 'unknown',
      reason: { kind: 'source_unavailable' },
    });
    expect(a.consumers).toMatchObject({
      state: 'unknown',
      reason: { kind: 'source_unavailable' },
    });
    expect(a.connections.state).toBe('known');
  });

  it('thống kê bật: 400 vẫn là lỗi, không đổi lý do', () => {
    const a = buildActual(rawBroker({ channels: httpError(400) }), ctx());
    expect(a.channels).toMatchObject({
      state: 'unknown',
      reason: { kind: 'error' },
    });
  });
});

describe('danh sách rỗng mà object_totals đếm > 0', () => {
  it('queues, connections rỗng trong khi tổng > 0: inconsistent_read', () => {
    const a = buildActual(
      rawBroker({
        queues: empty(true),
        connections: empty(true),
        channels: empty(true),
        consumers: empty(),
      }),
      ctx(),
    );
    for (const l of [a.queues, a.connections, a.channels, a.consumers]) {
      expect(l).toMatchObject({
        state: 'unknown',
        reason: { kind: 'inconsistent_read' },
      });
    }
  });

  it('tổng bằng 0 hoặc vắng: danh sách rỗng là đã biết', () => {
    const ov = overview({
      object_totals: { queues: 0, exchanges: 3, connections: 0, channels: 0 },
    });
    const a = buildActual(
      rawBroker({
        overview: okRaw(ov, T0),
        totalsAtEnd: okRaw(ov),
        queues: empty(true),
        bindings: okRaw([]),
        connections: empty(true),
        channels: empty(true),
        consumers: empty(),
      }),
      ctx(),
    );
    expect(a.queues).toMatchObject({ state: 'known', value: [] });
    expect(a.connections).toMatchObject({ state: 'known', value: [] });
    // consumers vắng trong object_totals: không đối chiếu được, giữ nguyên.
    expect(a.consumers).toMatchObject({ state: 'known', value: [] });
  });

  it('phạm vi một vhost: không đối chiếu với tổng toàn cluster', () => {
    const a = buildActual(
      rawBroker({ connections: empty(true) }),
      ctx({ scope: { vhosts: ['/'] } }),
    );
    expect(a.connections).toMatchObject({ state: 'known', value: [] });
  });
});

describe('uptime dự phòng từ Prometheus cho bộ đếm', () => {
  const prom = (node: string, uptime: number | null) =>
    okRaw(
      [
        `rabbitmq_identity_info{rabbitmq_node="${node}",rabbitmq_cluster="c"} 1`,
        ...(uptime === null
          ? []
          : [`rabbitmq_erlang_uptime_seconds ${uptime}`]),
        'rabbitmq_global_messages_unroutable_dropped_total{protocol="amqp091"} 4',
        'rabbitmq_global_messages_unroutable_returned_total{protocol="amqp091"} 0',
      ].join('\n'),
    );
  // /api/nodes khi thống kê tắt: chỉ còn name, running, type.
  const bareNodes = (...names: string[]) =>
    okRaw(names.map((name) => ({ name, running: true, type: 'disc' })));

  it('cluster một node, /api/nodes không có uptime: dùng uptime Prometheus', () => {
    const a = buildActual(
      rawBroker({
        overview: statsOff('4.2.1'),
        nodes: bareNodes('rabbit@a'),
        prometheus: prom('rabbit@a', 600),
      }),
      ctx(),
    );
    expect(checkInvariants(a)).toEqual([]);
    expect(a.broker.counters.unroutableDropped).toMatchObject({
      state: 'known',
      // T0 = 01:22:10, trừ 600 giây.
      value: {
        count: 4,
        completeSince: '2026-10-04T01:12:10.000Z',
        scope: { kind: 'cluster' },
      },
    });
  });

  it('cluster nhiều node: dùng uptime Prometheus cho đúng node trả lời', () => {
    const a = buildActual(
      rawBroker({
        overview: statsOff('4.2.1'),
        nodes: bareNodes('rabbit@a', 'rabbit@b'),
        prometheus: prom('rabbit@b', 60),
      }),
      ctx(),
    );
    expect(a.broker.counters.unroutableDropped).toMatchObject({
      state: 'known',
      value: {
        completeSince: '2026-10-04T01:21:10.000Z',
        scope: { kind: 'node', node: 'rabbit@b' },
      },
    });
  });

  it('không có cả hai uptime: Counter vẫn unknown', () => {
    const a = buildActual(
      rawBroker({
        overview: statsOff('4.2.1'),
        nodes: bareNodes('rabbit@a'),
        prometheus: prom('rabbit@a', null),
      }),
      ctx(),
    );
    expect(a.broker.counters.unroutableDropped).toMatchObject({
      state: 'unknown',
      reason: { kind: 'depends_on', reason: { kind: 'field_absent' } },
    });
  });

  it('bộ đếm http.stats không bao giờ dùng uptime Prometheus', () => {
    const n = { name: 'rabbit@a', running: true, type: 'disc' };
    const a = buildActual(
      rawBroker({ nodes: okRaw([n]), prometheus: prom('rabbit@a', 600) }),
      ctx(),
    );
    const c = a.broker.counters.unroutableDropped;
    expect(c.state).toBe('unknown');
    expect(c.state === 'unknown' && c.path).toContain('counters');
  });
});
