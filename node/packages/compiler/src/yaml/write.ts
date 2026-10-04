import {
  type Desired,
  type Family,
  type Flow,
  type Instant,
  type ObjectRef,
  type Service,
  type TopoBinding,
  type TopoExchange,
  type TopoPolicy,
  type TopoQueue,
  type Topology,
  type Waiver,
  argsKey,
  compareStr,
  isPlainObject,
  refKey,
} from '@ochotona/model';
import {
  Document,
  type Node,
  Pair,
  Scalar,
  YAMLMap,
  YAMLSeq,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  parseDocument,
} from 'yaml';
import type { OchoComment, Path } from '../types';
import { setOwn } from '../own';
import {
  LINE_WIDTH,
  type Plain,
  type PlainMap,
  emitTopology,
  renderFlow,
} from './emit';
import { TO_STRING_OPTIONS, WRITE_DOC_OPTIONS, formatString } from './scalar';

export interface WriteHeader {
  readonly context: string;
  readonly toolVersion: string;
  readonly at: Instant;
  readonly schemaUrl: string;
}

export interface WriteOptions {
  readonly header: WriteHeader;
  /** Đề xuất, đối tượng mất…; ghi thành `# ocho: …`. */
  readonly ochoComments: readonly OchoComment[];
  /** File cũ, để giữ chú thích và thứ tự của người dùng. */
  readonly base?: { readonly text: string };
  /**
   * Mục lấy nguyên từ `base`, không sinh lại từ `desired`. Import lại dùng cho
   * `services` và `waivers`: `Desired` chỉ chứa waiver còn hiệu lực, nên sinh
   * lại sẽ xoá waiver đã hết hạn khỏi file.
   */
  readonly keep?: readonly ('services' | 'waivers')[];
}

/** Thứ tự khoá cấp cao nhất. */
export const TOP_KEYS = [
  'spec',
  'broker',
  'families',
  'flows',
  'services',
  'waivers',
  'topology',
] as const;
type TopKey = (typeof TOP_KEYS)[number];

/** Mục có tên do người dùng đặt: giữ thứ tự cũ, phần tử mới thêm vào cuối. */
const RECORD_SECTIONS: readonly string[] = ['families', 'flows', 'services'];

const OCHO_LINE = /^\s*ocho:/;
const HEADER_LINE =
  /^\s*(yaml-language-server:|ocho import |Edit families, flows, services, waivers\.)/;

export const HEADER_NOTE =
  'Edit families, flows, services, waivers. The topology section mirrors the broker; ocho import rewrites it.';

export function headerLines(h: WriteHeader): string[] {
  return [
    `yaml-language-server: $schema=${h.schemaUrl}`,
    `ocho import ${h.toolVersion} · context ${h.context} · ${h.at}`,
    HEADER_NOTE,
  ];
}

// ------------------------------------------------------------ Desired → JS

const byName = <T extends { readonly name: string }>(
  r: Readonly<Record<string, T>>,
) => Object.values(r).sort((a, b) => compareStr(a.name, b.name));

/** Khoá object sắp theo code unit ở mọi cấp, để argument cho cùng byte bất kể thứ tự gốc. */
function sortedArgs(v: unknown): Plain {
  if (Array.isArray(v)) return v.map(sortedArgs);
  if (isPlainObject(v)) {
    const out: PlainMap = {};
    for (const k of Object.keys(v).sort(compareStr))
      setOwn(out, k, sortedArgs(v[k]));
    return out;
  }
  return v as Plain;
}

function familyValue(f: Family): PlainMap {
  return {
    ...(f.vhost === '/' ? {} : { vhost: f.vhost }),
    exchange: f.exchange,
    routing_key: f.routingKey.raw,
    queue: f.queue.raw,
    members: f.members === 'registry' ? 'registry' : [...f.members],
  };
}

function flowValue(f: Flow): PlainMap {
  const t = f.target;
  const target: PlainMap =
    t.kind === 'family'
      ? { family: t.family }
      : t.kind === 'binding'
        ? {
            exchange: t.exchange,
            routing_key: t.routingKey,
            groups: [...t.groups],
          }
        : t.kind === 'fanout'
          ? { exchange: t.exchange, groups: [...t.groups] }
          : { queue: t.queue };
  return {
    ...(f.vhost === '/' ? {} : { vhost: f.vhost }),
    tolerance: f.tolerance,
    ...target,
  };
}

const serviceValue = (s: Service): PlainMap => ({
  user: s.user,
  flows: [...s.flows],
});

/** Bộ chọn đối tượng: dạng rút gọn khi được, ngược lại dạng đầy đủ. */
export function selectorValue(ref: ObjectRef): Plain {
  switch (ref.kind) {
    case 'broker':
      return 'broker';
    case 'exchange':
    case 'queue':
    case 'policy':
    case 'operator_policy':
      return ref.vhost === '/'
        ? `${ref.kind} ${ref.name}`
        : { kind: ref.kind, vhost: ref.vhost, name: ref.name };
    case 'binding':
    case 'consumer':
      // parseObjectSelector không nhận hai loại này; waiver hợp lệ không có chúng.
      return refKey(ref);
    default:
      return `${ref.kind} ${ref.name}`;
  }
}

const waiverValue = (w: Waiver): PlainMap => ({
  rule: w.rule,
  object: selectorValue(w.object),
  reason: w.reason,
  by: w.by,
  until: w.until,
});

/**
 * Khoá sắp của exchange, queue, policy: `refKey` của model. Trong một danh sách
 * mọi phần tử cùng `kind`, nên thứ tự chỉ phụ thuộc vhost và tên.
 */
const vhostRef = (x: { vhost: string; name: string }) =>
  // Stryker disable next-line StringLiteral: cùng kind cho cả danh sách
  refKey({ kind: 'queue', vhost: x.vhost, name: x.name });
const bindingRef = (b: TopoBinding) =>
  refKey({
    kind: 'binding',
    vhost: b.vhost,
    source: b.source,
    destinationType: b.destinationType,
    destination: b.destination,
    routingKey: b.routingKey,
    argsKey: argsKey(b.arguments),
  });

function sortBy<T>(xs: readonly T[], key: (x: T) => string): T[] {
  return xs
    .map((x) => [key(x), x] as const)
    .sort((a, b) => compareStr(a[0], b[0]))
    .map(([, x]) => x);
}

/** Argument rỗng thì bỏ: model đọc khoá vắng thành `{}`. */
const argsField = (
  k: string,
  a: Readonly<Record<string, unknown>>,
): PlainMap => (Object.keys(a).length === 0 ? {} : { [k]: sortedArgs(a) });

// Lớp topology bỏ giá trị bằng mặc định của model (`auto_delete: false`,
// `internal: false`, `arguments: {}`, `destination_type: queue`, `routing_key: ""`)
// để phần tử vừa một dòng; `vhost`, `name`, `type`, `durable` luôn ghi.
const exchangeValue = (e: TopoExchange): PlainMap => ({
  vhost: e.vhost,
  name: e.name,
  type: e.type,
  durable: e.durable,
  ...(e.autoDelete ? { auto_delete: true } : {}),
  ...(e.internal ? { internal: true } : {}),
  ...argsField('arguments', e.arguments),
  ...(e.flow === undefined ? {} : { flow: e.flow }),
});
const queueValue = (q: TopoQueue): PlainMap => ({
  vhost: q.vhost,
  name: q.name,
  type: q.type,
  durable: q.durable,
  ...(q.autoDelete ? { auto_delete: true } : {}),
  ...argsField('arguments', q.arguments),
  ...(q.flow === undefined ? {} : { flow: q.flow }),
});
const bindingValue = (b: TopoBinding): PlainMap => ({
  vhost: b.vhost,
  source: b.source,
  destination: b.destination,
  ...(b.destinationType === 'queue'
    ? {}
    : { destination_type: b.destinationType }),
  ...(b.routingKey === '' ? {} : { routing_key: b.routingKey }),
  ...argsField('arguments', b.arguments),
});
const policyValue = (p: TopoPolicy): PlainMap => ({
  vhost: p.vhost,
  name: p.name,
  pattern: p.pattern,
  apply_to: p.applyTo,
  priority: p.priority,
  definition: sortedArgs(p.definition),
});

export function topologyValue(t: Topology): PlainMap {
  const out: PlainMap = {};
  const put = (k: string, xs: Plain[]) => {
    if (xs.length > 0) out[k] = xs;
  };
  put('exchanges', sortBy(t.exchanges, vhostRef).map(exchangeValue));
  put('queues', sortBy(t.queues, vhostRef).map(queueValue));
  put('bindings', sortBy(t.bindings, bindingRef).map(bindingValue));
  put('policies', sortBy(t.policies, vhostRef).map(policyValue));
  put(
    'operator_policies',
    sortBy(t.operatorPolicies, vhostRef).map(policyValue),
  );
  return out;
}

/**
 * `Desired` dưới dạng object JS theo đúng thứ tự khoá sẽ ghi. `families`,
 * `flows` luôn có; `services`, `waivers` chỉ khi khác rỗng.
 */
export function desiredValue(d: Desired): Partial<Record<TopKey, Plain>> {
  const record = <T extends { readonly name: string }>(
    r: Readonly<Record<string, T>>,
    f: (x: T) => PlainMap,
  ) => Object.fromEntries(byName(r).map((x) => [x.name, f(x)])) as PlainMap;
  const services = record(d.services, serviceValue);
  return {
    spec: d.spec,
    broker: { min_version: d.broker.minVersion.raw },
    families: record(d.families, familyValue),
    flows: record(d.flows, flowValue),
    ...(Object.keys(services).length > 0 ? { services } : {}),
    ...(d.waivers.length > 0 ? { waivers: d.waivers.map(waiverValue) } : {}),
    topology: topologyValue(d.topology),
  };
}

// ------------------------------------------------------------ JS → nút YAML

/**
 * Ngữ cảnh dựng: `indent` là cột của khoá (hoặc dấu `-`) chứa giá trị;
 * `prefix` là phần đứng trước giá trị trên cùng dòng (`key: ` hoặc `- `).
 */
interface Ctx {
  readonly path: Path;
  readonly indent: number;
  readonly prefix: number;
}

const fits = (v: Plain, ctx: Ctx) =>
  ctx.indent + ctx.prefix + renderFlow(v).length <= LINE_WIDTH;

/**
 * Collection của lớp ngữ nghĩa ghi kiểu flow khi vừa dòng: `broker`, danh sách
 * tên (`groups`, `members`, `flows` của service), `object` của waiver. Danh
 * sách `waivers` và map của từng family, luồng, service luôn kiểu block.
 */
const flowable = (path: Path, v: PlainMap | Plain[]): boolean =>
  path[0] === 'waivers'
    ? path.length >= 3
    : Array.isArray(v) || path[0] === 'broker';

function build(v: Plain, ctx: Ctx, flow = false): Node {
  // Stryker disable next-line ConditionalExpression,LogicalOperator: lớp ngữ nghĩa không có null
  if (v === null || typeof v !== 'object') return new Scalar(v);
  // Stryker disable next-line ConditionalExpression: thư viện yaml ghi map rỗng kiểu block thành `{}` như kiểu flow
  const empty = Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0;
  const asFlow = flow || empty || (flowable(ctx.path, v) && fits(v, ctx));
  if (Array.isArray(v)) {
    const seq = new YAMLSeq();
    seq.flow = asFlow;
    v.forEach((x, i) =>
      seq.items.push(
        build(
          x,
          { path: [...ctx.path, i], indent: ctx.indent + 2, prefix: 2 },
          asFlow,
        ),
      ),
    );
    return seq;
  }
  const map = new YAMLMap();
  map.flow = asFlow;
  for (const k of Object.keys(v)) {
    const childIndent = ctx.indent + 2;
    map.items.push(
      new Pair(
        new Scalar(k),
        build(
          v[k],
          {
            path: [...ctx.path, k],
            indent: childIndent,
            prefix: formatString(k).length + 2,
          },
          asFlow,
        ),
      ),
    );
  }
  return map;
}

/** Ngữ cảnh của khoá cấp cao nhất `k`. */
const topCtx = (k: string): Ctx => ({
  path: [k],
  indent: 0,
  prefix: k.length + 2,
});

// ------------------------------------------------------------ hợp nhất với file cũ

function carryComments(from: unknown, to: Node): Node {
  if (!isNode(from)) return to;
  to.commentBefore = from.commentBefore;
  to.comment = from.comment;
  to.spaceBefore = from.spaceBefore;
  return to;
}

// Stryker disable all: lớp ngữ nghĩa không có null
const isRecord = (v: Plain): v is PlainMap =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
// Stryker restore all

/**
 * Dựng lại giá trị trên nút cũ: tái dùng khoá (mang chú thích của mục), giữ
 * chú thích, dòng trống và kiểu flow của từng nút khi còn vừa dòng.
 */
function merge(base: unknown, v: Plain, ctx: Ctx): Node {
  if (isMap(base) && isRecord(v)) {
    const map = new YAMLMap();
    map.flow = Boolean(base.flow) && fits(v, ctx);
    carryComments(base, map);
    // Khoá phức (`? [a]`) thành chuỗi không có trong `v` nên bị bỏ.
    const old = new Map<string, Pair<unknown, unknown>>();
    for (const p of base.items as Pair<unknown, unknown>[])
      old.set(String((p.key as { value?: unknown }).value), p);
    const keys = Object.keys(v);
    const order =
      ctx.path.length === 1 && RECORD_SECTIONS.includes(String(ctx.path[0]))
        ? [
            ...[...old.keys()].filter((k) => k in v),
            ...keys.filter((k) => !old.has(k)),
          ]
        : keys;
    for (const k of order) {
      const p = old.get(k);
      const child: Ctx = {
        path: [...ctx.path, k],
        indent: ctx.indent + 2,
        prefix: formatString(k).length + 2,
      };
      map.items.push(
        new Pair(p?.key ?? new Scalar(k), merge(p?.value, v[k], child)),
      );
    }
    return map;
  }
  if (isSeq(base) && Array.isArray(v)) {
    const seq = new YAMLSeq();
    seq.flow = Boolean(base.flow) && fits(v, ctx);
    carryComments(base, seq);
    v.forEach((x, i) => {
      const child: Ctx = {
        path: [...ctx.path, i],
        indent: ctx.indent + 2,
        prefix: 2,
      };
      seq.items.push(merge(base.items[i], x, child));
    });
    return seq;
  }
  return carryComments(base, build(v, ctx));
}

// ------------------------------------------------------------ chú thích

function filterLines(
  c: string | null | undefined,
  drop: RegExp,
): string | undefined {
  if (!c) return undefined;
  const kept = c.split('\n').filter((l) => !drop.test(l));
  // Bỏ dòng trống thừa ở đầu và cuối sau khi lọc.
  while (kept.length > 0 && kept[0].trim() === '') kept.shift();
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  return kept.join('\n') || undefined;
}

/** Xoá mọi chú thích `# ocho:` trong cây. */
function stripOcho(n: unknown): void {
  if (isPair(n)) {
    stripOcho(n.key);
    stripOcho(n.value);
    // Stryker disable next-line ConditionalExpression: giá trị trong cây luôn là nút (vắng là scalar null)
  } else if (isNode(n)) {
    n.commentBefore = filterLines(n.commentBefore, OCHO_LINE);
    n.comment = filterLines(n.comment, OCHO_LINE);
    if (isMap(n) || isSeq(n)) for (const it of n.items) stripOcho(it);
  }
}

const ochoText = (lines: readonly string[]) =>
  lines.map((l) => ` ocho: ${l}`).join('\n');

function prepend(n: Node, text: string): void {
  n.commentBefore = n.commentBefore ? `${text}\n${n.commentBefore}` : text;
}

function pairAt(
  map: YAMLMap,
  key: string | number,
): Pair<Node, Node> | undefined {
  return map.items.find(
    (p) => isPair(p) && isScalar(p.key) && String(p.key.value) === String(key),
  ) as Pair<Node, Node> | undefined;
}

/** Nút mang chú thích "trên" đường dẫn: khoá của pair, hoặc phần tử của seq. */
function anchorFor(root: YAMLMap, path: Path): Node | null {
  let parent: Node = root;
  let anchor: Node | null = null;
  for (const seg of path) {
    if (isMap(parent)) {
      const p = pairAt(parent, seg);
      if (!p) return anchor;
      anchor = p.key;
      parent = p.value as Node;
    } else if (isSeq(parent)) {
      const it = parent.items[seg as number] as Node | undefined;
      if (!it) return anchor;
      anchor = it;
      parent = it;
    } else return anchor;
  }
  return anchor;
}

function applyComments(root: YAMLMap, comments: readonly OchoComment[]): void {
  // Chú thích cùng chỗ giữ đúng thứ tự đưa vào.
  const pending = new Map<Node, string[]>();
  const push = (n: Node, text: string) => {
    const xs = pending.get(n) ?? [];
    xs.push(text);
    pending.set(n, xs);
  };
  for (const c of comments) {
    const text = ochoText(c.lines);
    if (c.placement === 'inside') {
      // Collection kiểu block luôn có phần tử; rỗng thì đã là `{}`, `[]` kiểu flow.
      const target = valueAt(root, c.path);
      if ((isMap(target) || isSeq(target)) && !target.flow) {
        const first = target.items[0];
        push(isPair(first) ? (first.key as Node) : (first as Node), text);
        continue;
      }
    }
    const a = anchorFor(root, c.path);
    if (a) push(a, text);
  }
  for (const [n, texts] of pending) prepend(n, texts.join('\n'));
}

function valueAt(root: YAMLMap, path: Path): unknown {
  let n: unknown = root;
  for (const seg of path)
    n = isMap(n)
      ? pairAt(n, seg)?.value
      : isSeq(n)
        ? n.items[seg as number]
        : undefined;
  return n;
}

// ------------------------------------------------------------ ghi

function parseBase(text: string): Document.Parsed | null {
  const doc = parseDocument(text, WRITE_DOC_OPTIONS);
  if (doc.errors.length > 0 || !isMap(doc.contents)) return null;
  return doc;
}

/**
 * Ghi `Desired` thành `ocho.yaml`. Cùng đầu vào cho cùng chuỗi byte. Có `base`
 * thì lớp ngữ nghĩa được sửa trên cây cú pháp của file cũ (giữ chú thích, thứ
 * tự), lớp `topology` luôn sinh lại.
 */
export function writeOchoYaml(desired: Desired, opts: WriteOptions): string {
  const value = desiredValue(desired);
  const base = opts.base ? parseBase(opts.base.text) : null;
  const baseRoot = base ? (base.contents as YAMLMap) : null;
  const keep = new Set<string>(opts.keep);

  const root = new YAMLMap();
  let topologyComment: string | undefined;
  for (const k of TOP_KEYS) {
    const bp = baseRoot ? pairAt(baseRoot, k) : undefined;
    if (k === 'topology') {
      // Sinh lại toàn bộ, kết xuất riêng ở cuối; chỉ giữ chú thích trên khoá.
      topologyComment = filterLines(bp?.key.commentBefore, OCHO_LINE);
      continue;
    }
    if (keep.has(k)) {
      if (bp) root.items.push(bp);
      continue;
    }
    const v = value[k];
    if (v === undefined) continue;
    const key = bp ? bp.key : new Scalar(k);
    if (!bp && k !== 'spec' && k !== 'broker') key.spaceBefore = true;
    const node = bp ? merge(bp.value, v, topCtx(k)) : build(v, topCtx(k));
    root.items.push(new Pair(key, node));
  }
  for (const p of root.items) stripOcho(p);

  const doc = new Document(null, WRITE_DOC_OPTIONS);
  doc.contents = root;
  // Dòng đầu file: ba dòng header, rồi chú thích cấp document của người dùng.
  const userTop = filterLines(base?.commentBefore, HEADER_LINE);
  // `spec` luôn có nên khoá đầu luôn tồn tại.
  const first = root.items[0].key as Node;
  first.commentBefore = filterLines(first.commentBefore, HEADER_LINE);
  const header = headerLines(opts.header)
    .map((l) => ` ${l}`)
    .join('\n');
  const userText = filterLines(userTop, OCHO_LINE);
  doc.commentBefore = userText ? `${header}\n\n${userText}` : header;
  applyComments(root, opts.ochoComments);
  let out = doc.toString(TO_STRING_OPTIONS);
  out += `\n${emitTopology(value.topology as PlainMap, topologyComment)}`;
  // Chú thích cuối file của người dùng đứng sau topology, như trong file cũ.
  const trailing = filterLines(base?.comment, OCHO_LINE);
  if (trailing)
    out += `\n${trailing
      .split('\n')
      .map((l) => `#${l}`)
      .join('\n')}\n`;
  return out;
}
