// Ngữ pháp `requires`: đường dẫn trường, kiểu của từng trường, và cách phân
// giải một đường dẫn cho một đối tượng. Đây là nơi duy nhất biết quan hệ giữa
// các thực thể; luật không tự đi quan hệ.
import {
  type Actual,
  type ArgMap,
  type ApplyTo,
  type Churn,
  type Connection,
  type Counter,
  type Effective,
  type EffectiveCheck,
  type Indexes,
  type Observed,
  type ObjectKind,
  type ObjectRef,
  type Provenance,
  type QueueType,
  type Rate,
  type Seconds,
  type Version,
  known,
  unknown,
} from '@ochotona/model';

/** Kiểu giá trị của mỗi đường dẫn. Thêm trường là thêm một dòng ở đây và ở `FIELDS`. */
export interface FieldTypes {
  'broker.version': Version;
  'broker.counters.unroutableDropped': Counter;
  'broker.deprecatedInUse': readonly string[];
  'broker.churn': Churn;
  'whoami.name': string;
  'whoami.tags': readonly string[];
  'node.running': boolean;
  'node.version': Version;
  'node.memLimitBytes': number;
  'node.diskFreeLimitBytes': number;
  'exchange.type': string;
  'exchange.effective': Effective;
  'exchange.effectiveCheck': EffectiveCheck;
  'exchange.appliedPolicy': string | null;
  'queue.type': QueueType;
  'queue.durable': boolean;
  'queue.autoDelete': boolean;
  'queue.effective': Effective;
  'queue.effectiveCheck': EffectiveCheck;
  'queue.appliedPolicy': string | null;
  'queue.consumers': number;
  'queue.ready': number;
  'queue.unacked': number;
  'queue.deliverRate': Rate;
  'queue.redeliverRate': Rate;
  'binding.destination': string;
  'channel.connection': string;
  'channel.user': string;
  'channel.confirm': boolean;
  'channel.publishCount': number;
  'channel.consumerCount': number;
  'connection.user': string;
  'connection.protocol': string;
  'connection.heartbeat': Seconds;
  'connection.connectionName': string | null;
  'connection.clientProduct': string | null;
  'consumer.queue': {
    readonly kind: 'queue';
    readonly vhost: string;
    readonly name: string;
  };
  'consumer.connection': string;
  'consumer.ackRequired': boolean;
  'consumer.prefetch': number;
  'policy.pattern': string;
  'policy.applyTo': ApplyTo;
  'policy.priority': number;
  'policy.definition': ArgMap;
  'user.tags': readonly string[];
}

export type FieldPath = keyof FieldTypes;
export type Entity = FieldPath extends `${infer E}.${string}` ? E : never;
type EntityOf<P extends FieldPath> = P extends `${infer E}.${string}`
  ? E
  : never;

/** Một phần tử liên quan: định danh của nó và giá trị của trường. */
export interface Rel<T> {
  /** User không có `ObjectRef`; dùng `{ kind: 'user', name }`. */
  readonly ref: ObjectRef | { readonly kind: 'user'; readonly name: string };
  readonly value: T;
}

type Global = 'broker' | 'whoami';

/** Trường của chính đối tượng hoặc cấp broker: giá trị trần; thực thể liên quan: danh sách. */
export type ValueOf<K extends ObjectKind, P extends FieldPath> =
  EntityOf<P> extends K | Global
    ? FieldTypes[P]
    : readonly Rel<FieldTypes[P]>[];

export type RefOf<K extends ObjectKind> = K extends 'broker'
  ? { readonly kind: 'broker' }
  : K extends 'exchange' | 'queue' | 'policy' | 'operator_policy'
    ? { readonly kind: K; readonly vhost: string; readonly name: string }
    : K extends 'binding'
      ? Extract<ObjectRef, { kind: 'binding' }>
      : K extends 'consumer'
        ? {
            readonly kind: 'consumer';
            readonly channel: string;
            readonly tag: string;
          }
        : { readonly kind: K; readonly name: string };

/**
 * Thứ luật nhìn thấy: `ref` của đối tượng, trường `requires` là giá trị trần,
 * trường `optional` là `Observed`. Trường không khai không có trong view.
 */
export type View<
  K extends ObjectKind,
  R extends readonly FieldPath[],
  O extends readonly FieldPath[],
> = {
  readonly ref: RefOf<K>;
  /** Nguồn gốc của một trường đã khai, cho bằng chứng `observed`. */
  readonly prov: (path: R[number] | O[number]) => Provenance | undefined;
} & { readonly [P in R[number]]: ValueOf<K, P> } & {
  readonly [P in O[number]]: Observed<ValueOf<K, P>>;
};

// ------------------------------------------------------------- phân giải

/** Đối tượng thô của một thực thể (phần tử của bộ sưu tập trong `Actual`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = any;

interface FieldDef {
  /** Đọc trường trên phần tử; trường thường (không `Observed`) lấy nguồn của bộ sưu tập. */
  read(item: Item, coll: Provenance, actual: Actual): Observed<unknown>;
}

const plain =
  (field: string): FieldDef['read'] =>
  (item, coll) =>
    known(item[field], { ...coll, path: `${coll.path}#${field}` });
const obs =
  (field: string): FieldDef['read'] =>
  (item) =>
    item[field];
const brokerField =
  (get: (a: Actual) => Observed<unknown>): FieldDef['read'] =>
  (_item, _coll, a) =>
    get(a);
const whoamiField =
  (field: 'name' | 'tags'): FieldDef['read'] =>
  (_item, _coll, a) =>
    a.whoami.state === 'known'
      ? known(a.whoami.value[field], {
          ...a.whoami.prov,
          path: `${a.whoami.prov.path}#${field}`,
        })
      : a.whoami;

export const FIELDS: Readonly<Record<FieldPath, FieldDef>> = {
  'broker.version': { read: brokerField((a) => a.broker.version) },
  'broker.counters.unroutableDropped': {
    read: brokerField((a) => a.broker.counters.unroutableDropped),
  },
  'broker.deprecatedInUse': {
    read: brokerField((a) => a.broker.deprecatedInUse),
  },
  'broker.churn': { read: brokerField((a) => a.broker.churn) },
  'whoami.name': { read: whoamiField('name') },
  'whoami.tags': { read: whoamiField('tags') },
  'node.running': { read: plain('running') },
  'node.version': { read: obs('version') },
  'node.memLimitBytes': { read: obs('memLimitBytes') },
  'node.diskFreeLimitBytes': { read: obs('diskFreeLimitBytes') },
  'exchange.type': { read: plain('type') },
  'exchange.effective': { read: obs('effective') },
  'exchange.effectiveCheck': { read: plain('effectiveCheck') },
  'exchange.appliedPolicy': { read: obs('appliedPolicy') },
  'queue.type': { read: plain('type') },
  'queue.durable': { read: plain('durable') },
  'queue.autoDelete': { read: plain('autoDelete') },
  'queue.effective': { read: obs('effective') },
  'queue.effectiveCheck': { read: plain('effectiveCheck') },
  'queue.appliedPolicy': { read: obs('appliedPolicy') },
  'queue.consumers': { read: obs('consumers') },
  'queue.ready': { read: obs('ready') },
  'queue.unacked': { read: obs('unacked') },
  'queue.deliverRate': { read: obs('deliverRate') },
  'queue.redeliverRate': { read: obs('redeliverRate') },
  'binding.destination': {
    read: (item, coll) =>
      known(item.ref.destination, {
        ...coll,
        path: `${coll.path}#destination`,
      }),
  },
  'channel.connection': { read: plain('connection') },
  'channel.user': { read: plain('user') },
  'channel.confirm': { read: obs('confirm') },
  'channel.publishCount': { read: obs('publishCount') },
  'channel.consumerCount': { read: obs('consumerCount') },
  'connection.user': { read: plain('user') },
  // Thống kê tắt thì /api/connections không có `protocol`; model để chuỗi rỗng.
  // Rỗng là chưa biết, không phải "không phải AMQP".
  'connection.protocol': {
    read: (item, coll) =>
      item.protocol === ''
        ? unknown(
            { kind: 'field_absent' },
            'http.list',
            `${coll.path}#protocol`,
          )
        : known(item.protocol, { ...coll, path: `${coll.path}#protocol` }),
  },
  'connection.heartbeat': { read: obs('heartbeat') },
  'connection.connectionName': { read: obs('connectionName') },
  'connection.clientProduct': { read: obs('clientProduct') },
  'consumer.queue': { read: plain('queue') },
  'consumer.connection': { read: plain('connection') },
  'consumer.ackRequired': { read: plain('ackRequired') },
  'consumer.prefetch': { read: plain('prefetch') },
  'policy.pattern': { read: plain('pattern') },
  'policy.applyTo': { read: plain('applyTo') },
  'policy.priority': { read: plain('priority') },
  'policy.definition': { read: plain('definition') },
  'user.tags': { read: plain('tags') },
};

/** Bộ sưu tập của mỗi thực thể trong `Actual`. */
export const COLLECTION: Readonly<
  Partial<Record<Entity | ObjectKind, (a: Actual) => Observed<readonly Item[]>>>
> = {
  node: (a) => a.nodes,
  vhost: (a) => a.vhosts,
  exchange: (a) => a.exchanges,
  queue: (a) => a.queues,
  binding: (a) => a.bindings,
  channel: (a) => a.channels,
  connection: (a) => a.connections,
  consumer: (a) => a.consumers,
  policy: (a) => a.policies,
  // Chỉ `known` khi kế hoạch đọc `/api/users` (CLI chạy bằng user quản trị).
  user: (a) => a.users,
};

/** Bảng ở docs/spec.md mục "Ngữ pháp requires". */
export interface Resolver {
  readonly actual: Actual;
  readonly index: Indexes;
  connection(name: string): Connection | undefined;
}

const RELATIONS: Readonly<
  Record<string, (item: Item, r: Resolver) => readonly Item[]>
> = {
  'exchange>binding': (it, r) => r.index.bindingsBySource(it.ref),
  'queue>binding': (it, r) => r.index.bindingsByDestination(it.ref),
  'queue>consumer': (it, r) => r.index.consumersByQueue(it.ref),
  'connection>channel': (it, r) => r.index.channelsByConnection(it.ref.name),
  'channel>connection': (it, r) => present(r.connection(it.connection)),
  'consumer>connection': (it, r) => present(r.connection(it.connection)),
  'consumer>queue': (it, r) => present(r.index.queue(it.queue)),
  'connection>user': (it, r) =>
    r.actual.users.state === 'known'
      ? r.actual.users.value.filter((u) => u.name === it.user)
      : [],
};

/** Thực thể đọc nguyên bộ sưu tập khi không phải đối tượng đang chấm. */
const WHOLE = new Set<string>(['policy', 'node']);

const present = <T>(x: T | undefined): readonly T[] =>
  x === undefined ? [] : [x];

export type PathMode = 'own' | 'global' | 'related' | 'whole';

export function entityOf(path: FieldPath): Entity {
  return path.slice(0, path.indexOf('.')) as Entity;
}

/** Cách một đường dẫn được phân giải cho đối tượng loại `kind`; `null` là không hợp lệ. */
export function modeOf(kind: ObjectKind, path: FieldPath): PathMode | null {
  const e = entityOf(path);
  if (e === kind) return 'own';
  if (e === 'broker' || e === 'whoami') return 'global';
  if (`${kind}>${e}` in RELATIONS) return 'related';
  if (WHOLE.has(e)) return 'whole';
  return null;
}

/** Nguồn gốc dùng cho trường thường của đối tượng broker (không có bộ sưu tập). */
const BROKER_PROV = (a: Actual): Provenance => ({
  source: 'derived',
  path: 'derived:broker',
  observedAt: a.meta.readFinishedAt,
});

/**
 * Phân giải `path` cho `item` (loại `kind`). Trường của thực thể liên quan:
 * bộ sưu tập phải `known` và trường phải `known` ở mọi phần tử liên quan.
 */
export function resolvePath(
  path: FieldPath,
  kind: ObjectKind,
  item: Item,
  r: Resolver,
): Observed<unknown> {
  const mode = modeOf(kind, path);
  const def = FIELDS[path];
  if (mode === 'global') return def.read(null, BROKER_PROV(r.actual), r.actual);
  const e = entityOf(path);
  const coll = (COLLECTION[e] ?? (() => known([item], BROKER_PROV(r.actual))))(
    r.actual,
  );
  if (coll.state === 'unknown') return coll;
  if (mode === 'own') return def.read(item, coll.prov, r.actual);
  if (mode === null) throw new Error(`${path} is not reachable from ${kind}`);
  const items =
    mode === 'whole' ? coll.value : RELATIONS[`${kind}>${e}`](item, r);
  const out: Rel<unknown>[] = [];
  for (const it of items) {
    const v = def.read(it, coll.prov, r.actual);
    if (v.state === 'unknown') return v;
    out.push({
      ref: it.ref ?? { kind: 'user', name: it.name },
      value: v.value,
    });
  }
  return known(out, coll.prov);
}
