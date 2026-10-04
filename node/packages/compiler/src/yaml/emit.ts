// Kết xuất lớp `topology` trực tiếp thành văn bản. Lớp này luôn sinh lại toàn
// bộ và chiếm phần lớn file, nên không đi qua cây `Document` của thư viện
// `yaml`; kết quả vẫn đọc lại bằng `readOchoYaml` trong tự kiểm vòng tròn.
import { formatNumber, formatString } from './scalar';

export type Plain = string | number | boolean | null | Plain[] | PlainMap;
export interface PlainMap {
  [k: string]: Plain;
}

export const LINE_WIDTH = 120;
/** Khoá ẩn của YAML dài tối đa 1024 ký tự; dài hơn phải viết `? key`. */
const MAX_IMPLICIT_KEY = 1000;

const isMap = (v: Plain): v is PlainMap =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Một dòng kiểu flow như thư viện `yaml` ghi (có đệm trong ngoặc). */
export function renderFlow(v: Plain): string {
  if (typeof v === 'string') return formatString(v);
  if (typeof v === 'number') return formatNumber(v);
  if (v === null) return 'null';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v))
    return v.length === 0 ? '[]' : `[ ${v.map(renderFlow).join(', ')} ]`;
  const ks = Object.keys(v);
  return ks.length === 0
    ? '{}'
    : `{ ${ks.map((k) => `${formatString(k)}: ${renderFlow(v[k])}`).join(', ')} }`;
}

/** Có khoá nào quá dài để viết ẩn không (khi đó không dùng kiểu flow). */
function hasLongKey(v: Plain): boolean {
  if (Array.isArray(v)) return v.some(hasLongKey);
  if (!isMap(v)) return false;
  return Object.keys(v).some(
    (k) => formatString(k).length > MAX_IMPLICIT_KEY || hasLongKey(v[k]),
  );
}

const pad = (n: number) => ' '.repeat(n);

/**
 * Giá trị đứng sau `prefix` (đã ở cột `col`) trên cùng dòng, ở thụt `indent`.
 * Scalar và collection vừa dòng viết kiểu flow; còn lại kiểu block ở dòng sau.
 */
function value(out: string[], prefix: string, v: Plain, indent: number): void {
  if (v === null || typeof v !== 'object') {
    out.push(`${prefix}${renderFlow(v)}`);
    return;
  }
  const empty = Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0;
  const flow = renderFlow(v);
  if (empty || (prefix.length + flow.length <= LINE_WIDTH && !hasLongKey(v))) {
    out.push(`${prefix}${flow}`);
    return;
  }
  out.push(prefix.trimEnd());
  block(out, v, indent + 2);
}

/** Collection kiểu block, mỗi phần tử một dòng ở cột `indent`. */
function block(out: string[], v: PlainMap | Plain[], indent: number): void {
  if (Array.isArray(v)) {
    for (const x of v) item(out, x, indent);
    return;
  }
  for (const k of Object.keys(v)) {
    const key = formatString(k);
    if (key.length > MAX_IMPLICIT_KEY) {
      out.push(`${pad(indent)}? ${key}`);
      value(out, `${pad(indent)}: `, v[k], indent);
    } else value(out, `${pad(indent)}${key}: `, v[k], indent);
  }
}

/** Phần tử `- …` của seq ở cột `indent`. */
function item(out: string[], x: Plain, indent: number): void {
  const dash = `${pad(indent)}- `;
  if (!isMap(x) || Object.keys(x).length === 0) {
    value(out, dash, x, indent);
    return;
  }
  const flow = renderFlow(x);
  if (dash.length + flow.length <= LINE_WIDTH && !hasLongKey(x)) {
    out.push(`${dash}${flow}`);
    return;
  }
  // Map kiểu block: khoá đầu cùng dòng với `-`, các khoá sau thẳng cột.
  const lines: string[] = [];
  block(lines, x, indent + 2);
  lines[0] = `${dash}${lines[0].slice(indent + 2)}`;
  out.push(...lines);
}

/**
 * Văn bản của khoá `topology` (không có dòng trống phía trước), kết thúc bằng
 * xuống dòng. `comment` là chú thích ngay trên khoá, mỗi dòng đã bỏ dấu `#`.
 */
export function emitTopology(v: PlainMap, comment?: string): string {
  const out: string[] = comment ? comment.split('\n').map((l) => `#${l}`) : [];
  if (Object.keys(v).length === 0) out.push('topology: {}');
  else {
    out.push('topology:');
    // Mỗi mục luôn là danh sách kiểu block, kể cả khi ngắn.
    for (const k of Object.keys(v)) {
      out.push(`  ${formatString(k)}:`);
      for (const x of v[k] as Plain[]) item(out, x, 4);
    }
  }
  return `${out.join('\n')}\n`;
}
