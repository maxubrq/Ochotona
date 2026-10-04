import { type Exclusion, exclusionsFor } from '@ochotona/spec';
import type { Actual, ApplyTo, QueueType } from './actual';
import { type Observed, all, known } from './observed';
import { type ObjectRef, argsKey, compareStr, refKey, stableJson } from './ref';
import type { ArgMap, ArgValue } from './units';

/** Dạng chung của phần khai báo, cho cả broker và `ocho.yaml`. */
export interface Topology {
  readonly exchanges: readonly TopoExchange[];
  readonly queues: readonly TopoQueue[];
  readonly bindings: readonly TopoBinding[];
  readonly policies: readonly TopoPolicy[];
  readonly operatorPolicies: readonly TopoPolicy[];
}

export interface TopoExchange {
  readonly vhost: string;
  readonly name: string;
  readonly type: string;
  readonly durable: boolean;
  readonly autoDelete: boolean;
  readonly internal: boolean;
  readonly arguments: ArgMap;
  readonly flow?: string;
}

export interface TopoQueue {
  readonly vhost: string;
  readonly name: string;
  readonly type: QueueType;
  readonly durable: boolean;
  readonly autoDelete: boolean;
  readonly arguments: ArgMap;
  readonly flow?: string;
}

export interface TopoBinding {
  readonly vhost: string;
  readonly source: string;
  readonly destinationType: 'queue' | 'exchange';
  readonly destination: string;
  readonly routingKey: string;
  readonly arguments: ArgMap;
}

export interface TopoPolicy {
  readonly vhost: string;
  readonly name: string;
  readonly pattern: string;
  readonly applyTo: ApplyTo;
  readonly priority: number;
  readonly definition: ArgMap;
}

export const EMPTY_TOPOLOGY: Topology = {
  exchanges: [],
  queues: [],
  bindings: [],
  policies: [],
  operatorPolicies: [],
};

export type TopoRef =
  | {
      readonly kind: 'exchange' | 'queue' | 'policy' | 'operator_policy';
      readonly vhost: string;
      readonly name: string;
    }
  | Extract<ObjectRef, { kind: 'binding' }>;

type Section = keyof Topology;
const SECTIONS: readonly Section[] = [
  'exchanges',
  'queues',
  'bindings',
  'policies',
  'operatorPolicies',
];

function topoRef(
  section: Section,
  x: TopoExchange | TopoQueue | TopoBinding | TopoPolicy,
): TopoRef {
  switch (section) {
    case 'exchanges':
    case 'queues': {
      const e = x as TopoExchange;
      return {
        kind: section === 'exchanges' ? 'exchange' : 'queue',
        vhost: e.vhost,
        name: e.name,
      };
    }
    case 'bindings': {
      const b = x as TopoBinding;
      return {
        kind: 'binding',
        vhost: b.vhost,
        source: b.source,
        destinationType: b.destinationType,
        destination: b.destination,
        routingKey: b.routingKey,
        argsKey: argsKey(b.arguments),
      };
    }
    default: {
      const p = x as TopoPolicy;
      return {
        kind: section === 'policies' ? 'policy' : 'operator_policy',
        vhost: p.vhost,
        name: p.name,
      };
    }
  }
}

/**
 * Topology từ broker. Một trong năm bộ sưu tập `unknown` thì cả topology
 * `unknown: depends_on`: không được ghi một topology thiếu mà trông như đủ.
 */
export function topologyFromActual(actual: Actual): Observed<Topology> {
  const a = all(
    [
      actual.exchanges,
      actual.queues,
      actual.bindings,
      actual.policies,
      actual.operatorPolicies,
    ] as const,
    'derived:topology',
  );
  if (a.state === 'unknown') return a;
  const [exchanges, queues, bindings, policies, operatorPolicies] = a.value;
  const pol = (p: (typeof policies)[number]): TopoPolicy => ({
    vhost: p.ref.vhost,
    name: p.ref.name,
    pattern: p.pattern,
    applyTo: p.applyTo,
    priority: p.priority,
    definition: p.definition,
  });
  return known(
    {
      exchanges: exchanges.map((e) => ({
        vhost: e.ref.vhost,
        name: e.ref.name,
        type: e.type,
        durable: e.durable,
        autoDelete: e.autoDelete,
        internal: e.internal,
        arguments: e.arguments,
      })),
      queues: queues
        .filter((q) => !q.exclusive)
        .map((q) => ({
          vhost: q.ref.vhost,
          name: q.ref.name,
          type: q.type,
          durable: q.durable,
          autoDelete: q.autoDelete,
          arguments: q.arguments,
        })),
      bindings: bindings.map((b) => ({
        vhost: b.ref.vhost,
        source: b.ref.source,
        destinationType: b.ref.destinationType,
        destination: b.ref.destination,
        routingKey: b.ref.routingKey,
        arguments: b.arguments,
      })),
      policies: policies.map(pol),
      operatorPolicies: operatorPolicies.map(pol),
    },
    a.prov,
  );
}

function sortSection<
  T extends TopoExchange | TopoQueue | TopoBinding | TopoPolicy,
>(section: Section, xs: readonly T[]): T[] {
  return xs
    .map((x) => [refKey(topoRef(section, x)), x] as const)
    .sort((a, b) => compareStr(a[0], b[0]))
    .map(([, x]) => x);
}

function withoutFlow<T extends { flow?: string }>(x: T): Omit<T, 'flow'> {
  const { flow: _f, ...rest } = x;
  return rest;
}

type ExclusionTarget = {
  readonly name?: string;
  readonly exclusive?: boolean;
  readonly source?: string;
  readonly queue?: string;
  readonly hasOutgoingBindings?: boolean;
};

/**
 * Đối tượng có khớp một loại trừ hệ thống không. Điều kiện trong `match` là AND;
 * trường mà đối tượng không mang thì không khớp.
 * @example matchesExclusion(exclusionsFor('queue', 'topology')[1], { name: 'amq.gen-x' }) // true
 */
export function matchesExclusion(x: Exclusion, o: ExclusionTarget): boolean {
  const m = x.match;
  if (m.nameEquals !== undefined && o.name !== m.nameEquals) return false;
  if (m.namePrefix !== undefined && !o.name?.startsWith(m.namePrefix))
    return false;
  if (m.exclusive !== undefined && o.exclusive !== m.exclusive) return false;
  if (m.sourceEquals !== undefined && o.source !== m.sourceEquals) return false;
  if (m.queueEquals !== undefined && o.queue !== m.queueEquals) return false;
  if (
    m.hasOutgoingBindings !== undefined &&
    o.hasOutgoingBindings !== m.hasOutgoingBindings
  )
    return false;
  return true;
}

const keep =
  (kind: Exclusion['kind']) =>
  (o: ExclusionTarget): boolean =>
    !exclusionsFor(kind, 'topology').some((x) => matchesExclusion(x, o));

/**
 * Chuẩn hoá trước khi so: bỏ đối tượng khớp loại trừ hệ thống phạm vi
 * `topology` của `@ochotona/spec` (EX1, EX2, EX4, EX5, EX6, EX8); bỏ `flow`;
 * sắp theo `refKey`. Không ép kiểu, không thêm mặc định.
 */
export function normalizeTopology(t: Topology): Topology {
  return {
    exchanges: sortSection(
      'exchanges',
      t.exchanges.filter(keep('exchange')).map(withoutFlow),
    ),
    queues: sortSection(
      'queues',
      // Queue exclusive (EX4) đã bị bỏ ở topologyFromActual vì TopoQueue không mang trường đó.
      t.queues.filter(keep('queue')).map(withoutFlow),
    ),
    bindings: sortSection('bindings', t.bindings.filter(keep('binding'))),
    policies: sortSection('policies', t.policies),
    operatorPolicies: sortSection('operatorPolicies', t.operatorPolicies),
  };
}

export interface FieldChange {
  /** ['arguments', 'x-max-length'] */
  readonly path: readonly (string | number)[];
  readonly before: ArgValue | undefined;
  readonly after: ArgValue | undefined;
}

export type Change =
  | { readonly op: 'add'; readonly ref: TopoRef; readonly after: unknown }
  | { readonly op: 'remove'; readonly ref: TopoRef; readonly before: unknown }
  | {
      readonly op: 'update';
      readonly ref: TopoRef;
      readonly fields: readonly FieldChange[];
    };

const isObj = (
  v: ArgValue | undefined,
): v is { readonly [k: string]: ArgValue } =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function diffValue(
  path: (string | number)[],
  a: ArgValue | undefined,
  b: ArgValue | undefined,
  out: FieldChange[],
): void {
  if (isObj(a) && isObj(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(
      compareStr,
    );
    for (const k of keys) diffValue([...path, k], a[k], b[k], out);
    return;
  }
  const sa = a === undefined ? undefined : stableJson(a);
  const sb = b === undefined ? undefined : stableJson(b);
  if (sa !== sb) out.push({ path, before: a, after: b });
}

function comparePath(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = compareStr(String(a[i]), String(b[i]));
    if (c !== 0) return c;
  }
  return a.length - b.length;
}

/**
 * Thay đổi để đi từ `from` tới `to`, khớp theo `refKey`. Đổi argument của binding
 * là `remove` cộng `add` vì `argsKey` nằm trong khoá. Sắp theo loại, `refKey`, `path`.
 */
export function diffTopology(from: Topology, to: Topology): readonly Change[] {
  const changes: Change[] = [];
  for (const section of SECTIONS) {
    const index = (
      xs: readonly (TopoExchange | TopoQueue | TopoBinding | TopoPolicy)[],
    ) => new Map(xs.map((x) => [refKey(topoRef(section, x)), x] as const));
    const a = index(from[section]);
    const b = index(to[section]);
    const keys = [...new Set([...a.keys(), ...b.keys()])].sort(compareStr);
    for (const k of keys) {
      const x = a.get(k);
      const y = b.get(k);
      if (x === undefined)
        changes.push({ op: 'add', ref: topoRef(section, y!), after: y });
      else if (y === undefined)
        changes.push({ op: 'remove', ref: topoRef(section, x), before: x });
      else {
        const fields: FieldChange[] = [];
        diffValue(
          [],
          x as unknown as ArgValue,
          y as unknown as ArgValue,
          fields,
        );
        fields.sort((p, q) => comparePath(p.path, q.path));
        if (fields.length > 0)
          changes.push({ op: 'update', ref: topoRef(section, x), fields });
      }
    }
  }
  return changes;
}
