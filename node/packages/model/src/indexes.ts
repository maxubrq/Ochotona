import type {
  Actual,
  Binding,
  Channel,
  Consumer,
  Exchange,
  Queue,
} from './actual';
import { type ObjectRef, refKey } from './ref';

export interface Indexes {
  bindingsBySource(ref: ObjectRef): readonly Binding[];
  bindingsByDestination(ref: ObjectRef): readonly Binding[];
  consumersByQueue(ref: ObjectRef): readonly Consumer[];
  channelsByConnection(name: string): readonly Channel[];
  exchange(ref: ObjectRef): Exchange | undefined;
  queue(ref: ObjectRef): Queue | undefined;
}

function group<T>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

const valuesOf = <T>(
  o: { state: 'known'; value: readonly T[] } | { state: 'unknown' },
): readonly T[] => (o.state === 'known' ? o.value : []);

/**
 * Tra cứu nhanh trên một `Actual`. Bộ sưu tập `unknown` thì tra cứu trả rỗng;
 * luật phải tự kiểm `Observed` của bộ sưu tập trước khi coi rỗng là "không có".
 */
export function buildIndexes(actual: Actual): Indexes {
  const bindings = valuesOf(actual.bindings);
  const bySource = group(bindings, (b) =>
    refKey({ kind: 'exchange', vhost: b.ref.vhost, name: b.ref.source }),
  );
  const byDest = group(bindings, (b) =>
    refKey({
      kind: b.ref.destinationType,
      vhost: b.ref.vhost,
      name: b.ref.destination,
    }),
  );
  const consumers = group(valuesOf(actual.consumers), (c) => refKey(c.queue));
  const channels = group(valuesOf(actual.channels), (c) => c.connection);
  const exchanges = new Map(
    valuesOf(actual.exchanges).map((x) => [refKey(x.ref), x]),
  );
  const queues = new Map(
    valuesOf(actual.queues).map((x) => [refKey(x.ref), x]),
  );
  return {
    bindingsBySource: (ref) => bySource.get(refKey(ref)) ?? [],
    bindingsByDestination: (ref) => byDest.get(refKey(ref)) ?? [],
    consumersByQueue: (ref) => consumers.get(refKey(ref)) ?? [],
    channelsByConnection: (name) => channels.get(name) ?? [],
    exchange: (ref) => exchanges.get(refKey(ref)),
    queue: (ref) => queues.get(refKey(ref)),
  };
}
