// Dựng `Actual` cho test: bản ghi thật trong fixtures/raw, hoặc broker tổng hợp.
// Không viết tay `Actual`; mọi thứ đi qua `model.buildActual`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Actual,
  type ArgMap,
  type Instant,
  type RawResponses,
  type RawResult,
  type Topology,
  DEFAULT_CAPABILITY_TABLE,
  ENDPOINT_IDS,
  buildActual,
  topologyFromActual,
} from '@ochotona/model';

export const T0 = '2026-10-04T01:30:00.000Z' as Instant;
export const T1 = '2026-10-04T01:30:01.000Z' as Instant;
export const T2 = '2026-10-04T01:30:02.000Z' as Instant;

const RAW_ROOT = new URL('../../../fixtures/raw/', import.meta.url).pathname;

/** Bản ghi thật có đủ file (`<label>/<variant>`). */
export function recordings(): string[] {
  if (!existsSync(RAW_ROOT)) return [];
  return readdirSync(RAW_ROOT)
    .flatMap((label) =>
      readdirSync(join(RAW_ROOT, label))
        .filter((v) => existsSync(join(RAW_ROOT, label, v, 'manifest.json')))
        .map((v) => `${label}/${v}`),
    )
    .sort();
}

export function loadRecording(rec: string): Actual {
  const dir = join(RAW_ROOT, rec);
  const json = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const raw = {} as Record<string, RawResult<unknown>>;
  for (const id of ENDPOINT_IDS) {
    if (!existsSync(join(dir, `${id}.json`))) continue;
    const r = json(`${id}.json`) as RawResult<unknown>;
    if (id === 'prometheus' && r.status === 'ok') {
      const text = readFileSync(join(dir, 'prometheus.txt'), 'utf8');
      raw[id] = { ...r, pages: r.pages.map((p) => ({ ...p, body: text })) };
    } else raw[id] = r;
  }
  const times = Object.values(raw).flatMap((r) =>
    r.status === 'ok' ? r.pages.map((p) => p.observedAt) : [],
  );
  times.sort();
  return buildActual(raw as unknown as RawResponses, {
    contextName: rec,
    readStartedAt: times[0],
    readFinishedAt: times[times.length - 1],
    scope: { vhosts: 'all' },
    caps: DEFAULT_CAPABILITY_TABLE,
  });
}

export function topologyOf(actual: Actual): Topology {
  const t = topologyFromActual(actual);
  if (t.state !== 'known') throw new Error('topology unknown');
  return t.value;
}

const ok = <T>(body: T, observedAt: Instant = T1): RawResult<T> => ({
  status: 'ok',
  pages: [{ body, observedAt }],
});

type Obj = Record<string, unknown>;

/** Broker tổng hợp tối thiểu: queue, exchange, binding, policy, tốc độ publish. */
export class Broker {
  private queues: Obj[] = [];
  private exchanges: Obj[] = [];
  private bindings: Obj[] = [];
  private policies: Obj[] = [];

  constructor(private readonly version = '4.2.1') {}

  queue(
    name: string,
    o: {
      vhost?: string;
      type?: 'classic' | 'quorum' | 'stream';
      args?: ArgMap;
      rate?: number;
      durable?: boolean;
    } = {},
  ): this {
    const type = o.type ?? 'classic';
    this.queues.push({
      vhost: o.vhost ?? '/',
      name,
      type,
      durable: o.durable ?? true,
      auto_delete: false,
      exclusive: false,
      arguments: {
        ...(o.args ?? {}),
        ...(type === 'classic' ? {} : { 'x-queue-type': type }),
      },
      policy: '',
      operator_policy: '',
      effective_policy_definition: {},
      node: 'rabbit@a',
      ...(type === 'classic' ? {} : { members: ['rabbit@a'] }),
      consumers: 1,
      messages_ready: 0,
      messages_unacknowledged: 0,
      message_stats: {
        publish_details: { rate: o.rate ?? 0 },
        deliver_get_details: { rate: 0 },
        redeliver_details: { rate: 0 },
      },
    });
    return this;
  }

  exchange(
    name: string,
    type = 'direct',
    vhost = '/',
    args: ArgMap = {},
  ): this {
    this.exchanges.push({
      vhost,
      name,
      type,
      durable: true,
      auto_delete: false,
      internal: false,
      arguments: args,
      policy: '',
    });
    return this;
  }

  bind(
    source: string,
    destination: string,
    routingKey = '',
    o: { vhost?: string; toExchange?: boolean } = {},
  ): this {
    this.bindings.push({
      vhost: o.vhost ?? '/',
      source,
      destination,
      destination_type: o.toExchange ? 'exchange' : 'queue',
      routing_key: routingKey,
      arguments: {},
    });
    return this;
  }

  policy(
    name: string,
    pattern: string,
    definition: ArgMap,
    priority = 0,
    vhost = '/',
  ): this {
    this.policies.push({
      vhost,
      name,
      pattern,
      'apply-to': 'queues',
      priority,
      definition,
    });
    return this;
  }

  /** Queue gắn exchange `exchange` bằng `key`, kèm binding mặc định như broker thật. */
  bound(
    exchange: string,
    queue: string,
    key: string,
    o: Parameters<Broker['queue']>[1] = {},
  ): this {
    return this.queue(queue, o).bind(exchange, queue, key, { vhost: o.vhost });
  }

  raw(): RawResponses {
    const vhosts = [
      ...new Set([
        '/',
        ...this.queues.map((q) => q.vhost as string),
        ...this.exchanges.map((e) => e.vhost as string),
      ]),
    ].map((name) => ({ name, default_queue_type: 'undefined' }));
    const defaults = this.queues.map((q) => ({
      vhost: q.vhost,
      source: '',
      destination: q.name,
      destination_type: 'queue',
      routing_key: q.name,
      arguments: {},
    }));
    const overview = {
      product_name: 'RabbitMQ',
      rabbitmq_version: this.version,
      cluster_name: 'rabbit@a',
      object_totals: {
        queues: this.queues.length,
        exchanges: this.exchanges.length,
        connections: 0,
        channels: 0,
        consumers: 0,
      },
      message_stats: { drop_unroutable: 0, return_unroutable: 0 },
      churn_rates: {
        connection_created_details: { rate: 0 },
        connection_closed_details: { rate: 0 },
        queue_declared_details: { rate: 0 },
        queue_created_details: { rate: 0 },
        queue_deleted_details: { rate: 0 },
      },
    };
    return {
      overview: ok(overview, T0),
      whoami: ok({ name: 'monitoring', tags: 'monitoring' }),
      nodes: ok([
        {
          name: 'rabbit@a',
          running: true,
          applications: [{ name: 'rabbit', version: this.version }],
          mem_limit: 1000,
          disk_free_limit: 50,
          uptime: 3_600_000,
        },
      ]),
      vhosts: ok(vhosts),
      featureFlags: ok([]),
      deprecatedUsed: ok([]),
      exchanges: ok(this.exchanges),
      queues: ok(this.queues),
      bindings: ok([...defaults, ...this.bindings]),
      policies: ok(this.policies),
      operatorPolicies: ok([]),
      connections: ok([]),
      channels: ok([]),
      consumers: ok([]),
      prometheus: ok(''),
      totalsAtEnd: ok(overview, T2),
    };
  }

  actual(contextName = 'test'): Actual {
    return buildActual(this.raw(), {
      contextName,
      readStartedAt: T0,
      readFinishedAt: T2,
      scope: { vhosts: 'all' },
      caps: DEFAULT_CAPABILITY_TABLE,
    });
  }
}

/** Hệ thống quét file của spec: một family `request_{p1}_q`, vài luồng thường. */
export function scanBroker(): Broker {
  return new Broker()
    .exchange('scan.request', 'direct')
    .bound('scan.request', 'request_clamav_q', 'request_clamav', {
      type: 'quorum',
      rate: 120,
    })
    .bound('scan.request', 'request_yara_q', 'request_yara', {
      type: 'quorum',
      rate: 40,
    })
    .bound('scan.request', 'request_pdf_q', 'request_pdf', {
      type: 'quorum',
      rate: 10,
    })
    .exchange('billing', 'topic')
    .bound(
      'billing',
      'billing.invoice.created.email',
      'billing.invoice.created',
      { rate: 5 },
    )
    .bound(
      'billing',
      'billing.invoice.created.ledger',
      'billing.invoice.created',
      { rate: 5 },
    )
    .exchange('audit', 'fanout')
    .bound('audit', 'audit.log', '')
    .exchange('legacy.headers', 'headers')
    .bound('legacy.headers', 'legacy.q', '')
    .queue('on', { rate: 1 });
}
