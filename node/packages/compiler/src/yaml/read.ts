import {
  type Document,
  LineCounter,
  type Node,
  type Pair,
  isAlias,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  parseAllDocuments,
} from 'yaml';
import type { Path, Position, PositionMap, YamlCode, YamlDiag } from '../types';
import { MAX_BYTES, PARSE_OPTIONS } from './scalar';

const ROOT_POS: Position = { line: 1, column: 1, endLine: 1, endColumn: 1 };

/** Giá trị vắng (`key:` không có gì sau) là scalar null rỗng. */
const isEmptyValue = (v: unknown): boolean =>
  !isNode(v) ||
  (isScalar(v) && v.value === null && (!v.range || v.range[0] === v.range[1]));

/**
 * Tra vị trí trên cây cú pháp khi được hỏi. Chỉ chẩn đoán mới cần vị trí, nên
 * không ghi trước cho từng nút của một file có hàng trăm nghìn nút.
 */
class Positions implements PositionMap {
  constructor(
    private readonly root: Node | null,
    private readonly toPos: (n: Node) => Position,
  ) {}

  /** Nút ứng với đường dẫn sâu nhất tìm được, và đã khớp hết đường dẫn chưa. */
  private walk(path: Path): { node: Node | null; complete: boolean } {
    let node = this.root;
    if (!node) return { node: null, complete: path.length === 0 };
    for (const seg of path) {
      let next: Node | null = null;
      if (isMap(node)) {
        const p = node.items.find(
          (x) =>
            isPair(x) && isScalar(x.key) && String(x.key.value) === String(seg),
        ) as Pair<Node, unknown> | undefined;
        if (p) next = isEmptyValue(p.value) ? p.key : (p.value as Node);
      } else if (isSeq(node) && typeof seg === 'number') {
        const it: unknown = node.items[seg];
        if (isNode(it)) next = it;
      }
      if (!next) return { node, complete: false };
      node = next;
    }
    return { node, complete: true };
  }

  get(path: Path): Position | undefined {
    const r = this.walk(path);
    if (!r.complete) return undefined;
    return r.node ? this.toPos(r.node) : ROOT_POS;
  }

  nearest(path: Path): Position {
    const r = this.walk(path);
    return r.node ? this.toPos(r.node) : ROOT_POS;
  }
}

/** Đường dẫn trong file tới những trường mà schema đòi boolean. */
function isBooleanPath(path: Path): boolean {
  return (
    path.length === 4 &&
    path[0] === 'topology' &&
    (path[1] === 'exchanges' || path[1] === 'queues') &&
    typeof path[2] === 'number' &&
    (path[3] === 'durable' ||
      path[3] === 'auto_delete' ||
      (path[1] === 'exchanges' && path[3] === 'internal'))
  );
}

const YAML11_BOOL = /^(yes|no|on|off|y|n)$/i;
const LEADING_ZERO = /^[-+]?0[0-9]+$/;
const INTEGER = /^[-+]?[0-9]+$|^0x[0-9a-fA-F]+$|^0o[0-7]+$/;

/**
 * Parse `ocho.yaml` thành object JS thuần, kèm bảng vị trí và chẩn đoán cú pháp.
 * Có lỗi YP thì `value` là `null`. Không kiểm ngữ nghĩa: object đi tiếp vào
 * `model.buildDesired`.
 * @example readOchoYaml('spec: "0.4"\n').value // { spec: '0.4' }
 */
export function readOchoYaml(text: string): {
  value: unknown | null;
  positions: PositionMap;
  diagnostics: readonly YamlDiag[];
} {
  const diagnostics: YamlDiag[] = [];
  const lc = new LineCounter();
  // Map, seq dạng block kết thúc sau dòng trống và xuống dòng; lùi về ký tự cuối.
  const posOf = (start: number, end: number): Position => {
    let e = end;
    while (e > start && /\s/.test(text[e - 1])) e--;
    const a = lc.linePos(start);
    const b = lc.linePos(e);
    return { line: a.line, column: a.col, endLine: b.line, endColumn: b.col };
  };
  const range = (n: Node) =>
    n.range ? posOf(n.range[0], n.range[1]) : ROOT_POS;
  const add = (
    code: YamlCode,
    pos: Position,
    params: Record<string, string | number> = {},
    path: Path = [],
  ) =>
    diagnostics.push({
      code,
      severity: code.startsWith('YW') ? 'warning' : 'error',
      path,
      params,
      pos,
    });
  const nothing = () => ({
    value: null,
    positions: new Positions(null, range),
    diagnostics,
  });

  const size = new TextEncoder().encode(text).length;
  if (size > MAX_BYTES) {
    add('YP6', ROOT_POS, { size, limit: MAX_BYTES });
    return nothing();
  }

  const docs = parseAllDocuments(text, {
    ...PARSE_OPTIONS,
    lineCounter: lc,
  }) as unknown as Document.Parsed[];
  if (!Array.isArray(docs) || docs.length === 0) return nothing();
  if (docs.length > 1) {
    const start = docs[1].range[0];
    add('YP3', posOf(start, start));
  }
  const doc = docs[0];
  for (const e of doc.errors)
    add('YP1', posOf(e.pos[0], e.pos[1]), { reason: reasonOf(e.message) });

  // Duyệt cây trước khi chuyển sang JS: anchor và alias bị chặn trước khi mở
  // rộng. `path` là ngăn xếp dùng chung; chỉ sao chép khi báo chẩn đoán.
  const path: (string | number)[] = [];
  const here = () => [...path];
  /** YP4 cho alias, anchor, tag; `true` khi là alias (không duyệt tiếp). */
  const features = (n: Node): boolean => {
    if (isAlias(n)) {
      add('YP4', range(n), { feature: `alias *${n.source}` }, here());
      return true;
    }
    if (n.anchor)
      add('YP4', range(n), { feature: `anchor &${n.anchor}` }, here());
    if (n.tag) add('YP4', range(n), { feature: `tag ${n.tag}` }, here());
    return false;
  };
  const scalarChecks = (s: Node) => {
    if (!isScalar(s) || s.type !== 'PLAIN') return;
    const v = s.value;
    if (typeof v === 'number') {
      const src = (s as { source?: string }).source ?? '';
      if (Number.isInteger(v) && !Number.isSafeInteger(v) && INTEGER.test(src))
        add('YP5', range(s), { value: src }, here());
      else if (LEADING_ZERO.test(src))
        add('YW1', range(s), { value: src, decimal: String(v) }, here());
    } else if (
      typeof v === 'string' &&
      v.length <= 3 &&
      YAML11_BOOL.test(v) &&
      isBooleanPath(path)
    )
      add('YW2', range(s), { value: v }, here());
  };
  const walk = (n: unknown): void => {
    if (!isNode(n) || features(n)) return;
    if (isScalar(n)) {
      scalarChecks(n);
      return;
    }
    if (isMap(n)) {
      const seen = new Set<string>();
      for (const pair of n.items) {
        if (!isPair(pair)) continue;
        const k = pair.key;
        if (!isScalar(k)) {
          if (isNode(k)) walk(k);
          continue;
        }
        features(k);
        const key = String(k.value);
        if (key === '<<' && k.type === 'PLAIN')
          add('YP4', range(k), { feature: 'merge key <<' }, here());
        // Khoá trùng (YP2) phát hiện ở đây; `uniqueKeys` của thư viện tắt.
        if (seen.has(key)) {
          add('YP2', range(k), { key }, here());
          continue;
        }
        seen.add(key);
        path.push(key);
        walk(pair.value);
        path.pop();
      }
      return;
    }
    if (isSeq(n))
      n.items.forEach((item, i) => {
        path.push(i);
        walk(item);
        path.pop();
      });
  };
  walk(doc.contents);

  const fatal = diagnostics.some((d) => d.severity === 'error');
  return {
    value: fatal ? null : doc.toJS({ maxAliasCount: 0 }),
    positions: new Positions(doc.contents as Node | null, range),
    diagnostics: diagnostics.sort(
      (a, b) =>
        a.pos.line - b.pos.line ||
        a.pos.column - b.pos.column ||
        (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
    ),
  };
}

/** Dòng đầu của thông báo lỗi, bỏ phần "at line…" vì vị trí đã có riêng. */
function reasonOf(message: string): string {
  return message
    .split('\n')[0]
    .replace(/ at line \d+, column \d+:?$/, '')
    .replace(/\.$/, '');
}
