import {
  type BuildContext,
  DEFAULT_CAPABILITY_TABLE,
  type Instant,
  type RawResponses,
  type RawResult,
} from '../src';

export const T0 = '2026-10-04T01:22:10.000Z' as Instant;
export const T1 = '2026-10-04T01:22:11.000Z' as Instant;
export const T2 = '2026-10-04T01:22:14.000Z' as Instant;

export const okRaw = <T>(body: T, observedAt: Instant = T1): RawResult<T> => ({
  status: 'ok',
  pages: [{ body, observedAt }],
});
export const httpError = (code: number): RawResult<never> => ({
  status: 'http_error',
  code,
});

export const ctx = (over: Partial<BuildContext> = {}): BuildContext => ({
  contextName: 'test',
  readStartedAt: T0,
  readFinishedAt: T2,
  scope: { vhosts: 'all' },
  caps: DEFAULT_CAPABILITY_TABLE,
  ...over,
});

export const overview = (over: Record<string, unknown> = {}) => ({
  product_name: 'RabbitMQ',
  rabbitmq_version: '4.2.1',
  cluster_name: 'rabbit@a',
  object_totals: {
    queues: 2,
    exchanges: 3,
    connections: 1,
    channels: 2,
    consumers: 1,
  },
  message_stats: { drop_unroutable: 7, return_unroutable: 1 },
  churn_rates: {
    connection_created_details: { rate: 0.2 },
    connection_closed_details: { rate: 0.1 },
    queue_declared_details: { rate: 0 },
    queue_created_details: { rate: 0 },
    queue_deleted_details: { rate: 0 },
  },
  ...over,
});

export const node = (
  name: string,
  version: string,
  uptimeMs: number,
  over: Record<string, unknown> = {},
) => ({
  name,
  running: true,
  applications: [{ name: 'rabbit', version }],
  mem_limit: 1000,
  disk_free_limit: 50,
  uptime: uptimeMs,
  ...over,
});

export const queue = (name: string, over: Record<string, unknown> = {}) => ({
  vhost: '/',
  name,
  type: 'classic',
  durable: true,
  auto_delete: false,
  exclusive: false,
  arguments: {},
  policy: '',
  operator_policy: '',
  effective_policy_definition: {},
  node: 'rabbit@a',
  consumers: 1,
  messages_ready: 0,
  messages_unacknowledged: 0,
  message_stats: {
    publish_details: { rate: 1 },
    deliver_get_details: { rate: 1 },
    redeliver_details: { rate: 0 },
  },
  ...over,
});

export const exchange = (name: string, over: Record<string, unknown> = {}) => ({
  vhost: '/',
  name,
  type: 'direct',
  durable: true,
  auto_delete: false,
  internal: false,
  arguments: {},
  ...over,
});

export const policy = (
  name: string,
  pattern: string,
  definition: Record<string, unknown>,
  over: Record<string, unknown> = {},
) => ({
  vhost: '/',
  name,
  pattern,
  'apply-to': 'all',
  priority: 0,
  definition,
  ...over,
});

export const CONN = '10.0.0.5:51234 -> 10.0.0.9:5672';

/** Một broker nhỏ, đầy đủ, mọi nguồn bật. */
export function rawBroker(over: Partial<RawResponses> = {}): RawResponses {
  return {
    overview: okRaw(overview(), T0),
    whoami: okRaw({ name: 'monitoring', tags: 'monitoring,management' }),
    nodes: okRaw([
      node('rabbit@a', '4.2.1', 3_600_000),
      node('rabbit@b', '4.2.0', 60_000),
    ]),
    vhosts: okRaw([{ name: '/', default_queue_type: 'undefined' }]),
    featureFlags: okRaw([
      { name: 'khepri_db', state: 'disabled' },
      { name: 'quorum_queue', state: 'enabled' },
    ]),
    deprecatedUsed: okRaw([]),
    exchanges: okRaw([
      exchange(''),
      exchange('amq.direct'),
      exchange('scan.request'),
    ]),
    queues: okRaw([queue('request_clamav_q'), queue('request_yara_q')]),
    bindings: okRaw([
      {
        vhost: '/',
        source: '',
        destination: 'request_clamav_q',
        destination_type: 'queue',
        routing_key: 'request_clamav_q',
        arguments: {},
      },
      {
        vhost: '/',
        source: 'scan.request',
        destination: 'request_clamav_q',
        destination_type: 'queue',
        routing_key: 'request_clamav',
        arguments: {},
      },
      {
        vhost: '/',
        source: 'scan.request',
        destination: 'request_yara_q',
        destination_type: 'queue',
        routing_key: 'request_yara',
        arguments: {},
      },
    ]),
    policies: okRaw([]),
    operatorPolicies: okRaw([]),
    connections: okRaw([
      {
        name: CONN,
        vhost: '/',
        user: 'scanner',
        protocol: 'AMQP 0-9-1',
        timeout: 60,
        client_properties: {
          connection_name: 'scanner-1',
          product: 'amqp-client',
        },
        peer_host: '10.0.0.5',
        connected_at: Date.parse(T0) - 1000,
        channels: 2,
      },
    ]),
    channels: okRaw([
      {
        name: `${CONN} (1)`,
        connection_details: { name: CONN },
        number: 1,
        vhost: '/',
        user: 'scanner',
        confirm: true,
        prefetch_count: 0,
        global_prefetch_count: 0,
        consumer_count: 0,
        message_stats: { publish: 42, publish_details: { rate: 1.5 } },
      },
      {
        name: `${CONN} (2)`,
        connection_details: { name: CONN },
        number: 2,
        vhost: '/',
        user: 'scanner',
        confirm: false,
        prefetch_count: 10,
        global_prefetch_count: 0,
        consumer_count: 1,
      },
    ]),
    consumers: okRaw([
      {
        consumer_tag: 'ctag-1',
        channel_details: { name: `${CONN} (2)`, connection_name: CONN },
        queue: { vhost: '/', name: 'request_clamav_q' },
        ack_required: true,
        prefetch_count: 10,
        exclusive: false,
        active: true,
      },
    ]),
    prometheus: okRaw(
      [
        '# HELP rabbitmq_global_messages_unroutable_dropped_total Total',
        '# TYPE rabbitmq_global_messages_unroutable_dropped_total counter',
        'rabbitmq_global_messages_unroutable_dropped_total{protocol="amqp091"} 5',
        'rabbitmq_global_messages_unroutable_dropped_total{protocol="mqtt311",x="a}b"} 3',
        'rabbitmq_global_messages_unroutable_returned_total{protocol="amqp091"} 0',
      ].join('\n'),
    ),
    totalsAtEnd: okRaw(overview(), T2),
    ...over,
  };
}
