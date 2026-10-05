// In lỗi dừng lệnh. Văn bản trên stderr, luôn đủ ba điều của D5:
//
//   error CX3: the broker rejected user ocho-doctor at /api/overview with 401.
//     Data   nothing was read or changed
//     Next   Create a monitoring user: rabbitmqadmin users declare …
//
// Với `--json`: một object `ocho.error/1` trên stdout, để công cụ gọi Ocho luôn
// parse được stdout dù thành công hay thất bại.

import { formatJson, formatGnu } from '@ochotona/compiler';
import { type I18nKey, format } from '@ochotona/spec';
import type { CliError, Msg } from '../errors';
import { type Lang, t } from '../i18n';
import type { Session } from '../session';
import { palette } from './color';
import { hanging } from './layout';
import { writeJson } from './json';

/** Văn bản của một `Msg`: khoá `diag.*`, `reason.*` của spec, còn lại của CLI. */
export function msgText(lang: Lang, m: Msg): string {
  const params = m.params ?? {};
  if (/^(diag|reason)\./.test(m.key))
    return format(lang, m.key as I18nKey, params);
  return t(lang, m.key, params);
}

export function dataText(lang: Lang, e: CliError): string {
  return t(lang, `error.data.${e.data}`, { file: e.file ?? '' });
}

/**
 * Dòng `Next`. D5: lỗi cách dùng không có gợi ý riêng thì chỉ tới trợ giúp của
 * đúng lệnh đang chạy. Chuỗi rỗng khi không có gì để nói.
 */
function nextText(
  e: CliError,
  lang: Lang,
  command: string | null,
  warning: boolean,
): string {
  if (e.next) return msgText(lang, e.next);
  if (e.code !== 'ARGS' || warning) return '';
  return command
    ? t(lang, 'args.next_command', { command })
    : t(lang, 'args.next');
}

function lines(
  e: CliError,
  lang: Lang,
  width: number,
  warning: boolean,
  command: string | null,
): {
  head: string;
  body: string[];
} {
  const label = (k: string) => t(lang, `error.label.${k}`);
  const lw = Math.max(label('data').length, label('next').length) + 2;
  const message = msgText(lang, e.msg);
  const extra = e.extra?.length ? ` (${e.extra.join('; ')})` : '';
  const body: string[] = [];
  if (!warning)
    body.push(
      ...hanging(`  ${label('data').padEnd(lw)}`, dataText(lang, e), width),
    );
  const next = nextText(e, lang, command, warning);
  if (next !== '')
    body.push(...hanging(`  ${label('next').padEnd(lw)}`, next, width));
  const kind = warning ? 'warning' : 'error';
  const code = e.code === 'ARGS' || e.code === 'FILE' ? '' : ` ${e.code}`;
  return { head: `${kind}${code}: ${message}${extra}`, body };
}

/** Lỗi dừng lệnh: stderr ở chế độ văn bản, `ocho.error/1` trên stdout với `--json`. */
export function renderError(s: Session, e: CliError): void {
  const diags = e.diagnostics ?? [];
  if (s.json) {
    writeJson(s, {
      schema: 'ocho.error/1',
      code: e.code,
      message:
        msgText(s.lang, e.msg) +
        (e.extra?.length ? ` (${e.extra.join('; ')})` : ''),
      data: dataText(s.lang, e),
      next: nextText(e, s.lang, s.args.command, false),
      exitCode: e.exitCode,
      ...(diags.length
        ? {
            diagnostics: diags.map((d) => {
              const j = formatJson(d, s.lang);
              return {
                file: j.file,
                line: j.line,
                column: j.column,
                endLine: j.endLine,
                endColumn: j.endColumn,
                code: j.code,
                severity: j.severity,
                message: j.message,
                path: [...j.path],
              };
            }),
          }
        : {}),
    });
    return;
  }
  const c = palette(s.colorErr);
  for (const d of diags) s.io.stderr.write(`${formatGnu(d, s.lang)}\n`);
  const { head, body } = lines(e, s.lang, s.width, false, s.args.command);
  s.io.stderr.write(`${c.error(head)}\n${body.map((l) => `${l}\n`).join('')}`);
}

/** Cảnh báo (CX5, CX6, OC1, YW…): stderr, không đổi exit code, cả với `--json`. */
export function renderWarning(s: Session, e: CliError): void {
  const c = palette(s.colorErr);
  const { head, body } = lines(e, s.lang, s.width, true, s.args.command);
  s.io.stderr.write(
    `${c.warning(head)}\n${body.map((l) => `${l}\n`).join('')}`,
  );
}

/** Lỗi nội bộ (exit 5): kèm phiên bản Ocho, Node, hệ điều hành. */
export function renderInternal(
  s: Session,
  detail: string,
  versions: { tool: string; node: string; os: string },
): void {
  const message = t(s.lang, 'error.internal', { detail });
  const next = t(s.lang, 'error.internal.next', versions);
  if (s.json) {
    writeJson(s, {
      schema: 'ocho.error/1',
      code: 'INTERNAL',
      message,
      data: t(s.lang, 'error.data.before_read'),
      next,
      exitCode: 5,
    });
    return;
  }
  const c = palette(s.colorErr);
  s.io.stderr.write(`${c.error(message)}\n${next}\n`);
}
