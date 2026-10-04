import {
  type Actual,
  type FlowTarget,
  type ObjectRef,
  type Rate,
  type TopoBinding,
  type Topology,
  argsKey,
  compareStr,
  normalizeTopology,
  refKey,
} from '@ochotona/model';

export interface FlowCandidate {
  readonly name: string;
  readonly vhost: string;
  readonly target: FlowTarget;
  /** Số queue nhận luồng. */
  readonly queues: number;
  /** Lớn nhất trong `publishRate` của các queue; chỉ dùng để xếp câu hỏi. */
  readonly rate: Rate | null;
}

export type UnmanagedReason =
  | 'headers_exchange'
  | 'exchange_to_exchange'
  | 'unsupported_exchange_type'
  | 'no_queue_bindings';

export interface Unmanaged {
  readonly ref: ObjectRef;
  readonly reason: UnmanagedReason;
}

/** Tên luồng dạng `<domain>.<entity>.<event>`: ít nhất ba đoạn, không ký tự đại diện. */
const EVENT_KEY = /^[a-z0-9_-]+(\.[a-z0-9_-]+){2,}$/;

/** Loại của exchange dựng sẵn, khi topology đã bỏ chúng (EX2). */
const BUILTIN_TYPES: Readonly<Record<string, string>> = {
  'amq.direct': 'direct',
  'amq.fanout': 'fanout',
  'amq.topic': 'topic',
  'amq.headers': 'headers',
  'amq.match': 'headers',
  'amq.rabbitmq.trace': 'topic',
};

const vkey = (vhost: string, name: string) => JSON.stringify([vhost, name]);

/** Tốc độ của mỗi queue theo `refKey`, từ `Actual`. */
export function queueRates(actual: Actual | undefined): Map<string, Rate> {
  const out = new Map<string, Rate>();
  if (!actual || actual.queues.state !== 'known') return out;
  for (const q of actual.queues.value)
    if (q.publishRate.state === 'known')
      out.set(refKey(q.ref), q.publishRate.value);
  return out;
}

export function maxRate(
  vhost: string,
  queues: readonly string[],
  rates: ReadonlyMap<string, Rate>,
): Rate | null {
  let best: Rate | null = null;
  for (const name of queues) {
    const r = rates.get(refKey({ kind: 'queue', vhost, name }));
    if (r && (best === null || r.perSecond > best.perSecond)) best = r;
  }
  return best;
}

interface Draft {
  readonly vhost: string;
  readonly exchange: string;
  readonly key: string;
  readonly target: FlowTarget;
  readonly groups: readonly string[];
  /** Tên bước 1, và dạng `<exchange>/<key>` dùng khi còn va. */
  readonly base: string;
  readonly alt: string;
}

const uniqSorted = (xs: Iterable<string>) => [...new Set(xs)].sort(compareStr);

/**
 * Suy danh sách ứng viên luồng, tất định, từ topology. Thứ gì không thành luồng
 * được thì nằm trong `unmanaged` kèm lý do. `actual` (tuỳ chọn) cho tốc độ.
 * @example inferFlows(topology).candidates[0].name // 'billing.invoice.created'
 */
export function inferFlows(
  t: Topology,
  actual?: Actual,
): {
  candidates: readonly FlowCandidate[];
  unmanaged: readonly Unmanaged[];
} {
  const types = new Map<string, string>();
  for (const e of t.exchanges) types.set(vkey(e.vhost, e.name), e.type);
  const n = normalizeTopology(t);
  const typeOf = (vhost: string, name: string) =>
    types.get(vkey(vhost, name)) ?? BUILTIN_TYPES[name];

  const unmanaged: Unmanaged[] = [];
  const bySource = new Map<string, TopoBinding[]>();
  const bound = new Set<string>();
  for (const b of n.bindings) {
    if (b.destinationType === 'exchange') {
      unmanaged.push({
        ref: {
          kind: 'binding',
          vhost: b.vhost,
          source: b.source,
          destinationType: b.destinationType,
          destination: b.destination,
          routingKey: b.routingKey,
          argsKey: argsKey(b.arguments),
        },
        reason: 'exchange_to_exchange',
      });
      continue;
    }
    bound.add(vkey(b.vhost, b.destination));
    const k = vkey(b.vhost, b.source);
    const xs = bySource.get(k) ?? [];
    xs.push(b);
    bySource.set(k, xs);
  }

  const drafts: Draft[] = [];
  const exchanges = new Map<string, { vhost: string; name: string }>();
  for (const e of n.exchanges) exchanges.set(vkey(e.vhost, e.name), e);
  for (const b of n.bindings)
    if (b.destinationType === 'queue')
      exchanges.set(vkey(b.vhost, b.source), {
        vhost: b.vhost,
        name: b.source,
      });
  const outgoing = new Set(n.bindings.map((b) => vkey(b.vhost, b.source)));

  for (const [k, e] of [...exchanges].sort((a, b) => compareStr(a[0], b[0]))) {
    const ref: ObjectRef = { kind: 'exchange', vhost: e.vhost, name: e.name };
    const type = typeOf(e.vhost, e.name);
    const bs = bySource.get(k) ?? [];
    if (type === 'headers') {
      unmanaged.push({ ref, reason: 'headers_exchange' });
      continue;
    }
    if (type !== 'fanout' && type !== 'direct' && type !== 'topic') {
      unmanaged.push({ ref, reason: 'unsupported_exchange_type' });
      continue;
    }
    if (bs.length === 0) {
      if (!outgoing.has(k))
        unmanaged.push({ ref, reason: 'no_queue_bindings' });
      continue;
    }
    if (type === 'fanout') {
      const groups = uniqSorted(bs.map((b) => b.destination));
      drafts.push({
        vhost: e.vhost,
        exchange: e.name,
        key: '',
        target: { kind: 'fanout', exchange: e.name, groups },
        groups,
        base: e.name,
        alt: e.name,
      });
      continue;
    }
    const byKey = new Map<string, Set<string>>();
    for (const b of bs) {
      const set = byKey.get(b.routingKey) ?? new Set();
      set.add(b.destination);
      byKey.set(b.routingKey, set);
    }
    for (const key of [...byKey.keys()].sort(compareStr)) {
      const groups = uniqSorted(byKey.get(key)!);
      const alt = `${e.name}/${key}`;
      drafts.push({
        vhost: e.vhost,
        exchange: e.name,
        key,
        target: { kind: 'binding', exchange: e.name, routingKey: key, groups },
        groups,
        base: EVENT_KEY.test(key) ? key : alt,
        alt,
      });
    }
  }

  for (const q of n.queues) {
    if (bound.has(vkey(q.vhost, q.name))) continue;
    const name = `direct:${q.name}`;
    drafts.push({
      vhost: q.vhost,
      exchange: '',
      key: q.name,
      target: { kind: 'direct', queue: q.name },
      groups: [q.name],
      base: name,
      alt: name,
    });
  }

  drafts.sort(
    (a, b) =>
      compareStr(a.vhost, b.vhost) ||
      compareStr(a.exchange, b.exchange) ||
      compareStr(a.key, b.key),
  );
  const names = resolveNames(drafts);
  const rates = queueRates(actual);
  const candidates = drafts.map((d, i): FlowCandidate => ({
    name: names[i],
    vhost: d.vhost,
    target: d.target,
    queues: d.groups.length,
    rate: maxRate(d.vhost, d.groups, rates),
  }));
  unmanaged.sort((a, b) => compareStr(refKey(a.ref), refKey(b.ref)));
  return { candidates, unmanaged };
}

/**
 * Va tên hai bậc. Cùng tên ở nhiều vhost: thêm `@<vhost>` cho ứng viên không ở
 * `/`. Vẫn va: mọi ứng viên va chuyển sang `<exchange>/<key>`. Lưới cuối
 * (`~2`, `~3`…) chỉ để chắc chắn, khi tên exchange chứa `/` hoặc trùng tên khác.
 */
function resolveNames(ds: readonly Draft[]): string[] {
  const groupBy = (xs: readonly string[]) => {
    const m = new Map<string, number[]>();
    xs.forEach((x, i) => m.set(x, [...(m.get(x) ?? []), i]));
    return m;
  };
  const suffixed = ds.map(() => false);
  const names = ds.map((d) => d.base);
  for (const idx of groupBy(names).values()) {
    if (new Set(idx.map((i) => ds[i].vhost)).size < 2) continue;
    for (const i of idx)
      if (ds[i].vhost !== '/') {
        names[i] = `${ds[i].base}@${ds[i].vhost}`;
        suffixed[i] = true;
      }
  }
  for (const idx of groupBy(names).values()) {
    if (idx.length < 2) continue;
    for (const i of idx)
      names[i] = suffixed[i] ? `${ds[i].alt}@${ds[i].vhost}` : ds[i].alt;
  }
  const seen = new Set<string>();
  return names.map((n) => {
    let name = n;
    for (let k = 2; seen.has(name); k++) name = `${n}~${k}`;
    seen.add(name);
    return name;
  });
}
