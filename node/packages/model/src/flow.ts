import type { Actual } from './actual';
import type { Desired, Family, Flow, Tolerance } from './desired';
import type { UnknownReason } from './observed';
import { type ObjectRef, compareStr, refKey, sortByRefKey } from './ref';
import { matchTemplate, renderTemplate } from './template';

export interface FlowMembers {
  readonly exchanges: readonly ObjectRef[];
  readonly queues: readonly ObjectRef[];
  readonly bindings: readonly ObjectRef[];
}

export interface FlowMap {
  /** Sắp theo tên. */
  flowsOf(ref: ObjectRef): readonly string[];
  toleranceOf(ref: ObjectRef): Tolerance;
  membersOf(flow: string): FlowMembers;
  /** Có trong Desired, vắng trong Actual. */
  readonly missing: readonly ObjectRef[];
  /** Khác null khi không kiểm đủ `missing`. */
  readonly incomplete: UnknownReason | null;
}

/** Gộp dung sai: `strict` > `undeclared` > `loose`; không thuộc luồng nào thì `undeclared`. */
export function combineTolerance(ts: readonly Tolerance[]): Tolerance {
  if (ts.includes('strict')) return 'strict';
  if (ts.includes('undeclared') || ts.length === 0) return 'undeclared';
  return 'loose';
}

const binding = (
  vhost: string,
  source: string,
  queue: string,
  routingKey: string,
): ObjectRef => ({
  kind: 'binding',
  vhost,
  source,
  destinationType: 'queue',
  destination: queue,
  routingKey,
  argsKey: '',
});

function expand(
  flow: Flow,
  families: Readonly<Record<string, Family>>,
  actual: Actual,
): { members: FlowMembers; incomplete: UnknownReason | null } {
  const t = flow.target;
  const exchanges: ObjectRef[] = [];
  const queues: ObjectRef[] = [];
  const bindings: ObjectRef[] = [];
  let incomplete: UnknownReason | null = null;
  const q = (vhost: string, name: string): ObjectRef => ({
    kind: 'queue',
    vhost,
    name,
  });
  switch (t.kind) {
    case 'binding':
    case 'fanout': {
      const rk = t.kind === 'binding' ? t.routingKey : '';
      exchanges.push({ kind: 'exchange', vhost: flow.vhost, name: t.exchange });
      for (const g of t.groups) {
        queues.push(q(flow.vhost, g));
        bindings.push(binding(flow.vhost, t.exchange, g, rk));
      }
      break;
    }
    case 'direct':
      queues.push(q(flow.vhost, t.queue));
      break;
    case 'family': {
      const f = families[t.family];
      if (!f) break;
      exchanges.push({ kind: 'exchange', vhost: f.vhost, name: f.exchange });
      const add = (values: Record<string, string>) => {
        const name = renderTemplate(f.queue, values);
        queues.push(q(f.vhost, name));
        bindings.push(
          binding(
            f.vhost,
            f.exchange,
            name,
            renderTemplate(f.routingKey, values),
          ),
        );
      };
      if (f.members === 'registry') {
        if (actual.queues.state === 'unknown') {
          incomplete = {
            kind: 'depends_on',
            path: actual.queues.path,
            reason: actual.queues.reason,
          };
        } else {
          for (const aq of actual.queues.value) {
            if (aq.ref.vhost !== f.vhost) continue;
            const values = matchTemplate(f.queue, aq.ref.name);
            if (values) add(values);
          }
        }
      } else {
        for (const m of f.members)
          add(Object.fromEntries(f.queue.params.map((p) => [p, m])));
      }
      break;
    }
  }
  return { members: { exchanges, queues, bindings }, incomplete };
}

/**
 * Mở mỗi luồng thành đối tượng cụ thể; trả lời đối tượng thuộc luồng nào và dung sai
 * của nó. Không có `ocho.yaml` (`desired = null`) thì mọi đối tượng là `undeclared`.
 */
export function buildFlowMap(desired: Desired | null, actual: Actual): FlowMap {
  const members = new Map<string, FlowMembers>();
  const flowsByKey = new Map<string, Set<string>>();
  const flows = desired
    ? Object.values(desired.flows).sort((a, b) => compareStr(a.name, b.name))
    : [];
  let incomplete: UnknownReason | null = null;
  for (const flow of flows) {
    const r = expand(flow, desired!.families, actual);
    members.set(flow.name, r.members);
    incomplete ??= r.incomplete;
    for (const ref of [
      ...r.members.exchanges,
      ...r.members.queues,
      ...r.members.bindings,
    ]) {
      const k = refKey(ref);
      const set = flowsByKey.get(k) ?? new Set();
      set.add(flow.name);
      flowsByKey.set(k, set);
    }
  }

  const tolerance = (names: Iterable<string>) =>
    combineTolerance([...names].map((n) => desired!.flows[n].tolerance));
  const flowsOfKey = (k: string) =>
    [...(flowsByKey.get(k) ?? [])].sort(compareStr);

  const userFlows = new Map<string, Set<string>>();
  for (const s of desired ? Object.values(desired.services) : []) {
    const set = userFlows.get(s.user) ?? new Set();
    s.flows.forEach((f) => set.add(f));
    userFlows.set(s.user, set);
  }
  const connUser = new Map<string, string>();
  if (actual.connections.state === 'known') {
    for (const c of actual.connections.value) connUser.set(c.ref.name, c.user);
  }
  const channelUser = new Map<string, string>();
  if (actual.channels.state === 'known') {
    for (const c of actual.channels.value) channelUser.set(c.ref.name, c.user);
  }
  const consumerQueue = new Map<string, ObjectRef>();
  if (actual.consumers.state === 'known') {
    for (const c of actual.consumers.value)
      consumerQueue.set(refKey(c.ref), c.queue);
  }

  const flowsOf = (ref: ObjectRef): readonly string[] => {
    switch (ref.kind) {
      case 'exchange':
      case 'queue':
        return flowsOfKey(refKey(ref));
      case 'binding':
        return ref.destinationType === 'queue'
          ? flowsOfKey(
              refKey({
                kind: 'queue',
                vhost: ref.vhost,
                name: ref.destination,
              }),
            )
          : [];
      case 'consumer': {
        const q = consumerQueue.get(refKey(ref));
        return q ? flowsOfKey(refKey(q)) : [];
      }
      case 'connection':
      case 'channel': {
        const user =
          ref.kind === 'connection'
            ? connUser.get(ref.name)
            : channelUser.get(ref.name);
        const fs = user === undefined ? undefined : userFlows.get(user);
        return fs
          ? [...fs].filter((f) => desired?.flows[f]).sort(compareStr)
          : [];
      }
      default:
        return [];
    }
  };

  // missing: chỉ kiểm được ở bộ sưu tập đã biết.
  const missing: ObjectRef[] = [];
  const present = (
    o: Actual['exchanges'] | Actual['queues'] | Actual['bindings'],
  ) =>
    o.state === 'known' ? new Set(o.value.map((x) => refKey(x.ref))) : null;
  const sets = {
    exchanges: present(actual.exchanges),
    queues: present(actual.queues),
    bindings: present(actual.bindings),
  };
  const seen = new Set<string>();
  for (const m of members.values()) {
    for (const kind of ['exchanges', 'queues', 'bindings'] as const) {
      const set = sets[kind];
      const coll = actual[kind];
      if (set === null) {
        if (coll.state === 'unknown')
          incomplete ??= {
            kind: 'depends_on',
            path: coll.path,
            reason: coll.reason,
          };
        continue;
      }
      for (const ref of m[kind]) {
        const k = refKey(ref);
        if (!set.has(k) && !seen.has(k)) {
          seen.add(k);
          missing.push(ref);
        }
      }
    }
  }

  return {
    flowsOf,
    toleranceOf: (ref) => tolerance(flowsOf(ref)),
    membersOf: (flow) =>
      members.get(flow) ?? { exchanges: [], queues: [], bindings: [] },
    missing: sortByRefKey(missing.map((ref) => ({ ref }))).map((x) => x.ref),
    incomplete,
  };
}
