// Phần thuần của import lại: phủ luồng, thành viên mới, luồng mất đối tượng, in thay đổi.
import {
  type Actual,
  type ArgValue,
  type Change,
  type Desired,
  type Family,
  type FlowTarget,
  type TopoQueue,
  buildFlowMap,
  matchTemplate,
  refKey,
  refLabel,
  renderTemplate,
  stableJson,
} from '@ochotona/model';

/** Bộ (vhost, exchange, routing key, queue) mà một luồng nhận, dạng chuỗi để so. */
export const tupleKey = (
  vhost: string,
  exchange: string,
  routingKey: string,
  queue: string,
): string => JSON.stringify([vhost, exchange, routingKey, queue]);

/**
 * Bộ của một family. Tĩnh: mỗi thành viên điền vào mọi tham số. `registry`:
 * mỗi queue trong broker khớp mẫu, với đúng giá trị tách được.
 */
export function familyTuples(
  f: Family,
  queues: readonly TopoQueue[],
): { queue: string; tuple: string }[] {
  const values: Record<string, string>[] = [];
  if (f.members === 'registry') {
    for (const q of queues) {
      if (q.vhost !== f.vhost) continue;
      const v = matchTemplate(f.queue, q.name);
      if (v) values.push(v);
    }
  } else
    for (const m of f.members)
      values.push(Object.fromEntries(f.queue.params.map((p) => [p, m])));
  return values.map((v) => {
    const queue = renderTemplate(f.queue, v);
    return {
      queue,
      tuple: tupleKey(
        f.vhost,
        f.exchange,
        renderTemplate(f.routingKey, v),
        queue,
      ),
    };
  });
}

/** Bộ mà một dạng đích nhận, kèm tên queue của từng bộ. */
export function targetTuples(
  vhost: string,
  t: FlowTarget,
  families: Readonly<Record<string, Family>>,
  queues: readonly TopoQueue[],
): { queue: string; tuple: string }[] {
  switch (t.kind) {
    case 'binding':
      return t.groups.map((g) => ({
        queue: g,
        tuple: tupleKey(vhost, t.exchange, t.routingKey, g),
      }));
    case 'fanout':
      return t.groups.map((g) => ({
        queue: g,
        tuple: tupleKey(vhost, t.exchange, '', g),
      }));
    case 'direct':
      return [{ queue: t.queue, tuple: tupleKey(vhost, '', t.queue, t.queue) }];
    case 'family': {
      const f = families[t.family];
      return f ? familyTuples(f, queues) : [];
    }
  }
}

/** Exchange của một dạng đích; `''` là exchange mặc định. */
export function targetExchange(
  t: FlowTarget,
  families: Readonly<Record<string, Family>>,
): string {
  switch (t.kind) {
    case 'binding':
    case 'fanout':
      return t.exchange;
    // Stryker disable next-line ConditionalExpression: rơi xuống nhánh family cũng trả ''
    case 'direct':
      return '';
    case 'family':
      return families[t.family]?.exchange ?? '';
  }
}

/** Luồng mà mọi đối tượng đã biến khỏi broker. */
export function vanishedFlows(desired: Desired, actual: Actual): string[] {
  const map = buildFlowMap(desired, actual);
  const missing = new Set(map.missing.map(refKey));
  return Object.keys(desired.flows).filter((name) => {
    const m = map.membersOf(name);
    const refs = [...m.exchanges, ...m.queues, ...m.bindings];
    return refs.every((r) => missing.has(refKey(r)));
  });
}

/** Thành viên tĩnh không còn queue tương ứng trong broker. */
export function missingMembers(
  f: Family,
  queues: readonly TopoQueue[],
): string[] {
  if (f.members === 'registry') return [];
  const present = new Set(
    queues.filter((q) => q.vhost === f.vhost).map((q) => q.name),
  );
  return f.members.filter((m) => {
    const values = Object.fromEntries(f.queue.params.map((p) => [p, m]));
    return !present.has(renderTemplate(f.queue, values));
  });
}

const show = (v: ArgValue | undefined): string =>
  v === undefined ? '(none)' : typeof v === 'string' ? v : stableJson(v);

/**
 * Một dòng cho mỗi thay đổi topology.
 * @example formatChange(c) // '~ queue orders: arguments.x-max-length 1000 → 5000'
 */
export function formatChange(c: Change): string {
  const label = refLabel(c.ref);
  if (c.op === 'add') return `+ ${label}`;
  if (c.op === 'remove') return `- ${label}`;
  const fields = c.fields
    .map((f) => `${f.path.join('.')} ${show(f.before)} → ${show(f.after)}`)
    .join(', ');
  return `~ ${label}: ${fields}`;
}

/** Luồng mới chỉ còn phần chưa được luồng nào phủ; `null` khi đã phủ hết. */
export function uncovered(
  vhost: string,
  t: FlowTarget,
  covered: ReadonlySet<string>,
): FlowTarget | null {
  switch (t.kind) {
    case 'binding': {
      const groups = t.groups.filter(
        (g) => !covered.has(tupleKey(vhost, t.exchange, t.routingKey, g)),
      );
      return groups.length === 0 ? null : { ...t, groups };
    }
    case 'fanout': {
      const groups = t.groups.filter(
        (g) => !covered.has(tupleKey(vhost, t.exchange, '', g)),
      );
      return groups.length === 0 ? null : { ...t, groups };
    }
    case 'direct':
      return covered.has(tupleKey(vhost, '', t.queue, t.queue)) ? null : t;
    case 'family':
      return t;
  }
}
