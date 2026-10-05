import type { RawResponses } from './ingest/raw';

/** Tên endpoint, trùng khoá của `RawResponses`. */
export type EndpointId = keyof RawResponses;

export const ENDPOINT_IDS: readonly EndpointId[] = [
  'overview',
  'whoami',
  'nodes',
  'vhosts',
  'featureFlags',
  'deprecatedUsed',
  'exchanges',
  'queues',
  'bindings',
  'policies',
  'operatorPolicies',
  'connections',
  'channels',
  'consumers',
  'prometheus',
  'totalsAtEnd',
];

export interface EndpointRead {
  readonly id: EndpointId;
  /** Các đoạn sau `/api`, chưa encode: `['queues', '/']`. */
  readonly segments: readonly string[];
  readonly paginated: boolean;
  /** `null`: không gửi tham số `columns`, broker trả mọi trường. */
  readonly columns: readonly string[] | null;
  readonly query: Readonly<Record<string, string>>;
  readonly requiresCapability?: 'deprecatedFeaturesUsed';
  /**
   * Khi phạm vi là mọi vhost: broker có ≤ 20 vhost thì đọc endpoint này theo
   * từng vhost (`[...segments, vhost]`), để không response nào quá lớn.
   */
  readonly splitByVhost?: boolean;
  /**
   * Endpoint của một đối tượng (`/api/queues/<vhost>/<tên>`): response là một
   * object, broker gói thành mảng một phần tử; 404 là mảng rỗng.
   */
  readonly single?: boolean;
}

/** Đối tượng duy nhất cần đọc, cho `ocho explain queue|exchange <tên>`. */
export interface ObjectScope {
  readonly kind: 'queue' | 'exchange';
  readonly name: string;
}

export interface ReadScope {
  readonly vhosts: readonly string[] | 'all';
  /** Chỉ hợp lệ khi `vhosts` có đúng một vhost. */
  readonly object?: ObjectScope;
}

export interface ReadPlan {
  readonly identify: readonly EndpointRead[];
  /** Thứ tự có nghĩa: nhỏ và ít đổi trước, thay đổi nhanh nhất đọc sát nhau. */
  readonly inventory: readonly EndpointRead[];
  readonly prometheus: boolean;
  readonly scope: ReadScope;
  /** Đọc lại `/api/overview` sau kiểm kê (`totalsAtEnd`). Không có nghĩa là `true`. */
  readonly totalsAtEnd?: boolean;
}

export interface PlanOptions {
  /** Endpoint kiểm kê cần đọc; mặc định mọi endpoint. Pha nhận diện luôn đủ. */
  readonly requires?: ReadonlySet<EndpointId> | 'all';
  readonly scope?: ReadScope;
  /** Mặc định `true`. */
  readonly prometheus?: boolean;
  /**
   * Đọc `/api/users` (tag của mọi user, cho Q3). Mặc định `false`; CLI chỉ bật
   * khi chạy bằng user quản trị, vì user `monitoring` không đọc được endpoint này.
   */
  readonly users?: boolean;
}

const SORTED = { sort: 'name', sort_reverse: 'false' } as const;

// Cột theo bảng ánh xạ trong docs/spec.md. Tên lồng nhau dùng dấu chấm (GC20).
const COLUMNS = {
  exchanges: [
    'vhost',
    'name',
    'type',
    'durable',
    'auto_delete',
    'internal',
    'arguments',
    'policy',
  ],
  queues: [
    'vhost',
    'name',
    'type',
    'durable',
    'auto_delete',
    'exclusive',
    'arguments',
    'policy',
    'operator_policy',
    'effective_policy_definition',
    'node',
    'members',
    'consumers',
    'messages_ready',
    'messages_unacknowledged',
    'message_stats.publish_details.rate',
    'message_stats.deliver_get_details.rate',
    'message_stats.redeliver_details.rate',
  ],
  bindings: [
    'vhost',
    'source',
    'destination',
    'destination_type',
    'routing_key',
    'arguments',
  ],
  connections: [
    'name',
    'vhost',
    'user',
    'protocol',
    'timeout',
    'client_properties.connection_name',
    'client_properties.product',
    'peer_host',
    'connected_at',
    'channels',
  ],
  channels: [
    'name',
    'connection_details.name',
    'number',
    'vhost',
    'user',
    'confirm',
    'prefetch_count',
    'global_prefetch_count',
    'consumer_count',
    'message_stats.publish',
    'message_stats.publish_details.rate',
  ],
  consumers: [
    'consumer_tag',
    'channel_details.name',
    'channel_details.connection_name',
    'queue.vhost',
    'queue.name',
    'ack_required',
    'prefetch_count',
    'exclusive',
    'active',
  ],
} as const;

function simple(id: EndpointId, ...segments: string[]): EndpointRead {
  return { id, segments, paginated: false, columns: null, query: {} };
}

/** Đường dẫn của endpoint kiểm kê, theo vhost khi `vhost` khác `null`. */
function inventoryRead(id: EndpointId, vhost: string | null): EndpointRead {
  const v = vhost === null ? [] : [vhost];
  switch (id) {
    case 'vhosts':
      return simple('vhosts', 'vhosts');
    case 'users':
      return simple('users', 'users');
    case 'deprecatedUsed':
      return {
        ...simple('deprecatedUsed', 'deprecated-features', 'used'),
        requiresCapability: 'deprecatedFeaturesUsed',
      };
    case 'policies':
      return simple('policies', 'policies', ...v);
    case 'operatorPolicies':
      return simple('operatorPolicies', 'operator-policies', ...v);
    case 'exchanges':
      return {
        id,
        segments: ['exchanges', ...v],
        paginated: true,
        columns: COLUMNS.exchanges,
        query: { ...SORTED, disable_stats: 'true' },
      };
    case 'queues':
      return {
        id,
        segments: ['queues', ...v],
        paginated: true,
        columns: COLUMNS.queues,
        query: SORTED,
      };
    case 'connections':
    case 'channels':
      return {
        id,
        segments: vhost === null ? [id] : ['vhosts', vhost, id],
        paginated: true,
        columns: COLUMNS[id],
        query: SORTED,
      };
    case 'bindings':
    case 'consumers':
      return {
        id,
        segments: [id, ...v],
        paginated: false,
        columns: COLUMNS[id],
        query: {},
        ...(vhost === null ? { splitByVhost: true } : {}),
      };
    default:
      throw new Error(`planRead: ${id} is not an inventory endpoint`);
  }
}

const INVENTORY_ORDER: readonly EndpointId[] = [
  'vhosts',
  'users',
  'policies',
  'operatorPolicies',
  'deprecatedUsed',
  'exchanges',
  'queues',
  'bindings',
  'connections',
  'channels',
  'consumers',
];

/** Endpoint không có dạng theo vhost; luôn đọc một lần cho cả cluster. */
const CLUSTER_WIDE = new Set<EndpointId>(['vhosts', 'users', 'deprecatedUsed']);

/**
 * Kế hoạch đọc một đối tượng: nhận diện chỉ `overview`, `whoami`; kiểm kê là
 * policy, operator policy của vhost (giá trị hiệu lực cần cả hai, kể cả với
 * exchange), chính đối tượng và binding liên quan. Không Prometheus, không đọc
 * lại totals: 6 request.
 */
function objectPlan(vhost: string, o: ObjectScope): ReadPlan {
  const one = (id: EndpointId, ...segments: string[]): EndpointRead => ({
    ...simple(id, ...segments),
    single: true,
  });
  const base = o.kind === 'queue' ? 'queues' : 'exchanges';
  return {
    identify: [simple('overview', 'overview'), simple('whoami', 'whoami')],
    inventory: [
      simple('policies', 'policies', vhost),
      simple('operatorPolicies', 'operator-policies', vhost),
      one(base, base, vhost, o.name),
      // Binding liên quan: đi vào queue; đi ra từ exchange (luật chỉ dùng chiều này).
      o.kind === 'queue'
        ? simple('bindings', 'queues', vhost, o.name, 'bindings')
        : simple('bindings', 'exchanges', vhost, o.name, 'bindings', 'source'),
    ],
    prometheus: false,
    scope: { vhosts: [vhost], object: o },
    totalsAtEnd: false,
  };
}

/**
 * Kế hoạch đọc cho `@ochotona/broker`: endpoint, cột và tham số truy vấn.
 * @example planRead({ scope: { vhosts: ['/'] } }).inventory[1].segments // ['policies', '/']
 * @example planRead({ scope: { vhosts: ['/'], object: { kind: 'queue', name: 'orders' } } })
 */
export function planRead(opts: PlanOptions = {}): ReadPlan {
  const requires = opts.requires ?? 'all';
  const scope = opts.scope ?? { vhosts: 'all' };
  if (scope.object) {
    if (scope.vhosts === 'all' || scope.vhosts.length !== 1)
      throw new Error('planRead: scope.object needs exactly one vhost');
    return objectPlan(scope.vhosts[0], scope.object);
  }
  const inventory: EndpointRead[] = [];
  for (const id of INVENTORY_ORDER) {
    if (id === 'users' && opts.users !== true) continue;
    if (requires !== 'all' && !requires.has(id)) continue;
    if (scope.vhosts === 'all' || CLUSTER_WIDE.has(id)) {
      inventory.push(inventoryRead(id, null));
    } else {
      for (const v of scope.vhosts) inventory.push(inventoryRead(id, v));
    }
  }
  return {
    identify: [
      simple('overview', 'overview'),
      simple('whoami', 'whoami'),
      simple('featureFlags', 'feature-flags'),
      simple('nodes', 'nodes'),
    ],
    inventory,
    prometheus:
      (opts.prometheus ?? true) &&
      (requires === 'all' || requires.has('prometheus')),
    scope,
  };
}
