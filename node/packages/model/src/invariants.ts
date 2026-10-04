import { type Actual, COLLECTIONS, type Queue } from './actual';
import {
  type CapabilityTable,
  DEFAULT_CAPABILITY_TABLE,
  capabilitiesFor,
} from './caps';
import { compareStr, refKey } from './ref';

export interface Violation {
  /** INV1…INV7 */
  readonly code: string;
  readonly path: string;
  readonly detail: string;
}

function walk(
  v: unknown,
  path: string,
  visit: (v: unknown, path: string) => void,
): void {
  visit(v, path);
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, visit));
  else if (typeof v === 'object' && v !== null) {
    for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, visit);
  }
}

/**
 * Bất biến của một `Actual`. Vi phạm là lỗi của Ocho, không phải trạng thái broker.
 * `table` dùng cho INV5; mặc định là bảng dựng sẵn.
 */
export function checkInvariants(
  actual: Actual,
  table: CapabilityTable = DEFAULT_CAPABILITY_TABLE,
): readonly Violation[] {
  const out: Violation[] = [];
  const v = (code: string, path: string, detail: string) =>
    out.push({ code, path, detail });

  for (const c of COLLECTIONS) {
    const coll = actual[c];
    if (coll.state !== 'known') continue;
    const keys = coll.value.map((x) => refKey(x.ref));
    const seen = new Set<string>();
    keys.forEach((k, i) => {
      if (seen.has(k)) v('INV1', `${c}[${i}]`, `duplicate ${k}`);
      seen.add(k);
      if (i > 0 && compareStr(keys[i - 1], k) > 0)
        v('INV2', `${c}[${i}]`, `not sorted at ${k}`);
    });
  }

  const { readStartedAt, readFinishedAt } = actual.meta;
  walk(actual, '$', (x, path) => {
    if (typeof x === 'number' && !Number.isFinite(x))
      v('INV7', path, String(x));
    if (
      typeof x === 'object' &&
      x !== null &&
      'prov' in x &&
      (x as { state?: unknown }).state === 'known'
    ) {
      const at = (x as { prov: { observedAt: string } }).prov.observedAt;
      if (at < readStartedAt || at > readFinishedAt)
        v('INV3', path, `observedAt ${at} outside read window`);
    }
  });

  const version = actual.broker.version;
  const caps =
    version.state === 'known' ? capabilitiesFor(table, version.value) : null;
  const queues: readonly Queue[] =
    actual.queues.state === 'known' ? actual.queues.value : [];
  queues.forEach((q, i) => {
    const path = `queues[${i}]`;
    if (!['classic', 'quorum', 'stream'].includes(q.type))
      v('INV4', path, `type ${q.type}`);
    if (q.type === 'quorum' && !q.durable)
      v('INV4', path, 'quorum queue not durable');
    if (q.effective.state !== 'known') return;
    for (const [k, e] of Object.entries(q.effective.value)) {
      if (e.layer !== 'builtin_default') continue;
      const allowed =
        k === 'queue-type' || (caps !== null && k in caps.defaults[q.type]);
      if (!allowed)
        v(
          'INV5',
          `${path}.effective.${k}`,
          `builtin_default not in table for ${q.type}`,
        );
    }
  });
  if (actual.exchanges.state === 'known') {
    actual.exchanges.value.forEach((x, i) => {
      if (x.effective.state !== 'known') return;
      for (const [k, e] of Object.entries(x.effective.value)) {
        if (e.layer === 'builtin_default')
          v(
            'INV5',
            `exchanges[${i}].effective.${k}`,
            'builtin_default on exchange',
          );
      }
    });
  }

  for (const [name, c] of Object.entries(actual.broker.counters)) {
    if (c.state !== 'known') continue;
    if (c.value.count < 0)
      v('INV6', `broker.counters.${name}`, 'negative count');
    if (c.value.completeSince > readStartedAt)
      v('INV6', `broker.counters.${name}`, 'completeSince after readStartedAt');
  }
  return out;
}
