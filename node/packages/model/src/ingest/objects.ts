// Exchange, queue, binding, policy, connection, channel, consumer.
import {
  APPLY_TO,
  type ApplyTo,
  type Binding,
  type Channel,
  type Connection,
  type Consumer,
  type ExchangeBase,
  type Policy,
  QUEUE_TYPES,
  type QueueBase,
  type QueueType,
} from '../actual';
import { type Observed, known, unknown } from '../observed';
import { argsKey } from '../ref';
import {
  type Instant,
  type Rate,
  type Seconds,
  instantFromMs,
  isPlainObject,
} from '../units';
import { type ParseOutcome, malformed } from './collect';
import {
  type FieldCtx,
  RATE_WINDOW_SECONDS,
  asArgMap,
  asBool,
  asCount,
  asNullableName,
  asRate,
  asString,
  field,
  getPath,
} from './raw';

type Item = Record<string, unknown>;

/** Trường tên policy: vắng hoặc `""` nghĩa là không có policy (đã biết), không phải `unknown`. */
function policyName(
  it: Item,
  key: string,
  fc: FieldCtx,
): Observed<string | null> {
  const path = `http:${fc.endpoint}#${key}`;
  const v = it[key];
  if (v === undefined)
    return known(null, {
      source: 'http.list',
      path,
      observedAt: fc.observedAt,
    });
  return field(it, key, 'http.list', fc, asNullableName);
}

function core(
  it: unknown,
  keys: Record<string, 'string' | 'boolean' | 'number'>,
): Item | string {
  if (!isPlainObject(it)) return 'item is not an object';
  for (const [k, t] of Object.entries(keys)) {
    if (typeof it[k] !== t) return `missing or invalid ${k}`;
  }
  return it;
}

export function parseExchange(
  it0: unknown,
  fc: FieldCtx,
): ParseOutcome<ExchangeBase> {
  const it = core(it0, {
    vhost: 'string',
    name: 'string',
    type: 'string',
    durable: 'boolean',
  });
  if (typeof it === 'string') return malformed(it);
  const args = asArgMap(it.arguments ?? {});
  if (!args) return malformed('invalid arguments');
  return {
    item: {
      ref: {
        kind: 'exchange',
        vhost: it.vhost as string,
        name: it.name as string,
      },
      type: it.type as string,
      durable: it.durable as boolean,
      autoDelete: it.auto_delete === true,
      internal: it.internal === true,
      arguments: args,
      appliedPolicy: policyName(it, 'policy', fc),
    },
  };
}

export function parseQueue(
  it0: unknown,
  fc: FieldCtx,
): ParseOutcome<QueueBase> {
  const it = core(it0, { vhost: 'string', name: 'string', durable: 'boolean' });
  if (typeof it === 'string') return malformed(it);
  const args = asArgMap(it.arguments ?? {});
  if (!args) return malformed('invalid arguments');
  const ref = {
    kind: 'queue',
    vhost: it.vhost as string,
    name: it.name as string,
  } as const;
  const rawType = it.type ?? args['x-queue-type'] ?? 'classic';
  if (!(QUEUE_TYPES as readonly unknown[]).includes(rawType)) {
    return {
      anomaly: {
        kind: 'unsupported_type',
        ref,
        detail: `type ${String(rawType)}`,
      },
    };
  }
  const type = rawType as QueueType;
  const replicated = type !== 'classic';
  const members: Observed<readonly string[]> = replicated
    ? field(it, 'members', 'http.list', fc, (v) =>
        Array.isArray(v) && v.every((x) => typeof x === 'string')
          ? (v as string[])
          : undefined,
      )
    : known([], {
        source: 'http.list',
        path: `http:${fc.endpoint}#members`,
        observedAt: fc.observedAt,
      });
  return {
    item: {
      ref,
      type,
      durable: it.durable as boolean,
      autoDelete: it.auto_delete === true,
      exclusive: it.exclusive === true,
      arguments: args,
      appliedPolicy: policyName(it, 'policy', fc),
      appliedOperatorPolicy: policyName(it, 'operator_policy', fc),
      brokerEffectivePolicy: field(
        it,
        'effective_policy_definition',
        'http.list',
        fc,
        asArgMap,
      ),
      leader: field(it, 'node', 'http.list', fc, asString),
      members,
      consumers: field(it, 'consumers', 'http.list', fc, asCount),
      ready: field(it, 'messages_ready', 'http.stats', fc, asCount),
      unacked: field(it, 'messages_unacknowledged', 'http.stats', fc, asCount),
      publishRate: idleRate(it, 'message_stats.publish_details.rate', fc),
      deliverRate: idleRate(it, 'message_stats.deliver_get_details.rate', fc),
      redeliverRate: idleRate(it, 'message_stats.redeliver_details.rate', fc),
    },
  };
}

/**
 * Tốc độ của queue. Khi thống kê bật, queue chưa có sự kiện nào thì API không
 * có `message_stats` (hoặc không có mục đó): vắng nghĩa là 0, như
 * `publishCount` của channel. Thống kê tắt thì vẫn là `source_unavailable`.
 */
function idleRate(it: unknown, apiPath: string, fc: FieldCtx): Observed<Rate> {
  const o = field(it, apiPath, 'http.stats', fc, asRate);
  if (o.state === 'unknown' && o.reason.kind === 'field_absent')
    return known(
      { perSecond: 0, windowSeconds: RATE_WINDOW_SECONDS },
      { source: 'http.stats', path: o.path, observedAt: fc.observedAt },
    );
  return o;
}

export function parseBinding(it0: unknown): ParseOutcome<Binding> | null {
  const it = core(it0, {
    vhost: 'string',
    source: 'string',
    destination: 'string',
    destination_type: 'string',
    routing_key: 'string',
  });
  if (typeof it === 'string') return malformed(it);
  // Binding ngầm của exchange mặc định.
  if (it.source === '') return null;
  const dt = it.destination_type;
  if (dt !== 'queue' && dt !== 'exchange')
    return malformed(`destination_type ${String(dt)}`);
  const args = asArgMap(it.arguments ?? {});
  if (!args) return malformed('invalid arguments');
  return {
    item: {
      ref: {
        kind: 'binding',
        vhost: it.vhost as string,
        source: it.source as string,
        destinationType: dt,
        destination: it.destination as string,
        routingKey: it.routing_key as string,
        argsKey: argsKey(args),
      },
      arguments: args,
    },
  };
}

export function parsePolicy(kind: 'policy' | 'operator_policy') {
  return (it0: unknown): ParseOutcome<Policy> => {
    const it = core(it0, {
      vhost: 'string',
      name: 'string',
      pattern: 'string',
    });
    if (typeof it === 'string') return malformed(it);
    const applyTo = it['apply-to'] ?? 'all';
    if (!(APPLY_TO as readonly unknown[]).includes(applyTo))
      return malformed(`apply-to ${String(applyTo)}`);
    const priority = it.priority ?? 0;
    if (typeof priority !== 'number' || !Number.isFinite(priority))
      return malformed('invalid priority');
    const definition = asArgMap(it.definition);
    if (!definition) return malformed('invalid definition');
    return {
      item: {
        ref: { kind, vhost: it.vhost as string, name: it.name as string },
        pattern: it.pattern as string,
        applyTo: applyTo as ApplyTo,
        priority,
        definition,
      },
    };
  };
}

export function parseConnection(
  it0: unknown,
  fc: FieldCtx,
): ParseOutcome<Connection> {
  const it = core(it0, { name: 'string', vhost: 'string', user: 'string' });
  if (typeof it === 'string') return malformed(it);
  // Client không gửi là thông tin đã biết.
  const clientProp = (key: string): Observed<string | null> => {
    const path = `http:${fc.endpoint}#client_properties.${key}`;
    const v = getPath(it, `client_properties.${key}`);
    if (v === undefined || v === null)
      return known(null, {
        source: 'http.list',
        path,
        observedAt: fc.observedAt,
      });
    if (typeof v !== 'string')
      return unknown(
        { kind: 'error', message: 'not a string' },
        'http.list',
        path,
      );
    return known(v, { source: 'http.list', path, observedAt: fc.observedAt });
  };
  return {
    item: {
      ref: { kind: 'connection', name: it.name as string },
      vhost: it.vhost as string,
      user: it.user as string,
      protocol: typeof it.protocol === 'string' ? it.protocol : '',
      heartbeat: field(it, 'timeout', 'http.list', fc, (v) =>
        typeof v === 'number' && v >= 0 && Number.isFinite(v)
          ? (v as Seconds)
          : undefined,
      ),
      connectionName: clientProp('connection_name'),
      clientProduct: clientProp('product'),
      peerHost: field(it, 'peer_host', 'http.list', fc, asString),
      connectedAt: field(
        it,
        'connected_at',
        'http.list',
        fc,
        (v): Instant | undefined =>
          typeof v === 'number' && Number.isFinite(v)
            ? instantFromMs(v)
            : undefined,
      ),
      channelCount: field(it, 'channels', 'http.list', fc, asCount),
    },
  };
}

export function parseChannel(
  it0: unknown,
  fc: FieldCtx,
): ParseOutcome<Channel> {
  const it = core(it0, {
    name: 'string',
    number: 'number',
    vhost: 'string',
    user: 'string',
  });
  if (typeof it === 'string') return malformed(it);
  const conn = getPath(it, 'connection_details.name');
  if (typeof conn !== 'string')
    return malformed('missing connection_details.name');
  // Ngoại lệ duy nhất của quy tắc chọn lý do: channel chưa từng publish thì API
  // không có message_stats.publish; khi thống kê bật, vắng nghĩa là 0.
  let publishCount = field(
    it,
    'message_stats.publish',
    'http.stats',
    fc,
    asCount,
  );
  if (
    publishCount.state === 'unknown' &&
    publishCount.reason.kind === 'field_absent'
  ) {
    publishCount = known(0, {
      source: 'http.stats',
      path: publishCount.path,
      observedAt: fc.observedAt,
    });
  }
  return {
    item: {
      ref: { kind: 'channel', name: it.name as string },
      connection: conn,
      number: it.number as number,
      vhost: it.vhost as string,
      user: it.user as string,
      confirm: field(it, 'confirm', 'http.list', fc, asBool),
      prefetch: field(it, 'prefetch_count', 'http.list', fc, asCount),
      globalPrefetch: field(
        it,
        'global_prefetch_count',
        'http.list',
        fc,
        asCount,
      ),
      consumerCount: field(it, 'consumer_count', 'http.list', fc, asCount),
      publishCount,
      publishRate: field(
        it,
        'message_stats.publish_details.rate',
        'http.stats',
        fc,
        asRate,
      ),
    },
  };
}

export function parseConsumer(
  it0: unknown,
  fc: FieldCtx,
): ParseOutcome<Consumer> {
  const it = core(it0, {
    consumer_tag: 'string',
    ack_required: 'boolean',
    exclusive: 'boolean',
  });
  if (typeof it === 'string') return malformed(it);
  const channel = getPath(it, 'channel_details.name');
  const connection = getPath(it, 'channel_details.connection_name');
  const qv = getPath(it, 'queue.vhost');
  const qn = getPath(it, 'queue.name');
  if (typeof channel !== 'string' || typeof connection !== 'string')
    return malformed('missing channel_details');
  if (typeof qv !== 'string' || typeof qn !== 'string')
    return malformed('missing queue');
  const prefetch = it.prefetch_count ?? 0;
  if (asCount(prefetch) === undefined)
    return malformed('invalid prefetch_count');
  return {
    item: {
      ref: { kind: 'consumer', channel, tag: it.consumer_tag as string },
      queue: { kind: 'queue', vhost: qv, name: qn },
      connection,
      ackRequired: it.ack_required as boolean,
      prefetch: prefetch as number,
      exclusive: it.exclusive as boolean,
      active: field(it, 'active', 'http.list', fc, asBool),
    },
  };
}
