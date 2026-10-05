import { buildActual } from './build-actual';
import type { Actual } from './actual';
import { type CapabilityTable, DEFAULT_CAPABILITY_TABLE } from './caps';
import type { RawResponses } from './ingest/raw';
import type { Observed } from './observed';
import { ENDPOINT_IDS } from './plan';
import { type Topology, topologyFromActual } from './topology';
import type { Instant } from './units';

// definitions.json xuất từ RabbitMQ (`rabbitmqctl export_definitions`, nút
// Export của management UI) cùng dạng JSON với management API cho vhost,
// exchange, queue, binding, policy. Đổi nó thành `RawResponses` rồi đi qua đúng
// `buildActual`, nên một queue đọc từ file và từ broker được phân tích như nhau.
// Phần file không có (node, connection, thống kê) là `not_attempted`.

export type DefinitionsResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly detail: string } };

export interface DefinitionsContext {
  /** Tên hiển thị của nguồn, thường là tên file. */
  readonly contextName: string;
  readonly at: Instant;
  readonly caps?: CapabilityTable;
}

const SECTIONS: readonly (readonly [keyof RawResponses, string])[] = [
  ['vhosts', 'vhosts'],
  ['exchanges', 'exchanges'],
  ['queues', 'queues'],
  ['bindings', 'bindings'],
  ['policies', 'policies'],
  ['operatorPolicies', 'operator_policies'],
];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `default_queue_type` của vhost: khoá trực tiếp (3.11+) hoặc trong `metadata`. */
function defaultQueueTypes(vhosts: readonly unknown[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const v of vhosts) {
    if (!isObj(v) || typeof v.name !== 'string') continue;
    const meta = isObj(v.metadata) ? v.metadata : {};
    const t = v.default_queue_type ?? meta.default_queue_type;
    if (typeof t === 'string' && t !== 'undefined') out.set(v.name, t);
  }
  return out;
}

/**
 * Queue trong definitions không có trường `type`; kiểu nằm ở `x-queue-type`,
 * hoặc là kiểu mặc định của vhost khi queue được khai báo không có tham số đó.
 */
function withQueueType(
  q: unknown,
  defaults: ReadonlyMap<string, string>,
): unknown {
  if (!isObj(q) || q.type !== undefined) return q;
  const args = isObj(q.arguments) ? q.arguments : {};
  const t =
    args['x-queue-type'] ??
    (typeof q.vhost === 'string' ? defaults.get(q.vhost) : undefined);
  return t === undefined ? q : { ...q, type: t };
}

/**
 * Dựng `Actual` từ definitions.json đã parse.
 * @example actualFromDefinitions(JSON.parse(text), { contextName: 'definitions.json', at })
 */
export function actualFromDefinitions(
  doc: unknown,
  ctx: DefinitionsContext,
): DefinitionsResult<Actual> {
  if (!isObj(doc))
    return { ok: false, error: { detail: 'the file is not a JSON object' } };
  const page = (body: unknown) => ({
    status: 'ok' as const,
    pages: [{ body, observedAt: ctx.at }],
  });
  const lists = new Map<string, unknown[]>();
  for (const [, key] of SECTIONS) {
    const v = doc[key];
    if (v === undefined) lists.set(key, []);
    else if (Array.isArray(v)) lists.set(key, v);
    else return { ok: false, error: { detail: `${key} is not an array` } };
  }
  const defaults = defaultQueueTypes(lists.get('vhosts')!);
  lists.set(
    'queues',
    lists.get('queues')!.map((q) => withQueueType(q, defaults)),
  );

  const raw: Record<string, unknown> = {};
  for (const id of ENDPOINT_IDS) raw[id] = { status: 'not_attempted' };
  for (const [id, key] of SECTIONS) raw[id] = page(lists.get(key));
  const version = doc.rabbitmq_version ?? doc.rabbit_version;
  raw.overview = page({
    product_name: 'RabbitMQ',
    ...(typeof version === 'string' ? { rabbitmq_version: version } : {}),
    object_totals: {
      queues: lists.get('queues')!.length,
      exchanges: lists.get('exchanges')!.length,
      connections: 0,
      channels: 0,
      consumers: 0,
    },
  });
  return {
    ok: true,
    value: buildActual(raw as unknown as RawResponses, {
      contextName: ctx.contextName,
      readStartedAt: ctx.at,
      readFinishedAt: ctx.at,
      scope: { vhosts: 'all' },
      caps: ctx.caps ?? DEFAULT_CAPABILITY_TABLE,
    }),
  };
}

/**
 * Topology từ definitions.json, cho `ocho import --from`. Cùng đường với
 * `topologyFromActual`; mục hỏng thành `anomalies` của `Actual` như khi đọc broker.
 * @example topologyFromDefinitions(JSON.parse(text), { contextName: 'definitions.json', at })
 */
export function topologyFromDefinitions(
  doc: unknown,
  ctx: DefinitionsContext,
): DefinitionsResult<Observed<Topology>> {
  const a = actualFromDefinitions(doc, ctx);
  return a.ok ? { ok: true, value: topologyFromActual(a.value) } : a;
}
