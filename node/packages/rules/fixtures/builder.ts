// Dựng `RawResponses` tổng hợp cho fixture tầng đơn vị. Fixture không bao giờ
// viết tay `Actual` hay `Effective`: mọi thứ đi qua `model.buildActual`.
//
// Builder tự điền `policy`, `operator_policy` và `effective_policy_definition`
// của queue, exchange như broker thật sẽ báo, bằng chính `resolveEffective`
// của model; `brokerEffective(false)` bỏ trường đó để `Effective` thành
// `unverified`.
import {
  type ApplyTo,
  type ArgMap,
  type Instant,
  type Policy,
  type QueueType,
  type RawResponses,
  type RawResult,
  DEFAULT_CAPABILITY_TABLE,
  capabilitiesFor,
  known,
  parseVersion,
  resolveEffective,
} from '@ochotona/model';

export const T0 = '2026-10-04T01:00:00.000Z' as Instant;
export const T1 = '2026-10-04T01:00:01.000Z' as Instant;
export const T2 = '2026-10-04T01:00:02.000Z' as Instant;

const ok = <T>(body: T, observedAt: Instant = T1): RawResult<T> => ({
  status: 'ok',
  pages: [{ body, observedAt }],
});

type Obj = Record<string, unknown>;

export interface QueueOpts {
  vhost?: string;
  type?: QueueType;
  durable?: boolean;
  autoDelete?: boolean;
  exclusive?: boolean;
  args?: ArgMap;
  consumers?: number;
  ready?: number;
  unacked?: number;
  /** Chuỗi để mô phỏng giá trị hỏng từ API. */
  deliverRate?: number | string;
  redeliverRate?: number;
  /** Bỏ trường thô khỏi phần tử: `consumers`, `messages_ready`, `message_stats`… */
  omit?: string[];
}

export interface PolicyOpts {
  vhost?: string;
  pattern: string;
  applyTo?: ApplyTo;
  priority?: number;
  definition: ArgMap;
}

export interface ConnectionOpts {
  vhost?: string;
  user?: string;
  protocol?: string;
  heartbeat?: number;
  connectionName?: string | null;
  product?: string | null;
}

export interface ChannelOpts {
  confirm?: boolean;
  publish?: number;
  consumers?: number;
  prefetch?: number;
}

export interface ConsumerOpts {
  channel: string;
  queue: string;
  vhost?: string;
  ackRequired?: boolean;
  prefetch?: number;
}

export interface NodeOpts {
  version?: string;
  running?: boolean;
  memLimit?: number;
  diskFreeLimit?: number;
  uptimeMs?: number;
}

export class Builder {
  private queues: { name: string; o: QueueOpts }[] = [];
  private exchanges: {
    name: string;
    vhost: string;
    type: string;
    args: ArgMap;
  }[] = [];
  private bindings: Obj[] = [];
  private policies: Policy[] = [];
  private operatorPolicies: Policy[] = [];
  private connections: Obj[] = [];
  private channels: Obj[] = [];
  private connByName = new Map<string, Obj>();
  private chanByName = new Map<string, Obj>();
  private consumers: Obj[] = [];
  private nodes: Obj[] = [];
  private deprecated: string[] = [];
  private dropped = 0;
  private promDrop: { count: number; node: string } | null = null;
  private churn = { connection: 0, queue: 0 };
  private me = { name: 'monitoring', tags: 'monitoring' };
  private userList: { name: string; tags: string[] }[] | null = null;
  private statsOn = true;
  private reportEffective = true;
  private overrides: Partial<RawResponses> = {};

  constructor(private readonly version: string) {}

  queue(name: string, o: QueueOpts = {}): this {
    this.queues.push({ name, o });
    return this;
  }
  exchange(
    name: string,
    o: { vhost?: string; type?: string; args?: ArgMap } = {},
  ): this {
    this.exchanges.push({
      name,
      vhost: o.vhost ?? '/',
      type: o.type ?? 'direct',
      args: o.args ?? {},
    });
    return this;
  }
  bind(
    source: string,
    destination: string,
    o: { vhost?: string; routingKey?: string; toExchange?: boolean } = {},
  ): this {
    this.bindings.push({
      vhost: o.vhost ?? '/',
      source,
      destination,
      destination_type: o.toExchange ? 'exchange' : 'queue',
      routing_key: o.routingKey ?? '',
      arguments: {},
    });
    return this;
  }
  policy(
    name: string,
    o: PolicyOpts,
    kind: 'policy' | 'operator_policy' = 'policy',
  ): this {
    const p: Policy = {
      ref: { kind, vhost: o.vhost ?? '/', name },
      pattern: o.pattern,
      applyTo: o.applyTo ?? 'all',
      priority: o.priority ?? 0,
      definition: o.definition,
    };
    (kind === 'policy' ? this.policies : this.operatorPolicies).push(p);
    return this;
  }
  connection(name: string, o: ConnectionOpts = {}): this {
    const c: Obj = {
      name,
      vhost: o.vhost ?? '/',
      user: o.user ?? 'app',
      protocol: o.protocol ?? 'AMQP 0-9-1',
      timeout: o.heartbeat ?? 60,
      client_properties: {
        ...(o.connectionName === null
          ? {}
          : { connection_name: o.connectionName ?? name }),
        ...(o.product === null ? {} : { product: o.product ?? 'client' }),
      },
      peer_host: '10.0.0.5',
      connected_at: Date.parse(T0) - 1000,
      channels: 0,
    };
    this.connections.push(c);
    this.connByName.set(name, c);
    return this;
  }
  /** Channel tên `<connection> (<number>)`, user và vhost lấy từ connection. */
  channel(connection: string, number: number, o: ChannelOpts = {}): this {
    const c = this.connByName.get(connection);
    if (!c) throw new Error(`channel: no connection ${connection}`);
    c.channels = (c.channels as number) + 1;
    const ch: Obj = {
      name: `${connection} (${number})`,
      connection_details: { name: connection },
      number,
      vhost: c.vhost,
      user: c.user,
      confirm: o.confirm ?? true,
      prefetch_count: o.prefetch ?? 0,
      global_prefetch_count: 0,
      consumer_count: o.consumers ?? 0,
      message_stats: { publish: o.publish ?? 0, publish_details: { rate: 0 } },
    };
    this.channels.push(ch);
    this.chanByName.set(ch.name as string, ch);
    return this;
  }
  consumer(tag: string, o: ConsumerOpts): this {
    const ch = this.chanByName.get(o.channel);
    if (!ch) throw new Error(`consumer: no channel ${o.channel}`);
    this.consumers.push({
      consumer_tag: tag,
      channel_details: {
        name: o.channel,
        connection_name: (ch.connection_details as Obj).name,
      },
      queue: { vhost: o.vhost ?? '/', name: o.queue },
      ack_required: o.ackRequired ?? true,
      prefetch_count: o.prefetch ?? 10,
      exclusive: false,
      active: true,
    });
    return this;
  }
  node(name: string, o: NodeOpts = {}): this {
    this.nodes.push({
      name,
      running: o.running ?? true,
      applications: [{ name: 'rabbit', version: o.version ?? this.version }],
      mem_limit: o.memLimit ?? 1000,
      disk_free_limit: o.diskFreeLimit ?? 2000,
      uptime: o.uptimeMs ?? 3_600_000,
    });
    return this;
  }
  /** Bộ đếm `drop_unroutable` toàn cluster (overview, http.stats). */
  droppedUnroutable(n: number): this {
    this.dropped = n;
    return this;
  }
  /** Bộ đếm Prometheus của một node; thống kê management tắt để model dùng nguồn này. */
  promDropped(n: number, node: string): this {
    this.promDrop = { count: n, node };
    this.statsOn = false;
    return this;
  }
  deprecatedInUse(...names: string[]): this {
    this.deprecated = names;
    return this;
  }
  churnRates(o: { connection?: number; queue?: number }): this {
    this.churn = { connection: o.connection ?? 0, queue: o.queue ?? 0 };
    return this;
  }
  whoami(name: string, ...tags: string[]): this {
    this.me = { name, tags: tags.join(',') };
    return this;
  }
  /** Danh sách `/api/users` (chỉ đọc khi CLI chạy bằng user quản trị). */
  users(list: Record<string, string[]>): this {
    this.userList = Object.entries(list).map(([name, tags]) => ({
      name,
      tags,
    }));
    return this;
  }
  /** Bộ thu thống kê tắt: overview mất message_stats, channel và consumer trả 400. */
  statsOff(): this {
    this.statsOn = false;
    return this;
  }
  /** Không báo `effective_policy_definition`: `Effective` thành `unverified`. */
  brokerEffective(on: boolean): this {
    this.reportEffective = on;
    return this;
  }
  /** Thay một endpoint bằng lỗi HTTP. */
  httpError(id: keyof RawResponses, code: number): this {
    (this.overrides as Record<string, RawResult>)[id] = {
      status: 'http_error',
      code,
    };
    return this;
  }

  build(): RawResponses {
    const v = parseVersion(this.version);
    if (!v) throw new Error(`bad version ${this.version}`);
    const caps = capabilitiesFor(DEFAULT_CAPABILITY_TABLE, v);
    const prov = {
      source: 'http.list' as const,
      path: 'fixture',
      observedAt: T1,
    };
    const pols = known(this.policies as readonly Policy[], prov);
    const ops = known(this.operatorPolicies as readonly Policy[], prov);
    const brokerSide = (
      ref: { kind: 'exchange' | 'queue'; vhost: string; name: string },
      args: ArgMap,
      queueType?: QueueType,
    ): Obj => {
      const r = resolveEffective(
        {
          ref,
          arguments: args,
          ...(queueType ? { queueType, vhostDefaultQueueType: null } : {}),
        },
        pols,
        ops,
        caps,
      );
      if (!queueType) return { policy: r.chosen.policy ?? '' };
      return {
        policy: r.chosen.policy ?? '',
        operator_policy: r.chosen.operator ?? '',
        ...(this.reportEffective
          ? { effective_policy_definition: r.mergedPolicyDefinition }
          : {}),
      };
    };
    const nodes =
      this.nodes.length > 0
        ? this.nodes
        : new Builder(this.version).node('rabbit@a').nodes;
    const queues = this.queues.map(({ name, o }) => {
      const vhost = o.vhost ?? '/';
      const type = o.type ?? 'classic';
      const args = {
        ...(o.args ?? {}),
        ...(type === 'classic' ? {} : { 'x-queue-type': type }),
      };
      const q: Obj = {
        vhost,
        name,
        type,
        durable: o.durable ?? true,
        auto_delete: o.autoDelete ?? false,
        exclusive: o.exclusive ?? false,
        arguments: args,
        ...brokerSide({ kind: 'queue', vhost, name }, args, type),
        node: nodes[0].name,
        ...(type === 'classic' ? {} : { members: [nodes[0].name] }),
        consumers: o.consumers ?? 0,
        ...(this.statsOn
          ? {
              messages_ready: o.ready ?? 0,
              messages_unacknowledged: o.unacked ?? 0,
              message_stats: {
                publish_details: { rate: 0 },
                deliver_get_details: { rate: o.deliverRate ?? 0 },
                redeliver_details: { rate: o.redeliverRate ?? 0 },
              },
            }
          : {}),
      };
      for (const k of o.omit ?? []) delete q[k];
      return q;
    });
    const exchanges = this.exchanges.map((x) => ({
      vhost: x.vhost,
      name: x.name,
      type: x.type,
      durable: true,
      auto_delete: false,
      internal: false,
      arguments: x.args,
      ...brokerSide({ kind: 'exchange', vhost: x.vhost, name: x.name }, x.args),
    }));
    const vhosts = [
      ...new Set([
        '/',
        ...this.queues.map((q) => q.o.vhost ?? '/'),
        ...this.exchanges.map((x) => x.vhost),
      ]),
    ].map((name) => ({ name, default_queue_type: 'undefined' }));
    const overview = {
      product_name: 'RabbitMQ',
      rabbitmq_version: this.version,
      cluster_name: 'rabbit@a',
      object_totals: {
        queues: queues.length,
        exchanges: exchanges.length,
        connections: this.connections.length,
        channels: this.channels.length,
        consumers: this.consumers.length,
      },
      ...(this.statsOn
        ? {
            message_stats: {
              drop_unroutable: this.dropped,
              return_unroutable: 0,
            },
            churn_rates: {
              connection_created_details: { rate: this.churn.connection },
              connection_closed_details: { rate: 0 },
              queue_declared_details: { rate: this.churn.queue },
              queue_created_details: { rate: this.churn.queue },
              queue_deleted_details: { rate: 0 },
            },
          }
        : {}),
    };
    const rejected: RawResult = { status: 'http_error', code: 400 };
    const prometheus = this.promDrop
      ? ok(
          [
            `rabbitmq_identity_info{rabbitmq_node="${this.promDrop.node}",rabbitmq_cluster="rabbit@a"} 1`,
            `rabbitmq_global_messages_unroutable_dropped_total{protocol="amqp091"} ${this.promDrop.count}`,
            'rabbitmq_erlang_uptime_seconds 3600',
          ].join('\n'),
        )
      : ok('');
    const policyBody = (ps: Policy[]) =>
      ps.map((p) => ({
        vhost: p.ref.vhost,
        name: p.ref.name,
        pattern: p.pattern,
        'apply-to': p.applyTo,
        priority: p.priority,
        definition: p.definition,
      }));
    const activity = this.statsOn || this.promDrop !== null;
    return {
      overview: ok(overview, T0),
      whoami: ok(this.me),
      nodes: ok(nodes),
      vhosts: ok(vhosts),
      featureFlags: ok([]),
      deprecatedUsed: ok(this.deprecated.map((name) => ({ name }))),
      exchanges: ok(exchanges),
      queues: ok(queues),
      bindings: ok(this.bindings),
      policies: ok(policyBody(this.policies)),
      operatorPolicies: ok(policyBody(this.operatorPolicies)),
      connections: ok(this.connections),
      channels: activity ? ok(this.channels) : rejected,
      consumers: activity ? ok(this.consumers) : rejected,
      prometheus,
      totalsAtEnd: ok(overview, T2),
      ...(this.userList ? { users: ok(this.userList) } : {}),
      ...this.overrides,
    };
  }
}

/** Một broker trống ở phiên bản `version`, một node `rabbit@a`. */
export const brokerAt = (version: string): Builder => new Builder(version);
