// Quy tắc trích dẫn chuỗi và schema YAML dùng chung cho đọc và ghi.
import type {
  DocumentOptions,
  ParseOptions,
  SchemaOptions,
  ToStringOptions,
} from 'yaml';

const BOOL_WORDS = /^(true|false|yes|no|on|off|y|n)$/i;
const NULL_WORDS = /^(null|~)$/i;

/**
 * Dạng mà YAML 1.2 (core) hoặc YAML 1.1 (bảng resolver của PyYAML) đọc thành
 * thứ không phải chuỗi. Mỗi regex phủ một dạng riêng, không chồng nhau.
 */
const NON_STRING: readonly RegExp[] = [
  // Số thập phân nguyên hoặc thực, có dấu, gạch dưới (1.1), mũ: 17, +1_000, 1.5, 1e3.
  /^[-+]?[0-9][0-9_]*(\.[0-9_]*)?([eE][-+]?[0-9]+)?$/,
  // Số thực bắt đầu bằng dấu chấm: .5, -.5e3, .1_0.
  /^[-+]?\.[0-9_]+([eE][-+]?[0-9]+)?$/,
  // Hệ 16, 8, 2.
  /^[-+]?0x[0-9a-fA-F_]+$/,
  /^[-+]?0o[0-7_]+$/,
  /^[-+]?0b[01_]+$/,
  // Lục thập phân của 1.1: 1:20, 1:20:30.5.
  /^[-+]?[0-9][0-9_]*(:[0-5]?[0-9])+(\.[0-9_]*)?$/,
  /^[-+]?\.(inf|Inf|INF)$/,
  /^\.(nan|NaN|NAN)$/,
  // Ngày, ngày giờ của 1.1 (timestamp).
  /^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}([Tt \t]|$)/,
  // Merge key và value key của 1.1.
  /^(<<|=)$/,
];

const INDICATOR_START = /^[-?:,[\]{}#&*!|>'"%@`]/;
// Ký tự điều khiển C0, DEL, C1, dấu ngắt dòng Unicode, BOM, U+FFFE, U+FFFF
// (ngoài tập in được của YAML), surrogate lẻ.
const SPECIAL = String.raw`\u0000-\u001f\u007f-\u009f\u2028\u2029\ufeff\ufffe\uffff`;
const LONE_SURROGATE = String.raw`[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]`;
const CONTROL = new RegExp(`[${SPECIAL}]|${LONE_SURROGATE}`);

/**
 * Chuỗi có phải đặt trong nháy kép không. Xét cả YAML 1.1 vì người khác có thể
 * đọc file bằng công cụ cũ: queue tên `on` viết trơn sẽ thành `true` dưới PyYAML.
 * @example needsQuotes('on') // true
 * @example needsQuotes('orders.created') // false
 */
export function needsQuotes(s: string): boolean {
  if (s === '' || s !== s.trim()) return true;
  if (BOOL_WORDS.test(s) || NULL_WORDS.test(s)) return true;
  if (NON_STRING.some((re) => re.test(s))) return true;
  if (INDICATOR_START.test(s)) return true;
  if (s.includes(': ') || s.includes(' #')) return true;
  // Không có trong spec, nhưng cần: dấu `:` cuối biến chuỗi thành khoá, và
  // `,` `[` `]` `{` `}` cắt chuỗi trơn trong kiểu flow.
  if (s.endsWith(':') || /[,[\]{}]/.test(s)) return true;
  return CONTROL.test(s);
}

const ESCAPE = new RegExp(`["\\\\${SPECIAL}]|${LONE_SURROGATE}`, 'g');

/** Nháy kép; `"` và `\` thoát bằng `\`, ký tự điều khiển bằng `\uXXXX`. Unicode khác giữ nguyên. */
export function doubleQuote(s: string): string {
  return `"${s.replace(ESCAPE, (c) =>
    c === '"' || c === '\\'
      ? `\\${c}`
      : `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )}"`;
}

const CACHE_LIMIT = 200_000;
const cache = new Map<string, string>();

/** Chuỗi như sẽ được ghi ra file. Nhớ kết quả: tên lặp lại nhiều lần trong một file. */
export function formatString(s: string): string {
  let out = cache.get(s);
  // Stryker disable next-line all: chỉ là cache, bỏ đi kết quả không đổi
  if (out === undefined) {
    out = needsQuotes(s) ? doubleQuote(s) : s;
    // Stryker disable next-line all: giới hạn bộ nhớ của cache
    if (cache.size >= CACHE_LIMIT) cache.clear();
    // Stryker disable next-line all: chỉ là cache
    cache.set(s, out);
  }
  return out;
}

/**
 * Số như sẽ được ghi ra file. Số nguyên ngoài `Number.MAX_SAFE_INTEGER` ghi
 * dạng mũ (`9.007199254740992e+15`): đọc lại ra đúng giá trị, và không bị
 * hiểu là số nguyên sai (YP5).
 */
export function formatNumber(n: number): string {
  if (Object.is(n, -0)) return '-0';
  return Number.isInteger(n) && !Number.isSafeInteger(n)
    ? n.toExponential()
    : String(n);
}

const STR_TAG = 'tag:yaml.org,2002:str';

/**
 * Thay cách thư viện `yaml` ghi chuỗi bằng `formatString`, cho mọi chuỗi kể cả
 * khoá và chuỗi đọc từ file cũ, để kết quả không phụ thuộc cách người dùng đã
 * trích dẫn. Lớp ngữ nghĩa không có số; lớp topology có số được `emit.ts` ghi.
 */
const customTags: SchemaOptions['customTags'] = (tags) =>
  tags.map((t) =>
    (t as { tag?: string }).tag === STR_TAG
      ? {
          ...(t as object),
          stringify: (item: { value: unknown }) =>
            formatString(String(item.value)),
        }
      : t,
  ) as typeof tags;

export const MAX_BYTES = 5 * 1024 * 1024;

// Stryker disable all: tuỳ chọn trùng mặc định của thư viện `yaml` (schema
// core, strict, merge tắt…), ghi ra để khớp danh sách của spec.
/**
 * Tuỳ chọn parse theo spec: YAML 1.2 core, không merge, không alias. Khoá trùng
 * (YP2) do `readOchoYaml` tự phát hiện bằng Set: kiểm `uniqueKeys` của thư viện
 * là O(n²) trên một map và chiếm phần lớn thời gian với 10.000 luồng.
 */
export const PARSE_OPTIONS: ParseOptions & DocumentOptions & SchemaOptions = {
  version: '1.2',
  schema: 'core',
  merge: false,
  uniqueKeys: false,
  intAsBigInt: false,
  strict: true,
  prettyErrors: false,
};

/** Tuỳ chọn khi dựng và ghi: như parse, cộng bộ ghi chuỗi của Ocho. */
export const WRITE_DOC_OPTIONS: ParseOptions & DocumentOptions & SchemaOptions =
  {
    version: '1.2',
    schema: 'core',
    merge: false,
    uniqueKeys: false,
    customTags,
  };
// Stryker restore all

/** Thụt 2, seq thụt dưới khoá, ngoặc flow có đệm, không gấp dòng. */
export const TO_STRING_OPTIONS: ToStringOptions = {
  indent: 2,
  indentSeq: true,
  lineWidth: 0,
  minContentWidth: 0,
  flowCollectionPadding: true,
};
