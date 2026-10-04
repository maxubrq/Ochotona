import { describe, expect, it } from 'vitest';
import {
  buildActual,
  buildIndexes,
  checkInvariants,
  type Actual,
  type Observed,
} from '../src';
import {
  CONN,
  T0,
  T1,
  ctx,
  httpError,
  node,
  okRaw,
  overview,
  policy,
  queue,
  rawBroker,
} from './fixtures';

const val = <T>(o: Observed<T>): T => {
  if (o.state !== 'known') throw new Error(`unknown: ${JSON.stringify(o)}`);
  return o.value;
};

function build(over: Parameters<typeof rawBroker>[0] = {}, c = ctx()): Actual {
  const a = buildActual(rawBroker(over), c);
  expect(checkInvariants(a)).toEqual([]);
  return a;
}

describe('buildActual: ánh xạ cơ bản', () => {
  const a = build();

  it('broker', () => {
    expect(val(a.broker.productName)).toBe('RabbitMQ');
    expect(val(a.broker.clusterName)).toBe('rabbit@a');
    expect(val(a.broker.totals).queues).toBe(2);
    expect(val(a.broker.churn).connectionCreated).toEqual({
      perSecond: 0.2,
      windowSeconds: 5,
    });
    expect(val(a.broker.metadataStore)).toBe('mnesia');
    expect(val(a.broker.deprecatedInUse)).toEqual([]);
    expect(val(a.whoami)).toEqual({
      name: 'monitoring',
      tags: ['monitoring', 'management'],
    });
    expect(a.meta.sources).toEqual({
      'http.list': 'ok',
      'http.stats': 'ok',
      prometheus: 'ok',
    });
  });

  it('phiên bản cluster là phiên bản nhỏ nhất của các node', () => {
    expect(val(a.broker.version).raw).toBe('4.2.0');
    expect(
      a.broker.version.state === 'known' && a.broker.version.prov.source,
    ).toBe('derived');
  });

  it('bộ đếm: http.stats trước, phạm vi cluster, completeSince theo uptime nhỏ nhất', () => {
    expect(val(a.broker.counters.unroutableDropped)).toEqual({
      count: 7,
      completeSince: '2026-10-04T01:21:10.000Z',
      scope: { kind: 'cluster' },
    });
    expect(
      a.broker.counters.unroutableDropped.state === 'known' &&
        a.broker.counters.unroutableDropped.prov.source,
    ).toBe('http.stats');
  });

  it('node: uptime đổi sang giây', () => {
    expect(val(val(a.nodes)[0].uptime)).toBe(3600);
  });

  it('queue và exchange đã sắp theo refKey', () => {
    expect(val(a.queues).map((q) => q.ref.name)).toEqual([
      'request_clamav_q',
      'request_yara_q',
    ]);
    expect(val(a.exchanges).map((x) => x.ref.name)).toEqual([
      '',
      'amq.direct',
      'scan.request',
    ]);
  });

  it('policy rỗng thành null, effective tự kiểm verified', () => {
    const q = val(a.queues)[0];
    expect(val(q.appliedPolicy)).toBeNull();
    expect(q.effectiveCheck).toBe('verified');
    expect(val(q.effective)['queue-type']).toMatchObject({
      value: 'classic',
      layer: 'builtin_default',
    });
  });

  it('binding: bỏ binding của exchange mặc định', () => {
    expect(val(a.bindings)).toHaveLength(2);
    expect(val(a.bindings)[0].ref.argsKey).toBe('');
  });

  it('connection, channel, consumer', () => {
    const c = val(a.connections)[0];
    expect(val(c.connectionName)).toBe('scanner-1');
    expect(val(c.heartbeat)).toBe(60);
    expect(val(c.connectedAt)).toBe('2026-10-04T01:22:09.000Z');
    const ch = val(a.channels);
    expect(ch[0].connection).toBe(CONN);
    expect(val(ch[0].publishCount)).toBe(42);
    const cs = val(a.consumers)[0];
    expect(cs.queue).toEqual({
      kind: 'queue',
      vhost: '/',
      name: 'request_clamav_q',
    });
    expect(val(cs.active)).toBe(true);
  });

  it('chỉ mục', () => {
    const ix = buildIndexes(a);
    expect(
      ix.bindingsBySource({
        kind: 'exchange',
        vhost: '/',
        name: 'scan.request',
      }),
    ).toHaveLength(2);
    expect(
      ix.consumersByQueue({
        kind: 'queue',
        vhost: '/',
        name: 'request_clamav_q',
      }),
    ).toHaveLength(1);
    expect(ix.channelsByConnection(CONN)).toHaveLength(2);
    expect(
      ix.queue({ kind: 'queue', vhost: '/', name: 'request_yara_q' })?.ref.name,
    ).toBe('request_yara_q');
  });
});

describe('ngoại lệ publishCount', () => {
  it('channel chỉ consume, thống kê bật: publishCount = 0', () => {
    const ch = val(build().channels)[1];
    expect(val(ch.publishCount)).toBe(0);
    expect(ch.publishRate).toMatchObject({
      state: 'unknown',
      reason: { kind: 'field_absent' },
    });
  });

  it('thống kê tắt: publishCount unknown source_unavailable', () => {
    const ov = overview();
    delete (ov as Record<string, unknown>).message_stats;
    const a = build({ overview: okRaw(ov, T0) });
    expect(val(a.channels)[1].publishCount).toMatchObject({
      state: 'unknown',
      reason: { kind: 'source_unavailable' },
    });
  });
});

describe('users', () => {
  it('không đọc thì unknown source_unavailable, đọc được thì sắp theo tên', () => {
    expect(build().users).toMatchObject({
      state: 'unknown',
      reason: { kind: 'source_unavailable' },
    });
    const a = build({
      users: okRaw([
        { name: 'b', tags: 'administrator' },
        { name: 'a', tags: ['monitoring'] },
      ]),
    });
    expect(val(a.users)).toEqual([
      { name: 'a', tags: ['monitoring'] },
      { name: 'b', tags: ['administrator'] },
    ]);
    expect(build({ users: httpError(403) }).users).toMatchObject({
      reason: { kind: 'forbidden' },
    });
  });
});

describe('queue rảnh', () => {
  const idle = () => {
    const q = queue('idle');
    delete (q as Record<string, unknown>).message_stats;
    return q;
  };

  it('thống kê bật, không có message_stats: mọi tốc độ là 0', () => {
    const a = build({ queues: okRaw([idle()]) });
    const q = val(a.queues)[0];
    for (const r of [q.publishRate, q.deliverRate, q.redeliverRate])
      expect(val(r).perSecond).toBe(0);
  });

  it('thống kê tắt: tốc độ unknown source_unavailable', () => {
    const ov = overview();
    delete (ov as Record<string, unknown>).message_stats;
    const a = build({ overview: okRaw(ov, T0), queues: okRaw([idle()]) });
    expect(val(a.queues)[0].deliverRate).toMatchObject({
      state: 'unknown',
      reason: { kind: 'source_unavailable' },
    });
  });
});

describe('lý do unknown', () => {
  it('403 ở policy: chỉ policy và effective bị ảnh hưởng', () => {
    const a = build({ policies: httpError(403) });
    expect(a.policies).toMatchObject({
      state: 'unknown',
      reason: { kind: 'forbidden', status: 403 },
    });
    const q = val(a.queues)[0];
    expect(q.effective).toMatchObject({
      state: 'unknown',
      reason: { kind: 'depends_on', reason: { kind: 'forbidden' } },
    });
    expect(q.ready.state).toBe('known');
    expect(a.operatorPolicies.state).toBe('known');
  });

  it('404 ở deprecated features', () => {
    const a = build({ deprecatedUsed: httpError(404) });
    expect(a.broker.deprecatedInUse).toMatchObject({
      state: 'unknown',
      reason: { kind: 'endpoint_missing', status: 404 },
    });
  });

  it('thống kê tắt: trường thống kê source_unavailable, trường danh sách vẫn known', () => {
    const ov = overview();
    delete (ov as Record<string, unknown>).message_stats;
    delete (ov as Record<string, unknown>).churn_rates;
    const q = { ...queue('request_clamav_q') } as Record<string, unknown>;
    delete q.messages_ready;
    delete q.message_stats;
    const a = build({ overview: okRaw(ov, T0), queues: okRaw([q]) });
    expect(a.meta.sources['http.stats']).toBe('unavailable');
    const aq = val(a.queues)[0];
    expect(aq.ready).toMatchObject({
      state: 'unknown',
      reason: { kind: 'source_unavailable' },
    });
    expect(aq.consumers.state).toBe('known');
    expect(a.broker.churn).toMatchObject({
      state: 'unknown',
      reason: { kind: 'source_unavailable' },
    });
  });

  it('Prometheus đóng: bộ đếm rơi về http.stats', () => {
    const a = build({ prometheus: httpError(503) });
    expect(a.meta.sources.prometheus).toBe('unavailable');
    const c = a.broker.counters.unroutableDropped;
    expect(val(c).count).toBe(7);
    expect(c.state === 'known' && c.prov.source).toBe('http.stats');
  });

  it('Prometheus đóng và thống kê tắt: bộ đếm unknown theo nguồn đầu', () => {
    const ov = overview();
    delete (ov as Record<string, unknown>).message_stats;
    const a = build({
      prometheus: { status: 'not_attempted' },
      overview: okRaw(ov, T0),
    });
    expect(a.broker.counters.unroutableDropped).toMatchObject({
      state: 'unknown',
      reason: { kind: 'source_unavailable' },
      source: 'http.stats',
    });
  });

  it('http.stats cần cả message_stats và churn_rates (GC21)', () => {
    const ov = overview();
    delete (ov as Record<string, unknown>).churn_rates;
    const a = build({ overview: okRaw(ov, T0) });
    expect(a.meta.sources['http.stats']).toBe('unavailable');
  });

  describe('bộ đếm từ Prometheus (thống kê tắt)', () => {
    const noStats = () => {
      const ov = overview();
      delete (ov as Record<string, unknown>).message_stats;
      return okRaw(ov, T0);
    };
    const prom = (identity: string | null) =>
      okRaw(
        [
          ...(identity === null
            ? []
            : [
                `rabbitmq_identity_info{rabbitmq_node="${identity}",rabbitmq_cluster="c"} 1`,
              ]),
          'rabbitmq_global_messages_unroutable_dropped_total{protocol="amqp091"} 5',
          'rabbitmq_global_messages_unroutable_returned_total{protocol="amqp091"} 0',
        ].join('\n'),
      );

    it('cluster nhiều node: phạm vi node, completeSince theo uptime của đúng node đó', () => {
      const a = build({ overview: noStats(), prometheus: prom('rabbit@a') });
      const c = a.broker.counters.unroutableDropped;
      expect(val(c)).toEqual({
        count: 5,
        // readStartedAt − 3600 giây (uptime của rabbit@a), không phải 60 giây của rabbit@b.
        completeSince: '2026-10-04T00:22:10.000Z',
        scope: { kind: 'node', node: 'rabbit@a' },
      });
      expect(c.state === 'known' && c.prov.path).toBe(
        'prom:rabbitmq_global_messages_unroutable_dropped_total{rabbitmq_node="rabbit@a"}',
      );
    });

    it('cluster một node: phạm vi cluster', () => {
      const a = build({
        overview: noStats(),
        prometheus: prom(null),
        nodes: okRaw([node('rabbit@a', '4.2.1', 1000)]),
      });
      expect(val(a.broker.counters.unroutableDropped).scope).toEqual({
        kind: 'cluster',
      });
    });

    it('cluster nhiều node mà không biết node trả lời: unknown', () => {
      for (const id of [null, 'rabbit@zzz']) {
        const a = build({ overview: noStats(), prometheus: prom(id) });
        expect(a.broker.counters.unroutableDropped).toMatchObject({
          state: 'unknown',
          reason: { kind: 'error' },
        });
      }
    });
  });

  it('một node thiếu uptime: Counter unknown', () => {
    const n = node('rabbit@b', '4.2.0', 0) as Record<string, unknown>;
    delete n.uptime;
    const a = build({ nodes: okRaw([node('rabbit@a', '4.2.1', 1000), n]) });
    expect(a.broker.counters.unroutableDropped).toMatchObject({
      state: 'unknown',
      reason: { kind: 'depends_on', reason: { kind: 'field_absent' } },
    });
  });

  it('không đọc được node: phiên bản lấy từ overview', () => {
    const a = build({ nodes: httpError(403) });
    expect(val(a.broker.version).raw).toBe('4.2.1');
  });

  it('consumer.active vắng trên bản cũ: field_absent', () => {
    const a = build({
      consumers: okRaw([
        {
          consumer_tag: 'ctag-1',
          channel_details: { name: `${CONN} (2)`, connection_name: CONN },
          queue: { vhost: '/', name: 'request_clamav_q' },
          ack_required: true,
          prefetch_count: 10,
          exclusive: false,
        },
      ]),
    });
    expect(val(a.consumers)[0].active).toMatchObject({
      state: 'unknown',
      reason: { kind: 'field_absent' },
    });
  });
});

describe('effective trong Actual', () => {
  it('model chọn khác broker thì model_mismatch', () => {
    const a = build({
      policies: okRaw([
        policy('scan-dlx', '^request_', { 'dead-letter-exchange': 'dlx' }),
      ]),
      queues: okRaw([
        queue('request_clamav_q', {
          policy: 'catch-all',
          effective_policy_definition: { 'dead-letter-exchange': 'dlx' },
        }),
      ]),
      totalsAtEnd: okRaw(
        overview({
          object_totals: {
            queues: 1,
            exchanges: 3,
            connections: 1,
            channels: 2,
            consumers: 1,
          },
        }),
      ),
    });
    expect(val(a.queues)[0].effective).toMatchObject({
      state: 'unknown',
      reason: {
        kind: 'model_mismatch',
        detail: 'policy: model=scan-dlx broker=catch-all',
      },
    });
  });

  it('quorum queue nhận delivery-limit 20 trên 4.x', () => {
    const a = build({
      queues: okRaw([
        queue('request_clamav_q', { type: 'quorum', members: ['rabbit@a'] }),
        queue('request_yara_q'),
      ]),
    });
    const q = val(a.queues)[0];
    expect(val(q.effective)['delivery-limit']).toMatchObject({
      value: 20,
      layer: 'builtin_default',
    });
    expect(val(q.members)).toEqual(['rabbit@a']);
  });
});

describe('bất thường khi đọc', () => {
  it('trùng khoá giữa hai trang: giữ bản ở trang sau', () => {
    const a = build({
      queues: {
        status: 'ok',
        pages: [
          {
            body: { items: [queue('request_clamav_q', { consumers: 1 })] },
            observedAt: T1,
          },
          {
            body: {
              items: [
                queue('request_clamav_q', { consumers: 9 }),
                queue('request_yara_q'),
              ],
            },
            observedAt: T1,
          },
        ],
      },
    });
    expect(val(val(a.queues)[0].consumers)).toBe(9);
    expect(a.anomalies.map((x) => x.kind)).toEqual(['duplicate_key']);
    expect(a.meta.consistency.queues).toBe('degraded');
  });

  it('page_shift khi đọc ít hơn totals', () => {
    const a = build({ queues: okRaw([queue('request_clamav_q')]) });
    expect(a.anomalies).toContainEqual(
      expect.objectContaining({ kind: 'page_shift', collection: 'queues' }),
    );
  });

  it('loại queue lạ bị bỏ, dangling_ref cho binding trỏ tới nó', () => {
    const a = build({
      queues: okRaw([
        queue('request_clamav_q'),
        queue('request_yara_q', { type: 'mqtt_qos0' }),
      ]),
    });
    expect(val(a.queues)).toHaveLength(1);
    const kinds = a.anomalies.map((x) => x.kind).sort();
    expect(kinds).toEqual(['dangling_ref', 'unsupported_type']);
  });

  it('phần tử hỏng thành malformed_item, không ném', () => {
    const a = build({ exchanges: okRaw([{ name: 1 }, ...([] as unknown[])]) });
    expect(a.anomalies.some((x) => x.kind === 'malformed_item')).toBe(true);
  });
});

describe('phạm vi vhost', () => {
  it('chỉ giữ đối tượng trong vhost được chọn, không kiểm page_shift', () => {
    const a = build(
      {
        queues: okRaw([queue('a'), queue('b', { vhost: 'billing' })]),
        vhosts: okRaw([{ name: '/' }, { name: 'billing' }]),
      },
      ctx({ scope: { vhosts: ['billing'] } }),
    );
    expect(val(a.queues).map((q) => q.ref.vhost)).toEqual(['billing']);
    expect(a.anomalies.filter((x) => x.kind === 'page_shift')).toEqual([]);
  });
});

describe('tất định', () => {
  it('cùng đầu vào dựng hai lần giống từng byte', () => {
    expect(JSON.stringify(buildActual(rawBroker(), ctx()))).toBe(
      JSON.stringify(buildActual(rawBroker(), ctx())),
    );
  });
});
