import { APPLY_TO, type ApplyTo, QUEUE_TYPES, type QueueType } from './actual';
import type { Diag } from './diag';
import { type ObjectRef, parseObjectSelector } from './ref';
import { type Template, parseTemplate, renderTemplate } from './template';
import type {
  TopoBinding,
  TopoExchange,
  TopoPolicy,
  TopoQueue,
  Topology,
} from './topology';
import {
  type ArgMap,
  type Instant,
  type Result,
  type Version,
  err,
  isArgValue,
  isPlainObject,
  ok,
  parseVersion,
} from './units';

/** Major của schema `ocho.yaml` mà gói này hỗ trợ. */
export const SUPPORTED_SPEC_MAJOR = 0;

export type Tolerance = 'strict' | 'loose' | 'undeclared';
export const TOLERANCES: readonly Tolerance[] = [
  'strict',
  'loose',
  'undeclared',
];

export interface Desired {
  readonly spec: string;
  readonly broker: { readonly minVersion: Version };
  readonly families: Readonly<Record<string, Family>>;
  readonly flows: Readonly<Record<string, Flow>>;
  readonly services: Readonly<Record<string, Service>>;
  /** Chỉ waiver còn hiệu lực tại `now`. */
  readonly waivers: readonly Waiver[];
  readonly topology: Topology;
}

export interface Family {
  readonly name: string;
  readonly vhost: string;
  readonly exchange: string;
  readonly routingKey: Template;
  readonly queue: Template;
  readonly members: readonly string[] | 'registry';
}

export type FlowTarget =
  | { readonly kind: 'family'; readonly family: string }
  | {
      readonly kind: 'binding';
      readonly exchange: string;
      readonly routingKey: string;
      readonly groups: readonly string[];
    }
  | {
      readonly kind: 'fanout';
      readonly exchange: string;
      readonly groups: readonly string[];
    }
  | { readonly kind: 'direct'; readonly queue: string };

export interface Flow {
  readonly name: string;
  readonly vhost: string;
  readonly tolerance: Tolerance;
  readonly target: FlowTarget;
}

export interface Service {
  readonly name: string;
  readonly user: string;
  readonly flows: readonly string[];
}

export interface Waiver {
  readonly rule: string;
  readonly object: ObjectRef;
  readonly reason: string;
  readonly by: string;
  /** YYYY-MM-DD; hết hiệu lực từ 00:00 UTC ngày hôm sau. */
  readonly until: string;
}

type Path = (string | number)[];
type Obj = Record<string, unknown>;

class Checker {
  readonly errors: Diag[] = [];
  readonly warnings: Diag[] = [];

  error(
    code: string,
    path: Path,
    params: Record<string, string | number> = {},
  ): void {
    this.errors.push({ code, path, params });
  }

  /** Y2 nếu không phải object; Y1 cho mỗi khoá lạ. */
  object(v: unknown, path: Path, allowed: readonly string[]): Obj | null {
    if (!isPlainObject(v)) {
      this.error('Y2', path, { expected: 'object' });
      return null;
    }
    for (const k of Object.keys(v))
      if (!allowed.includes(k)) this.error('Y1', [...path, k], { key: k });
    return v;
  }

  str(o: Obj, key: string, path: Path, required: true): string | null;
  str(
    o: Obj,
    key: string,
    path: Path,
    required: false,
    fallback?: string,
  ): string | null | undefined;
  str(
    o: Obj,
    key: string,
    path: Path,
    required: boolean,
    fallback?: string,
  ): string | null | undefined {
    const v = o[key];
    if (v === undefined) {
      if (required) this.error('Y3', [...path, key], { key });
      return required ? null : fallback;
    }
    if (typeof v !== 'string') {
      this.error('Y2', [...path, key], { expected: 'string' });
      return null;
    }
    return v;
  }

  bool(o: Obj, key: string, path: Path, fallback: boolean): boolean {
    const v = o[key];
    if (v === undefined) return fallback;
    if (typeof v !== 'boolean') {
      this.error('Y2', [...path, key], { expected: 'boolean' });
      return fallback;
    }
    return v;
  }

  strList(o: Obj, key: string, path: Path, required: boolean): string[] | null {
    const v = o[key];
    if (v === undefined) {
      if (required) this.error('Y3', [...path, key], { key });
      return required ? null : [];
    }
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
      this.error('Y2', [...path, key], { expected: 'list of strings' });
      return null;
    }
    return v as string[];
  }

  args(o: Obj, key: string, path: Path, required: boolean): ArgMap | null {
    const v = o[key];
    if (v === undefined) {
      if (required) this.error('Y3', [...path, key], { key });
      return required ? null : {};
    }
    if (!isPlainObject(v) || !isArgValue(v)) {
      this.error('Y2', [...path, key], { expected: 'map of JSON values' });
      return null;
    }
    return v as ArgMap;
  }

  oneOf<T extends string>(
    o: Obj,
    key: string,
    path: Path,
    values: readonly T[],
    fallback: T,
  ): T | null {
    const v = o[key];
    if (v === undefined) return fallback;
    if (!(values as readonly unknown[]).includes(v)) {
      this.error('Y2', [...path, key], { expected: values.join(' | ') });
      return null;
    }
    return v as T;
  }

  /** Map tên → mục; trả các cặp đã là object. */
  map(v: unknown, path: Path): [string, unknown][] {
    if (v === undefined) return [];
    if (!isPlainObject(v)) {
      this.error('Y2', path, { expected: 'map' });
      return [];
    }
    return Object.entries(v);
  }

  list(v: unknown, path: Path): unknown[] {
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      this.error('Y2', path, { expected: 'list' });
      return [];
    }
    return v;
  }
}

const RESERVED_MEMBER_CHARS = /[.*#/+]/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Mốc hết hiệu lực của waiver (00:00 UTC ngày sau `until`), hoặc `null` nếu sai định dạng. */
export function waiverExpiry(until: string): number | null {
  const m = DATE_RE.exec(until);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d
  )
    return null;
  return ms + 24 * 3600 * 1000;
}

function checkFamily(c: Checker, name: string, v: unknown): Family | null {
  const path = ['families', name];
  const o = c.object(v, path, [
    'vhost',
    'exchange',
    'routing_key',
    'queue',
    'members',
  ]);
  if (!o) return null;
  const vhost = c.str(o, 'vhost', path, false, '/');
  const exchange = c.str(o, 'exchange', path, true);
  const tpl = (key: string): Template | null => {
    const raw = c.str(o, key, path, true);
    if (raw === null) return null;
    const t = parseTemplate(raw);
    if (!t.ok) {
      c.error('Y6', [...path, key], { reason: t.reason });
      return null;
    }
    return t.value;
  };
  const routingKey = tpl('routing_key');
  const queue = tpl('queue');
  if (routingKey && queue) {
    const a = [...routingKey.params].sort().join(',');
    const b = [...queue.params].sort().join(',');
    if (a !== b)
      c.error('Y6', [...path, 'queue'], {
        reason: `parameters {${b}} differ from routing_key {${a}}`,
      });
  }
  let members: readonly string[] | 'registry' | null = null;
  if (o.members === 'registry') members = 'registry';
  else {
    members = c.strList(o, 'members', path, true);
    members?.forEach((m, i) => {
      if (RESERVED_MEMBER_CHARS.test(m))
        c.error('Y7', [...path, 'members', i], { member: m });
    });
    if (members && queue && queue.params.length !== 1) {
      c.error('Y6', [...path, 'queue'], {
        reason: 'static members need exactly one parameter',
      });
    }
  }
  if (
    vhost == null ||
    exchange === null ||
    !routingKey ||
    !queue ||
    members === null
  )
    return null;
  return { name, vhost, exchange, routingKey, queue, members };
}

function checkFlow(
  c: Checker,
  name: string,
  v: unknown,
  families: Set<string>,
): Flow | null {
  const path = ['flows', name];
  const o = c.object(v, path, [
    'vhost',
    'tolerance',
    'family',
    'exchange',
    'routing_key',
    'groups',
    'queue',
  ]);
  if (!o) return null;
  const vhost = c.str(o, 'vhost', path, false, '/');
  const tolerance = c.oneOf(o, 'tolerance', path, TOLERANCES, 'undeclared');
  const has = (k: string) => o[k] !== undefined;
  let target: FlowTarget | null = null;
  if (
    has('family') &&
    !has('exchange') &&
    !has('routing_key') &&
    !has('groups') &&
    !has('queue')
  ) {
    const family = c.str(o, 'family', path, true);
    if (family !== null && !families.has(family))
      c.error('Y5', [...path, 'family'], { family });
    if (family !== null) target = { kind: 'family', family };
  } else if (
    has('queue') &&
    !has('family') &&
    !has('exchange') &&
    !has('routing_key') &&
    !has('groups')
  ) {
    const queue = c.str(o, 'queue', path, true);
    if (queue !== null) target = { kind: 'direct', queue };
  } else if (
    has('exchange') &&
    has('groups') &&
    !has('family') &&
    !has('queue')
  ) {
    const exchange = c.str(o, 'exchange', path, true);
    const groups = c.strList(o, 'groups', path, true);
    if (has('routing_key')) {
      const routingKey = c.str(o, 'routing_key', path, true);
      if (exchange !== null && groups && routingKey !== null) {
        target = { kind: 'binding', exchange, routingKey, groups };
      }
    } else if (exchange !== null && groups) {
      target = { kind: 'fanout', exchange, groups };
    }
  } else {
    c.error('Y4', path, { flow: name });
  }
  if (vhost == null || tolerance === null || target === null) return null;
  return { name, vhost, tolerance, target };
}

function checkTopology(c: Checker, v: unknown): Topology {
  const path = ['topology'];
  const out = {
    exchanges: [] as TopoExchange[],
    queues: [] as TopoQueue[],
    bindings: [] as TopoBinding[],
    policies: [] as TopoPolicy[],
    operatorPolicies: [] as TopoPolicy[],
  };
  if (v === undefined) return out;
  const o = c.object(v, path, [
    'exchanges',
    'queues',
    'bindings',
    'policies',
    'operator_policies',
  ]);
  if (!o) return out;
  c.list(o.exchanges, [...path, 'exchanges']).forEach((x, i) => {
    const p = [...path, 'exchanges', i];
    const e = c.object(x, p, [
      'vhost',
      'name',
      'type',
      'durable',
      'auto_delete',
      'internal',
      'arguments',
      'flow',
    ]);
    if (!e) return;
    const vhost = c.str(e, 'vhost', p, false, '/');
    const name = c.str(e, 'name', p, true);
    const type = c.str(e, 'type', p, true);
    const args = c.args(e, 'arguments', p, false);
    const flow = c.str(e, 'flow', p, false);
    if (
      vhost == null ||
      name === null ||
      type === null ||
      args === null ||
      flow === null
    )
      return;
    out.exchanges.push({
      vhost,
      name,
      type,
      durable: c.bool(e, 'durable', p, true),
      autoDelete: c.bool(e, 'auto_delete', p, false),
      internal: c.bool(e, 'internal', p, false),
      arguments: args,
      ...(flow === undefined ? {} : { flow }),
    });
  });
  c.list(o.queues, [...path, 'queues']).forEach((x, i) => {
    const p = [...path, 'queues', i];
    const q = c.object(x, p, [
      'vhost',
      'name',
      'type',
      'durable',
      'auto_delete',
      'arguments',
      'flow',
    ]);
    if (!q) return;
    const vhost = c.str(q, 'vhost', p, false, '/');
    const name = c.str(q, 'name', p, true);
    const type = c.oneOf<QueueType>(q, 'type', p, QUEUE_TYPES, 'classic');
    const args = c.args(q, 'arguments', p, false);
    const flow = c.str(q, 'flow', p, false);
    if (
      vhost == null ||
      name === null ||
      type === null ||
      args === null ||
      flow === null
    )
      return;
    out.queues.push({
      vhost,
      name,
      type,
      durable: c.bool(q, 'durable', p, true),
      autoDelete: c.bool(q, 'auto_delete', p, false),
      arguments: args,
      ...(flow === undefined ? {} : { flow }),
    });
  });
  c.list(o.bindings, [...path, 'bindings']).forEach((x, i) => {
    const p = [...path, 'bindings', i];
    const b = c.object(x, p, [
      'vhost',
      'source',
      'destination',
      'destination_type',
      'routing_key',
      'arguments',
    ]);
    if (!b) return;
    const vhost = c.str(b, 'vhost', p, false, '/');
    const source = c.str(b, 'source', p, true);
    const destination = c.str(b, 'destination', p, true);
    const destinationType = c.oneOf(
      b,
      'destination_type',
      p,
      ['queue', 'exchange'] as const,
      'queue',
    );
    const routingKey = c.str(b, 'routing_key', p, false, '');
    const args = c.args(b, 'arguments', p, false);
    if (
      vhost == null ||
      source === null ||
      destination === null ||
      !destinationType ||
      routingKey == null ||
      !args
    )
      return;
    out.bindings.push({
      vhost,
      source,
      destination,
      destinationType,
      routingKey,
      arguments: args,
    });
  });
  const policies = (
    key: 'policies' | 'operator_policies',
    into: TopoPolicy[],
  ) =>
    c.list(o[key], [...path, key]).forEach((x, i) => {
      const p = [...path, key, i];
      const po = c.object(x, p, [
        'vhost',
        'name',
        'pattern',
        'apply_to',
        'priority',
        'definition',
      ]);
      if (!po) return;
      const vhost = c.str(po, 'vhost', p, false, '/');
      const name = c.str(po, 'name', p, true);
      const pattern = c.str(po, 'pattern', p, true);
      const applyTo = c.oneOf<ApplyTo>(po, 'apply_to', p, APPLY_TO, 'all');
      const definition = c.args(po, 'definition', p, true);
      let priority = 0;
      if (po.priority !== undefined) {
        if (typeof po.priority !== 'number' || !Number.isInteger(po.priority)) {
          c.error('Y2', [...p, 'priority'], { expected: 'integer' });
        } else priority = po.priority;
      }
      if (
        vhost == null ||
        name === null ||
        pattern === null ||
        !applyTo ||
        !definition
      )
        return;
      into.push({ vhost, name, pattern, applyTo, priority, definition });
    });
  policies('policies', out.policies);
  policies('operator_policies', out.operatorPolicies);
  return out;
}

/** Bộ (vhost, exchange, routing key, queue) mà một luồng nhận; family `registry` không mở tĩnh được. */
function flowTuples(
  flow: Flow,
  families: Readonly<Record<string, Family>>,
): string[] {
  const t = flow.target;
  const tuple = (exchange: string, rk: string, queue: string) =>
    JSON.stringify([flow.vhost, exchange, rk, queue]);
  switch (t.kind) {
    case 'binding':
      return t.groups.map((g) => tuple(t.exchange, t.routingKey, g));
    case 'fanout':
      return t.groups.map((g) => tuple(t.exchange, '', g));
    case 'direct':
      return [tuple('', t.queue, t.queue)];
    case 'family': {
      const f = families[t.family];
      if (!f || f.members === 'registry') return [];
      return f.members.map((m) => {
        const values = Object.fromEntries(f.queue.params.map((p) => [p, m]));
        return JSON.stringify([
          f.vhost,
          f.exchange,
          renderTemplate(f.routingKey, values),
          renderTemplate(f.queue, values),
        ]);
      });
    }
  }
}

function check(
  obj: unknown,
  now: Instant,
): { errors: Diag[]; warnings: Diag[]; desired: Desired | null } {
  const c = new Checker();
  const root = c.object(
    obj,
    [],
    ['spec', 'broker', 'families', 'flows', 'services', 'waivers', 'topology'],
  );
  if (!root) return { errors: c.errors, warnings: c.warnings, desired: null };

  const spec = c.str(root, 'spec', [], true);
  if (spec !== null) {
    const m = /^(\d+)(?:\.\d+)*$/.exec(spec);
    if (!m || Number(m[1]) !== SUPPORTED_SPEC_MAJOR) {
      c.error('Y12', ['spec'], { spec, supported: SUPPORTED_SPEC_MAJOR });
    }
  }

  let minVersion: Version | null = null;
  if (root.broker === undefined) c.error('Y3', ['broker'], { key: 'broker' });
  else {
    const b = c.object(root.broker, ['broker'], ['min_version']);
    const raw = b ? c.str(b, 'min_version', ['broker'], true) : null;
    if (raw !== null) {
      minVersion = parseVersion(raw);
      if (!minVersion)
        c.error('Y14', ['broker', 'min_version'], { value: raw });
    }
  }

  const families: Record<string, Family> = {};
  for (const [name, v] of c.map(root.families, ['families'])) {
    const f = checkFamily(c, name, v);
    if (f) families[name] = f;
  }
  const familyNames = new Set(
    isPlainObject(root.families) ? Object.keys(root.families) : [],
  );

  const flows: Record<string, Flow> = {};
  for (const [name, v] of c.map(root.flows, ['flows'])) {
    const f = checkFlow(c, name, v, familyNames);
    if (f) flows[name] = f;
  }
  const flowNames = new Set(
    isPlainObject(root.flows) ? Object.keys(root.flows) : [],
  );

  const seen = new Map<string, string>();
  for (const f of Object.values(flows)) {
    for (const t of flowTuples(f, families)) {
      const other = seen.get(t);
      if (other !== undefined && other !== f.name) {
        const [vhost, exchange, routingKey, queue] = JSON.parse(t) as string[];
        c.error('Y13', ['flows', f.name], {
          other,
          vhost,
          exchange,
          routingKey,
          queue,
        });
      } else seen.set(t, f.name);
    }
  }

  const services: Record<string, Service> = {};
  for (const [name, v] of c.map(root.services, ['services'])) {
    const path = ['services', name];
    const o = c.object(v, path, ['user', 'flows']);
    if (!o) continue;
    const user = c.str(o, 'user', path, true);
    const sflows = c.strList(o, 'flows', path, false);
    sflows?.forEach((f, i) => {
      if (!flowNames.has(f)) c.error('Y8', [...path, 'flows', i], { flow: f });
    });
    if (user !== null && sflows) services[name] = { name, user, flows: sflows };
  }

  const waivers: Waiver[] = [];
  c.list(root.waivers, ['waivers']).forEach((v, i) => {
    const path = ['waivers', i];
    const o = c.object(v, path, ['rule', 'object', 'reason', 'by', 'until']);
    if (!o) return;
    const rule = c.str(o, 'rule', path, true);
    let object: ObjectRef | null = null;
    if (o.object === undefined)
      c.error('Y3', [...path, 'object'], { key: 'object' });
    else {
      const r = parseObjectSelector(o.object, [...path, 'object']);
      if (r.ok) object = r.value;
      else c.errors.push(r.error);
    }
    const text: Record<string, string | null> = {};
    for (const k of ['reason', 'by', 'until'] as const) {
      const x = o[k];
      if (typeof x !== 'string' || x.trim() === '') {
        c.error('Y9', [...path, k], { key: k });
        text[k] = null;
      } else text[k] = x;
    }
    let expiry: number | null = null;
    if (text.until !== null) {
      expiry = waiverExpiry(text.until);
      if (expiry === null)
        c.error('Y9', [...path, 'until'], { key: 'until', value: text.until });
    }
    if (
      rule === null ||
      !object ||
      !text.reason ||
      !text.by ||
      !text.until ||
      expiry === null
    )
      return;
    if (Date.parse(now) >= expiry) {
      c.warnings.push({
        code: 'Y10',
        path,
        params: { rule, until: text.until },
      });
      return;
    }
    waivers.push({
      rule,
      object,
      reason: text.reason,
      by: text.by,
      until: text.until,
    });
  });

  const topology = checkTopology(c, root.topology);

  const desired =
    c.errors.length === 0 && spec !== null && minVersion
      ? {
          spec,
          broker: { minVersion },
          families,
          flows,
          services,
          waivers,
          topology,
        }
      : null;
  return { errors: c.errors, warnings: c.warnings, desired };
}

/**
 * Kiểm tra `ocho.yaml` đã parse thành object. `path` là mảng khoá YAML;
 * compiler đổi nó thành dòng và cột.
 * @example validateDesired({ spec: '0.4' }, now).errors // [{ code: 'Y3', path: ['broker'], ... }]
 */
export function validateDesired(
  obj: unknown,
  now: Instant,
): { errors: Diag[]; warnings: Diag[] } {
  const { errors, warnings } = check(obj, now);
  return { errors, warnings };
}

/** Dựng `Desired`; chỉ thành công khi không có lỗi (cảnh báo Y10 vẫn cho qua). */
export function buildDesired(
  obj: unknown,
  now: Instant,
): Result<Desired, Diag[]> {
  const r = check(obj, now);
  return r.desired ? ok(r.desired) : err(r.errors);
}
