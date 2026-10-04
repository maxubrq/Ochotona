import { createHash } from 'node:crypto';
import type { Diag } from './diag';
import {
  type ArgMap,
  type ArgValue,
  type Result,
  err,
  isPlainObject,
  ok,
} from './units';

export type ObjectRef =
  | { readonly kind: 'broker' }
  | {
      readonly kind:
        'node' | 'vhost' | 'connection' | 'channel' | 'flow' | 'family';
      readonly name: string;
    }
  | {
      readonly kind: 'exchange' | 'queue' | 'policy' | 'operator_policy';
      readonly vhost: string;
      readonly name: string;
    }
  | {
      readonly kind: 'binding';
      readonly vhost: string;
      readonly source: string;
      readonly destinationType: 'queue' | 'exchange';
      readonly destination: string;
      readonly routingKey: string;
      readonly argsKey: string;
    }
  | {
      readonly kind: 'consumer';
      readonly channel: string;
      readonly tag: string;
    };

export type RefKind = ObjectRef['kind'];

const NAMED_KINDS = [
  'node',
  'vhost',
  'connection',
  'channel',
  'flow',
  'family',
] as const;
const VHOST_KINDS = ['exchange', 'queue', 'policy', 'operator_policy'] as const;

function parts(ref: ObjectRef): string[] {
  switch (ref.kind) {
    case 'broker':
      return [];
    case 'binding':
      return [
        ref.vhost,
        ref.source,
        ref.destinationType,
        ref.destination,
        ref.routingKey,
        ref.argsKey,
      ];
    case 'consumer':
      return [ref.channel, ref.tag];
    case 'exchange':
    case 'queue':
    case 'policy':
    case 'operator_policy':
      return [ref.vhost, ref.name];
    default:
      return [ref.name];
  }
}

/**
 * Khoá chuỗi chuẩn: `kind` rồi từng thành phần qua `encodeURIComponent`, ngăn bằng `:`.
 * Là thứ duy nhất dùng làm khoá Map, để sắp xếp, khớp miễn trừ và làm `object.id`.
 * @example refKey({ kind: 'queue', vhost: '/', name: 'q' }) // 'queue:%2F:q'
 */
export function refKey(ref: ObjectRef): string {
  return [ref.kind, ...parts(ref).map(encodeURIComponent)].join(':');
}

/** So sánh theo code unit, không phụ thuộc locale. */
export function compareStr(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortByRefKey<T extends { readonly ref: ObjectRef }>(
  xs: readonly T[],
): T[] {
  return xs
    .map((x) => [refKey(x.ref), x] as const)
    .sort((a, b) => compareStr(a[0], b[0]))
    .map(([, x]) => x);
}

/**
 * Dạng đọc cho người, chỉ để in.
 * @example refLabel({ kind: 'queue', vhost: 'billing', name: 'q' }) // 'queue q (vhost billing)'
 */
export function refLabel(ref: ObjectRef): string {
  const vh = (v: string) => (v === '/' ? '' : ` (vhost ${v})`);
  switch (ref.kind) {
    case 'broker':
      return 'broker';
    case 'binding': {
      const src = ref.source === '' ? '(default)' : ref.source;
      const key = ref.routingKey === '' ? '' : ` key ${ref.routingKey}`;
      return `binding ${src} → ${ref.destinationType} ${ref.destination}${key}${vh(ref.vhost)}`;
    }
    case 'consumer':
      return `consumer ${ref.tag} on channel ${ref.channel}`;
    case 'exchange':
    case 'queue':
    case 'policy':
    case 'operator_policy':
      return `${ref.kind.replace('_', ' ')} ${ref.name}${vh(ref.vhost)}`;
    default:
      return `${ref.kind} ${ref.name}`;
  }
}

/**
 * Đọc bộ chọn đối tượng trong `ocho.yaml`: object `{ kind, vhost, name }` hoặc
 * chuỗi `"<kind> <name>"` (vhost mặc định `/`). Sai định dạng thì lỗi Y11.
 * @example parseObjectSelector('queue my queue') // { kind: 'queue', vhost: '/', name: 'my queue' }
 */
export function parseObjectSelector(
  s: unknown,
  path: readonly (string | number)[] = [],
): Result<ObjectRef, Diag> {
  const fail = (reason: string) =>
    err<Diag>({ code: 'Y11', path: [...path], params: { reason } });
  let kind: unknown;
  let vhost: unknown = '/';
  let name: unknown;
  if (typeof s === 'string') {
    const i = s.indexOf(' ');
    kind = i < 0 ? s : s.slice(0, i);
    name = i < 0 ? undefined : s.slice(i + 1);
  } else if (isPlainObject(s)) {
    const extra = Object.keys(s).filter(
      (k) => !['kind', 'vhost', 'name'].includes(k),
    );
    if (extra.length > 0) return fail(`unknown key ${extra[0]}`);
    kind = s.kind;
    name = s.name;
    if (s.vhost !== undefined) vhost = s.vhost;
  } else {
    return fail('expected string or object');
  }
  if (kind === 'broker') {
    return name === undefined
      ? ok({ kind: 'broker' })
      : fail('broker takes no name');
  }
  if (typeof name !== 'string' || name === '') return fail('missing name');
  if ((NAMED_KINDS as readonly unknown[]).includes(kind)) {
    if (typeof s === 'object' && s !== null && 'vhost' in s) {
      return fail(`${String(kind)} has no vhost`);
    }
    return ok({ kind: kind as (typeof NAMED_KINDS)[number], name });
  }
  if ((VHOST_KINDS as readonly unknown[]).includes(kind)) {
    if (typeof vhost !== 'string') return fail('vhost must be a string');
    return ok({ kind: kind as (typeof VHOST_KINDS)[number], vhost, name });
  }
  return fail(`unsupported kind ${String(kind)}`);
}

/**
 * JSON không khoảng trắng, khoá object sắp tăng dần theo code unit ở mọi cấp.
 * @example stableJson({ b: 1, a: [2, 1] }) // '{"a":[2,1],"b":1}'
 */
export function stableJson(v: ArgValue): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => stableJson(x)).join(',')}]`;
  const o = v as { readonly [k: string]: ArgValue };
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort(compareStr);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
}

export function sha256Hex(...chunks: (string | Uint8Array)[]): string {
  const h = createHash('sha256');
  for (const c of chunks) h.update(c);
  return h.digest('hex');
}

/**
 * Khoá argument của binding: chuỗi rỗng khi không có argument, ngược lại
 * 12 ký tự hex đầu của SHA-256 trên `stableJson(args)`.
 */
export function argsKey(args: ArgMap): string {
  if (Object.keys(args).length === 0) return '';
  return sha256Hex(stableJson(args)).slice(0, 12);
}
