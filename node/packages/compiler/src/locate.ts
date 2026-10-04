import { type I18nKey, type Lang, format } from '@ochotona/spec';
import type {
  AnyDiag,
  DiagSeverity,
  LocatedDiag,
  PositionMap,
  YamlDiag,
} from './types';

/** Mã chẩn đoán là cảnh báo; mọi mã khác là lỗi. */
const WARNING_CODES: ReadonlySet<string> = new Set(['Y10', 'YW1', 'YW2']);

export const severityOf = (code: string): DiagSeverity =>
  WARNING_CODES.has(code) ? 'warning' : 'error';

const isYamlDiag = (d: AnyDiag): d is YamlDiag => 'pos' in d;

const compareCode = (a: string, b: string): number => {
  const pa = /^([A-Z]+)(\d+)$/.exec(a);
  const pb = /^([A-Z]+)(\d+)$/.exec(b);
  if (pa && pb && pa[1] === pb[1]) return Number(pa[2]) - Number(pb[2]);
  return a < b ? -1 : a > b ? 1 : 0;
};

/**
 * Gắn dòng, cột cho mọi chẩn đoán YP, YW (của compiler) và Y (của model), rồi
 * sắp theo dòng, cột, mã. Đường dẫn không có trong file trỏ về map cha.
 */
export function locate(
  diags: readonly AnyDiag[],
  positions: PositionMap,
  file: string,
): readonly LocatedDiag[] {
  return diags
    .map((d): LocatedDiag => {
      const pos = isYamlDiag(d) ? d.pos : positions.nearest(d.path);
      return {
        file,
        line: pos.line,
        column: pos.column,
        endLine: pos.endLine,
        endColumn: pos.endColumn,
        code: d.code,
        severity: isYamlDiag(d) ? d.severity : severityOf(d.code),
        path: d.path,
        params: d.params,
      };
    })
    .sort(
      (a, b) =>
        a.line - b.line || a.column - b.column || compareCode(a.code, b.code),
    );
}

/** Văn bản của chẩn đoán theo `diag.<mã>.message`. */
export function messageOf(d: LocatedDiag, lang: Lang): string {
  return format(lang, `diag.${d.code}.message` as I18nKey, d.params);
}

/**
 * Dạng của trình biên dịch GNU, để editor và CI bắt được không cần cấu hình.
 * Cần nạp văn bản trước: `import '@ochotona/spec/i18n/en'`.
 * @example formatGnu(d, 'en') // 'ocho.yaml:12:5: error Y4 Flow billing does not have exactly one target…'
 */
export function formatGnu(d: LocatedDiag, lang: Lang): string {
  return `${d.file}:${d.line}:${d.column}: ${d.severity} ${d.code} ${messageOf(d, lang)}`;
}

/** Dạng JSON của một chẩn đoán đã định vị. */
export function formatJson(
  d: LocatedDiag,
  lang: Lang,
): {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  code: string;
  severity: DiagSeverity;
  message: string;
  path: readonly (string | number)[];
} {
  return {
    file: d.file,
    line: d.line,
    column: d.column,
    endLine: d.endLine,
    endColumn: d.endColumn,
    code: d.code,
    severity: d.severity,
    message: messageOf(d, lang),
    path: d.path,
  };
}
