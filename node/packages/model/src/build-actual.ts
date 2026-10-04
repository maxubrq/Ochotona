import type {
  Actual,
  ActualBase,
  CollectionName,
  ReadAnomaly,
  Totals,
} from './actual';
import type { CapabilityTable } from './caps';
import { deriveActual } from './derive';
import {
  ingestBroker,
  ingestUsers,
  ingestWhoami,
  parseNode,
  parseVhost,
  sourcesOf,
  totalsOf,
} from './ingest/broker';
import {
  type IngestedList,
  type ParseOutcome,
  ingestList,
} from './ingest/collect';
import {
  parseBinding,
  parseChannel,
  parseConnection,
  parseConsumer,
  parseExchange,
  parsePolicy,
  parseQueue,
} from './ingest/objects';
import type { FieldCtx, RawResponses } from './ingest/raw';
import { emptyButCounted, statsOffGuard } from './ingest/stats-off';
import type { Observed } from './observed';
import { type ObjectRef, refKey } from './ref';
import type { Instant } from './units';

export interface BuildContext {
  contextName: string;
  readStartedAt: Instant;
  readFinishedAt: Instant;
  scope: { vhosts: readonly string[] | 'all' };
  /** Bảng năng lực theo phiên bản (sẽ đến từ @ochotona/spec). */
  caps: CapabilityTable;
}

/**
 * Cửa duy nhất để có một `Actual`. Ánh xạ JSON thô của HTTP API và văn bản
 * Prometheus, rồi làm mọi phép suy ra. Không ném ngoại lệ với dữ liệu xấu:
 * endpoint lỗi thành `unknown`, phần tử hỏng thành bất thường `malformed_item`.
 * @example buildActual(raw, { contextName: 'prod', readStartedAt, readFinishedAt, scope: { vhosts: 'all' }, caps: DEFAULT_CAPABILITY_TABLE })
 */
export function buildActual(raw: RawResponses, ctx: BuildContext): Actual {
  return deriveActual(ingestBase(raw, ctx), ctx.caps);
}

function ingestBase(raw: RawResponses, ctx: BuildContext): ActualBase {
  const sources = sourcesOf(raw);
  const base = { sources };
  const inScope = (vhost: string) =>
    ctx.scope.vhosts === 'all' || ctx.scope.vhosts.includes(vhost);
  const scoped =
    <T extends { readonly ref: ObjectRef }>(
      parse: (it: unknown, fc: FieldCtx) => ParseOutcome<T> | null,
      vhostOf: (t: T) => string,
    ) =>
    (it: unknown, fc: FieldCtx) => {
      const out = parse(it, fc);
      if (out && 'item' in out && !inScope(vhostOf(out.item))) return null;
      return out;
    };
  const list = <T extends { readonly ref: ObjectRef }>(
    collection: CollectionName,
    endpoint: string,
    parse: (it: unknown, fc: FieldCtx) => ParseOutcome<T> | null,
  ): IngestedList<T> =>
    ingestList(
      raw[collection],
      endpoint,
      collection,
      base,
      ctx.readStartedAt,
      parse,
    );
  const vh = (x: { ref: { vhost: string } }) => x.ref.vhost;

  // CL2: danh sách rỗng không đáng tin thì thành unknown, không bao giờ thành [].
  const guard = <T>(
    collection:
      'exchanges' | 'queues' | 'connections' | 'channels' | 'consumers',
    endpoint: string,
    l: IngestedList<T>,
  ): IngestedList<T> => {
    const replaced =
      (collection === 'connections' ||
      collection === 'channels' ||
      collection === 'consumers'
        ? statsOffGuard<T>(
            collection,
            raw[collection],
            raw.overview,
            sources,
            ctx.caps,
          )
        : null) ??
      (ctx.scope.vhosts === 'all'
        ? emptyButCounted(
            collection,
            l.list,
            l.readCount,
            raw.overview,
            endpoint,
          )
        : null);
    return replaced ? { ...l, list: replaced } : l;
  };
  const nodes = list('nodes', '/api/nodes', parseNode);
  const vhosts = list(
    'vhosts',
    '/api/vhosts',
    scoped(parseVhost, (v) => v.ref.name),
  );
  const exchanges = guard(
    'exchanges',
    '/api/exchanges',
    list('exchanges', '/api/exchanges', scoped(parseExchange, vh)),
  );
  const queues = guard(
    'queues',
    '/api/queues',
    list('queues', '/api/queues', scoped(parseQueue, vh)),
  );
  const bindings = list('bindings', '/api/bindings', scoped(parseBinding, vh));
  const policies = list(
    'policies',
    '/api/policies',
    scoped(parsePolicy('policy'), vh),
  );
  const operatorPolicies = list(
    'operatorPolicies',
    '/api/operator-policies',
    scoped(parsePolicy('operator_policy'), vh),
  );
  const connections = guard(
    'connections',
    '/api/connections',
    list(
      'connections',
      '/api/connections',
      scoped(parseConnection, (c) => c.vhost),
    ),
  );
  const channels = guard(
    'channels',
    '/api/channels',
    list(
      'channels',
      '/api/channels',
      scoped(parseChannel, (c) => c.vhost),
    ),
  );
  const consumers = guard(
    'consumers',
    '/api/consumers',
    list(
      'consumers',
      '/api/consumers',
      scoped(parseConsumer, (c) => c.queue.vhost),
    ),
  );

  const anomalies: ReadAnomaly[] = [
    nodes,
    vhosts,
    exchanges,
    queues,
    bindings,
    policies,
    operatorPolicies,
    connections,
    channels,
    consumers,
  ].flatMap((l) => l.anomalies);

  // page_shift: totals chỉ có ý nghĩa khi đọc mọi vhost.
  if (ctx.scope.vhosts === 'all') {
    const start = totalsOf(raw.overview);
    const end = totalsOf(raw.totalsAtEnd);
    const checks: [
      CollectionName,
      keyof Totals,
      IngestedList<unknown & { ref: ObjectRef }>,
    ][] = [
      ['exchanges', 'exchanges', exchanges],
      ['queues', 'queues', queues],
      ['connections', 'connections', connections],
      ['channels', 'channels', channels],
      ['consumers', 'consumers', consumers],
    ];
    if (start && end) {
      for (const [collection, key, l] of checks) {
        if (l.list.state !== 'known') continue;
        const expected = Math.min(start[key], end[key]);
        if (l.readCount < expected) {
          anomalies.push({
            kind: 'page_shift',
            collection,
            ref: null,
            detail: `expected at least ${expected}, read ${l.readCount}`,
          });
        }
      }
    }
  }

  anomalies.push(
    ...danglingRefs(
      exchanges.list,
      queues.list,
      bindings.list,
      connections.list,
      channels.list,
      consumers.list,
    ),
  );

  return {
    meta: {
      contextName: ctx.contextName,
      readStartedAt: ctx.readStartedAt,
      readFinishedAt: ctx.readFinishedAt,
      scope: {
        vhosts: ctx.scope.vhosts === 'all' ? 'all' : [...ctx.scope.vhosts],
      },
      sources,
      fromSnapshot: null,
      consistency: {},
    },
    broker: ingestBroker(raw, sources),
    nodes: nodes.list,
    vhosts: vhosts.list,
    exchanges: exchanges.list,
    queues: queues.list,
    bindings: bindings.list,
    policies: policies.list,
    operatorPolicies: operatorPolicies.list,
    connections: connections.list,
    channels: channels.list,
    consumers: consumers.list,
    whoami: ingestWhoami(raw.whoami),
    users: ingestUsers(raw.users),
    anomalies,
  };
}

type Listed<T> = Observed<readonly T[]>;

function keysOf(o: Listed<{ ref: ObjectRef }>): Set<string> | null {
  return o.state === 'known'
    ? new Set(o.value.map((x) => refKey(x.ref)))
    : null;
}

/** Liên kết trỏ tới đối tượng không có trong danh sách. Chi tiết không chứa tên, để che được. */
function danglingRefs(
  exchanges: ActualBase['exchanges'],
  queues: ActualBase['queues'],
  bindings: ActualBase['bindings'],
  connections: ActualBase['connections'],
  channels: ActualBase['channels'],
  consumers: ActualBase['consumers'],
): ReadAnomaly[] {
  const out: ReadAnomaly[] = [];
  const ex = keysOf(exchanges);
  const qs = keysOf(queues);
  const conns = keysOf(connections);
  const chans = keysOf(channels);
  const has = (set: Set<string> | null, ref: ObjectRef) =>
    set === null || set.has(refKey(ref));
  if (bindings.state === 'known') {
    for (const b of bindings.value) {
      const { vhost } = b.ref;
      if (!has(ex, { kind: 'exchange', vhost, name: b.ref.source })) {
        out.push({
          kind: 'dangling_ref',
          collection: 'bindings',
          ref: b.ref,
          detail: 'source exchange not found',
        });
      }
      const dest: ObjectRef = {
        kind: b.ref.destinationType,
        vhost,
        name: b.ref.destination,
      };
      if (!has(b.ref.destinationType === 'queue' ? qs : ex, dest)) {
        out.push({
          kind: 'dangling_ref',
          collection: 'bindings',
          ref: b.ref,
          detail: `destination ${b.ref.destinationType} not found`,
        });
      }
    }
  }
  if (channels.state === 'known') {
    for (const c of channels.value) {
      if (!has(conns, { kind: 'connection', name: c.connection })) {
        out.push({
          kind: 'dangling_ref',
          collection: 'channels',
          ref: c.ref,
          detail: 'connection not found',
        });
      }
    }
  }
  if (consumers.state === 'known') {
    for (const c of consumers.value) {
      if (!has(qs, c.queue)) {
        out.push({
          kind: 'dangling_ref',
          collection: 'consumers',
          ref: c.ref,
          detail: 'queue not found',
        });
      }
      if (!has(chans, { kind: 'channel', name: c.ref.channel })) {
        out.push({
          kind: 'dangling_ref',
          collection: 'consumers',
          ref: c.ref,
          detail: 'channel not found',
        });
      }
    }
  }
  return out;
}
