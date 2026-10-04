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
}

export interface ReadPlan {
  readonly identify: readonly EndpointRead[];
  /** Thứ tự có nghĩa: nhỏ và ít đổi trước, thay đổi nhanh nhất đọc sát nhau. */
  readonly inventory: readonly EndpointRead[];
  readonly prometheus: boolean;
  readonly scope: { readonly vhosts: readonly string[] | 'all' };
}

export interface PlanOptions {
  /** Endpoint kiểm kê cần đọc; mặc định mọi endpoint. Pha nhận diện luôn đủ. */
  readonly requires?: ReadonlySet<EndpointId> | 'all';
  readonly scope?: { readonly vhosts: readonly string[] | 'all' };
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
 * Kế hoạch đọc cho `@ochotona/broker`: endpoint, cột và tham số truy vấn.
 * @example planRead({ scope: { vhosts: ['/'] } }).inventory[1].segments // ['policies', '/']
 */
export function planRead(opts: PlanOptions = {}): ReadPlan {
  const requires = opts.requires ?? 'all';
  const scope = opts.scope ?? { vhosts: 'all' };
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
