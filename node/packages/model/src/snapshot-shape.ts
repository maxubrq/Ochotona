// Kiểm hình dạng của phần `actual` trong ảnh chụp, trả đường dẫn JSON tới chỗ sai.
import { APPLY_TO, QUEUE_TYPES } from './actual';
import { isArgValue, isInstant, isPlainObject } from './units';

export type Shape = (v: unknown, path: string) => string | null;

const fail = (path: string, expected: string) =>
  `${path}: expected ${expected}`;

export const str: Shape = (v, p) =>
  typeof v === 'string' ? null : fail(p, 'string');
export const num: Shape = (v, p) =>
  typeof v === 'number' && Number.isFinite(v) ? null : fail(p, 'number');
export const bool: Shape = (v, p) =>
  typeof v === 'boolean' ? null : fail(p, 'boolean');
export const instant: Shape = (v, p) =>
  isInstant(v) ? null : fail(p, 'ISO instant');
export const argMap: Shape = (v, p) =>
  isPlainObject(v) && isArgValue(v) ? null : fail(p, 'JSON object');

export const lit =
  (...values: readonly unknown[]): Shape =>
  (v, p) =>
    values.includes(v)
      ? null
      : fail(p, values.map((x) => JSON.stringify(x)).join(' | '));

export const nullable =
  (s: Shape): Shape =>
  (v, p) =>
    v === null ? null : s(v, p);

export const arr =
  (s: Shape): Shape =>
  (v, p) => {
    if (!Array.isArray(v)) return fail(p, 'array');
    for (let i = 0; i < v.length; i++) {
      const e = s(v[i], `${p}[${i}]`);
      if (e) return e;
    }
    return null;
  };

export const record =
  (s: Shape): Shape =>
  (v, p) => {
    if (!isPlainObject(v)) return fail(p, 'object');
    for (const [k, x] of Object.entries(v)) {
      const e = s(x, `${p}.${k}`);
      if (e) return e;
    }
    return null;
  };

/** Object với đúng các khoá đã khai; khoá kết thúc bằng `?` là tuỳ chọn. */
export const obj =
  (fields: Record<string, Shape>): Shape =>
  (v, p) => {
    if (!isPlainObject(v)) return fail(p, 'object');
    const names = Object.keys(fields).map((k) => k.replace(/\?$/, ''));
    for (const k of Object.keys(v))
      if (!names.includes(k)) return `${p}.${k}: unexpected key`;
    for (const [k0, s] of Object.entries(fields)) {
      const optional = k0.endsWith('?');
      const k = optional ? k0.slice(0, -1) : k0;
      if (v[k] === undefined) {
        if (optional) continue;
        return `${p}.${k}: missing`;
      }
      const e = s(v[k], `${p}.${k}`);
      if (e) return e;
    }
    return null;
  };

const SOURCES = lit('http.list', 'http.stats', 'prometheus', 'derived');

const reason: Shape = (v, p) => {
  if (!isPlainObject(v)) return fail(p, 'reason object');
  switch (v.kind) {
    case 'source_unavailable':
    case 'field_absent':
      return obj({ kind: str })(v, p);
    case 'forbidden':
      return obj({ kind: str, status: lit(401, 403) })(v, p);
    case 'endpoint_missing':
      return obj({ kind: str, status: lit(404) })(v, p);
    case 'model_mismatch':
    case 'inconsistent_read':
      return obj({ kind: str, detail: str })(v, p);
    case 'tie':
      return obj({ kind: str, policies: arr(str) })(v, p);
    case 'regex_unsupported':
      return obj({ kind: str, policy: str, pattern: str })(v, p);
    case 'depends_on':
      return obj({ kind: str, path: str, reason })(v, p);
    case 'error':
      return obj({ kind: str, message: str })(v, p);
    default:
      return `${p}.kind: unknown reason kind`;
  }
};

export const observed =
  (s: Shape): Shape =>
  (v, p) => {
    if (!isPlainObject(v)) return fail(p, 'Observed');
    if (v.state === 'known') {
      return obj({
        state: str,
        value: s,
        prov: obj({ source: SOURCES, path: str, observedAt: instant }),
      })(v, p);
    }
    if (v.state === 'unknown')
      return obj({ state: str, reason, source: SOURCES, path: str })(v, p);
    return `${p}.state: expected "known" | "unknown"`;
  };

const version = obj({
  major: num,
  minor: num,
  patch: num,
  'pre?': str,
  raw: str,
});
const rate = obj({ perSecond: num, windowSeconds: num });
const named = (kind: string) => obj({ kind: lit(kind), name: str });
const inVhost = (...kinds: string[]) =>
  obj({ kind: lit(...kinds), vhost: str, name: str });
const sourceState = lit('ok', 'unavailable', 'forbidden', 'not_attempted');

const anyRef: Shape = (v, p) => {
  if (!isPlainObject(v)) return fail(p, 'ref');
  switch (v.kind) {
    case 'broker':
      return obj({ kind: str })(v, p);
    case 'exchange':
    case 'queue':
    case 'policy':
    case 'operator_policy':
      return inVhost(v.kind)(v, p);
    case 'binding':
      return bindingRef(v, p);
    case 'consumer':
      return obj({ kind: str, channel: str, tag: str })(v, p);
    default:
      return named(String(v.kind))(v, p);
  }
};

const bindingRef = obj({
  kind: lit('binding'),
  vhost: str,
  source: str,
  destinationType: lit('queue', 'exchange'),
  destination: str,
  routingKey: str,
  argsKey: str,
});

const policy = obj({
  ref: inVhost('policy', 'operator_policy'),
  pattern: str,
  applyTo: lit(...APPLY_TO),
  priority: num,
  definition: argMap,
});

export const actualBaseShape: Shape = obj({
  meta: obj({
    contextName: str,
    readStartedAt: instant,
    readFinishedAt: instant,
    scope: obj({ vhosts: (v, p) => (v === 'all' ? null : arr(str)(v, p)) }),
    sources: obj({
      'http.list': sourceState,
      'http.stats': sourceState,
      prometheus: sourceState,
    }),
    fromSnapshot: nullable(obj({ takenAt: instant, file: str })),
    consistency: record(lit('ok', 'degraded')),
  }),
  broker: obj({
    productName: observed(str),
    clusterName: observed(str),
    featureFlags: observed(record(lit('enabled', 'disabled', 'unavailable'))),
    deprecatedInUse: observed(arr(str)),
    totals: observed(
      obj({
        queues: num,
        exchanges: num,
        connections: num,
        channels: num,
        consumers: num,
      }),
    ),
    churn: observed(
      obj({
        connectionCreated: rate,
        connectionClosed: rate,
        queueDeclared: rate,
        queueCreated: rate,
        queueDeleted: rate,
      }),
    ),
    reported: obj({
      version: observed(version),
      unroutableDropped: observed(num),
      unroutableReturned: observed(num),
    }),
  }),
  nodes: observed(
    arr(
      obj({
        ref: named('node'),
        running: bool,
        version: observed(version),
        memLimitBytes: observed(num),
        diskFreeLimitBytes: observed(num),
        uptime: observed(num),
      }),
    ),
  ),
  vhosts: observed(
    arr(
      obj({
        ref: named('vhost'),
        defaultQueueType: observed(nullable(lit(...QUEUE_TYPES))),
      }),
    ),
  ),
  exchanges: observed(
    arr(
      obj({
        ref: inVhost('exchange'),
        type: str,
        durable: bool,
        autoDelete: bool,
        internal: bool,
        arguments: argMap,
        appliedPolicy: observed(nullable(str)),
      }),
    ),
  ),
  queues: observed(
    arr(
      obj({
        ref: inVhost('queue'),
        type: lit(...QUEUE_TYPES),
        durable: bool,
        autoDelete: bool,
        exclusive: bool,
        arguments: argMap,
        appliedPolicy: observed(nullable(str)),
        appliedOperatorPolicy: observed(nullable(str)),
        brokerEffectivePolicy: observed(argMap),
        leader: observed(str),
        members: observed(arr(str)),
        consumers: observed(num),
        ready: observed(num),
        unacked: observed(num),
        publishRate: observed(rate),
        deliverRate: observed(rate),
        redeliverRate: observed(rate),
      }),
    ),
  ),
  bindings: observed(arr(obj({ ref: bindingRef, arguments: argMap }))),
  policies: observed(arr(policy)),
  operatorPolicies: observed(arr(policy)),
  connections: observed(
    arr(
      obj({
        ref: named('connection'),
        vhost: str,
        user: str,
        protocol: str,
        heartbeat: observed(num),
        connectionName: observed(nullable(str)),
        clientProduct: observed(nullable(str)),
        peerHost: observed(str),
        connectedAt: observed(instant),
        channelCount: observed(num),
      }),
    ),
  ),
  channels: observed(
    arr(
      obj({
        ref: named('channel'),
        connection: str,
        number: num,
        vhost: str,
        user: str,
        confirm: observed(bool),
        prefetch: observed(num),
        globalPrefetch: observed(num),
        consumerCount: observed(num),
        publishCount: observed(num),
        publishRate: observed(rate),
      }),
    ),
  ),
  consumers: observed(
    arr(
      obj({
        ref: obj({ kind: lit('consumer'), channel: str, tag: str }),
        queue: inVhost('queue'),
        connection: str,
        ackRequired: bool,
        prefetch: num,
        exclusive: bool,
        active: observed(bool),
      }),
    ),
  ),
  whoami: observed(obj({ name: str, tags: arr(str) })),
  anomalies: arr(
    obj({
      kind: lit(
        'duplicate_key',
        'page_shift',
        'dangling_ref',
        'unsupported_type',
        'unexpected_operator_key',
        'malformed_item',
      ),
      collection: str,
      ref: nullable(anyRef),
      detail: str,
    }),
  ),
});
