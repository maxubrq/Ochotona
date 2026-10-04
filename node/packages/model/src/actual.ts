import type { Observed } from './observed';
import type { ObjectRef } from './ref';
import type {
  ArgMap,
  ArgValue,
  Instant,
  Rate,
  Seconds,
  Version,
} from './units';

/** Ảnh của broker tại một khoảng thời gian đọc. Chỉ dựng bằng `buildActual` hoặc `loadSnapshot`. */
export interface Actual {
  readonly meta: ActualMeta;
  readonly broker: BrokerInfo;
  readonly nodes: Observed<readonly Node[]>;
  readonly vhosts: Observed<readonly Vhost[]>;
  readonly exchanges: Observed<readonly Exchange[]>;
  readonly queues: Observed<readonly Queue[]>;
  readonly bindings: Observed<readonly Binding[]>;
  readonly policies: Observed<readonly Policy[]>;
  readonly operatorPolicies: Observed<readonly Policy[]>;
  readonly connections: Observed<readonly Connection[]>;
  readonly channels: Observed<readonly Channel[]>;
  readonly consumers: Observed<readonly Consumer[]>;
  readonly whoami: Observed<Principal>;
  readonly anomalies: readonly ReadAnomaly[];
}

export type CollectionName =
  | 'nodes'
  | 'vhosts'
  | 'exchanges'
  | 'queues'
  | 'bindings'
  | 'policies'
  | 'operatorPolicies'
  | 'connections'
  | 'channels'
  | 'consumers';

export const COLLECTIONS: readonly CollectionName[] = [
  'nodes',
  'vhosts',
  'exchanges',
  'queues',
  'bindings',
  'policies',
  'operatorPolicies',
  'connections',
  'channels',
  'consumers',
];

export type ReadSource = 'http.list' | 'http.stats' | 'prometheus';
export type SourceState = 'ok' | 'unavailable' | 'forbidden' | 'not_attempted';

export interface ActualMeta {
  readonly contextName: string;
  readonly readStartedAt: Instant;
  readonly readFinishedAt: Instant;
  readonly scope: { readonly vhosts: readonly string[] | 'all' };
  readonly sources: Readonly<Record<ReadSource, SourceState>>;
  readonly fromSnapshot: {
    readonly takenAt: Instant;
    readonly file: string;
  } | null;
  /** Theo bộ sưu tập: `degraded` khi bất thường vượt 1% số phần tử. */
  readonly consistency: Readonly<Record<string, 'ok' | 'degraded'>>;
}

export interface BrokerInfo {
  readonly productName: Observed<string>;
  /** Phiên bản nhỏ nhất của các node đọc được; không có thì `reported.version`. */
  readonly version: Observed<Version>;
  readonly clusterName: Observed<string>;
  readonly metadataStore: Observed<'mnesia' | 'khepri'>;
  readonly featureFlags: Observed<
    Readonly<Record<string, 'enabled' | 'disabled' | 'unavailable'>>
  >;
  readonly deprecatedInUse: Observed<readonly string[]>;
  readonly totals: Observed<Totals>;
  readonly counters: {
    readonly unroutableDropped: Observed<Counter>;
    readonly unroutableReturned: Observed<Counter>;
  };
  readonly churn: Observed<Churn>;
  /**
   * Giá trị đọc thô làm đầu vào cho `version` và `counters`. Ảnh chụp chỉ lưu
   * phần này, rồi tính lại phần suy ra khi nạp.
   */
  readonly reported: {
    readonly version: Observed<Version>;
    readonly unroutableDropped: Observed<number>;
    readonly unroutableReturned: Observed<number>;
    /**
     * `rabbitmq_erlang_uptime_seconds` của node trả lời Prometheus. Dự phòng cho
     * `completeSince` của bộ đếm Prometheus khi `/api/nodes` không có uptime
     * (thống kê tắt). Ảnh chụp cũ không có trường này.
     */
    readonly prometheusUptime?: Observed<Seconds>;
  };
}

export interface Totals {
  readonly queues: number;
  readonly exchanges: number;
  readonly connections: number;
  readonly channels: number;
  readonly consumers: number;
}

export interface Counter {
  readonly count: number;
  /** Bộ đếm chắc chắn đầy đủ kể từ thời điểm này (readStartedAt − uptime nhỏ nhất của phạm vi). */
  readonly completeSince: Instant;
  /**
   * `cluster`: tổng của mọi node (`http.stats`, hoặc Prometheus trên cluster một
   * node). `node`: Prometheus chỉ có số của node đang trả lời (GC22), con số là cận dưới.
   */
  readonly scope:
    | { readonly kind: 'cluster' }
    | { readonly kind: 'node'; readonly node: string };
}

export interface Churn {
  readonly connectionCreated: Rate;
  readonly connectionClosed: Rate;
  readonly queueDeclared: Rate;
  readonly queueCreated: Rate;
  readonly queueDeleted: Rate;
}

export interface Node {
  readonly ref: { readonly kind: 'node'; readonly name: string };
  readonly running: boolean;
  readonly version: Observed<Version>;
  readonly memLimitBytes: Observed<number>;
  readonly diskFreeLimitBytes: Observed<number>;
  readonly uptime: Observed<Seconds>;
}

export interface Vhost {
  readonly ref: { readonly kind: 'vhost'; readonly name: string };
  readonly defaultQueueType: Observed<QueueType | null>;
}

export type QueueType = 'classic' | 'quorum' | 'stream';
export const QUEUE_TYPES: readonly QueueType[] = [
  'classic',
  'quorum',
  'stream',
];

export interface Exchange {
  readonly ref: {
    readonly kind: 'exchange';
    readonly vhost: string;
    readonly name: string;
  };
  readonly type: string;
  readonly durable: boolean;
  readonly autoDelete: boolean;
  readonly internal: boolean;
  readonly arguments: ArgMap;
  readonly appliedPolicy: Observed<string | null>;
  readonly effective: Observed<Effective>;
  readonly effectiveCheck: EffectiveCheck;
}

export interface Queue {
  readonly ref: {
    readonly kind: 'queue';
    readonly vhost: string;
    readonly name: string;
  };
  readonly type: QueueType;
  readonly durable: boolean;
  readonly autoDelete: boolean;
  readonly exclusive: boolean;
  readonly arguments: ArgMap;
  readonly appliedPolicy: Observed<string | null>;
  readonly appliedOperatorPolicy: Observed<string | null>;
  /** `effective_policy_definition` do broker tự tính. */
  readonly brokerEffectivePolicy: Observed<ArgMap>;
  readonly effective: Observed<Effective>;
  readonly effectiveCheck: EffectiveCheck;
  readonly leader: Observed<string>;
  /** Chỉ quorum, stream; classic là mảng rỗng. */
  readonly members: Observed<readonly string[]>;
  readonly consumers: Observed<number>;
  readonly ready: Observed<number>;
  readonly unacked: Observed<number>;
  readonly publishRate: Observed<Rate>;
  readonly deliverRate: Observed<Rate>;
  readonly redeliverRate: Observed<Rate>;
}

export type BindingRef = Extract<ObjectRef, { kind: 'binding' }>;

export interface Binding {
  readonly ref: BindingRef;
  readonly arguments: ArgMap;
}

export type ApplyTo =
  | 'all'
  | 'exchanges'
  | 'queues'
  | 'classic_queues'
  | 'quorum_queues'
  | 'streams';
export const APPLY_TO: readonly ApplyTo[] = [
  'all',
  'exchanges',
  'queues',
  'classic_queues',
  'quorum_queues',
  'streams',
];

export interface Policy {
  readonly ref: {
    readonly kind: 'policy' | 'operator_policy';
    readonly vhost: string;
    readonly name: string;
  };
  readonly pattern: string;
  readonly applyTo: ApplyTo;
  readonly priority: number;
  readonly definition: ArgMap;
}

export interface Connection {
  readonly ref: { readonly kind: 'connection'; readonly name: string };
  readonly vhost: string;
  readonly user: string;
  /** 'AMQP 0-9-1', 'MQTT 5-0' */
  readonly protocol: string;
  /** 0 = tắt. */
  readonly heartbeat: Observed<Seconds>;
  readonly connectionName: Observed<string | null>;
  readonly clientProduct: Observed<string | null>;
  readonly peerHost: Observed<string>;
  readonly connectedAt: Observed<Instant>;
  readonly channelCount: Observed<number>;
}

export interface Channel {
  readonly ref: { readonly kind: 'channel'; readonly name: string };
  readonly connection: string;
  readonly number: number;
  readonly vhost: string;
  readonly user: string;
  readonly confirm: Observed<boolean>;
  readonly prefetch: Observed<number>;
  readonly globalPrefetch: Observed<number>;
  readonly consumerCount: Observed<number>;
  /** Từ lúc channel mở; thống kê bật mà API không có thì là 0. */
  readonly publishCount: Observed<number>;
  readonly publishRate: Observed<Rate>;
}

export interface Consumer {
  readonly ref: {
    readonly kind: 'consumer';
    readonly channel: string;
    readonly tag: string;
  };
  readonly queue: {
    readonly kind: 'queue';
    readonly vhost: string;
    readonly name: string;
  };
  readonly connection: string;
  readonly ackRequired: boolean;
  readonly prefetch: number;
  readonly exclusive: boolean;
  readonly active: Observed<boolean>;
}

export interface Principal {
  readonly name: string;
  readonly tags: readonly string[];
}

export type AnomalyKind =
  | 'duplicate_key'
  | 'page_shift'
  | 'dangling_ref'
  | 'unsupported_type'
  | 'unexpected_operator_key'
  | 'malformed_item';

export interface ReadAnomaly {
  readonly kind: AnomalyKind;
  readonly collection: CollectionName;
  readonly ref: ObjectRef | null;
  readonly detail: string;
}

// --- Effective ---

export type Layer =
  | 'argument'
  | 'policy'
  | 'operator_policy'
  | 'vhost_default'
  | 'builtin_default';

export interface Overridden {
  readonly layer: Layer;
  readonly by: string | null;
  readonly value: ArgValue;
  readonly why: 'lower_wins' | 'argument_wins';
}

export interface EffectiveEntry {
  readonly value: ArgValue;
  readonly layer: Layer;
  /** Tên policy, hoặc null. */
  readonly by: string | null;
  readonly overridden: readonly Overridden[];
}

/** Khoá chuẩn, không tiền tố x-. */
export type Effective = Readonly<Record<string, EffectiveEntry>>;
export type EffectiveCheck = 'verified' | 'unverified';

// --- Phần đọc được, trước khi suy ra. Ảnh chụp lưu đúng dạng này. ---

export type ExchangeBase = Omit<Exchange, 'effective' | 'effectiveCheck'>;
export type QueueBase = Omit<Queue, 'effective' | 'effectiveCheck'>;
export type BrokerInfoBase = Omit<
  BrokerInfo,
  'version' | 'metadataStore' | 'counters'
>;

export interface ActualBase extends Omit<
  Actual,
  'broker' | 'exchanges' | 'queues'
> {
  readonly broker: BrokerInfoBase;
  readonly exchanges: Observed<readonly ExchangeBase[]>;
  readonly queues: Observed<readonly QueueBase[]>;
}
