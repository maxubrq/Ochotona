// Lỗi làm một lệnh dừng trước khi có kết quả. Mang khoá văn bản thay vì chuỗi
// để render theo ngôn ngữ đã chọn; `render/errors.ts` in nó ra (D5: chuyện gì,
// dữ liệu có an toàn không, làm gì tiếp).

import type { LocatedDiag } from '@ochotona/compiler';

/** Khoá `diag.*`, `reason.*` thuộc @ochotona/spec; khoá còn lại thuộc `src/i18n`. */
export interface Msg {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/**
 * Câu `Data` chung của CLI. Không lệnh nào của v0.1 ghi lên broker, nên không có
 * câu thứ tư.
 */
export type DataState = 'before_read' | 'during_read' | 'file_write';

export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5 | 130;

export class CliError extends Error {
  readonly code: string;
  readonly exitCode: ExitCode;
  readonly data: DataState;
  readonly msg: Msg;
  readonly next: Msg | null;
  /** File trong câu `file_write`. */
  readonly file?: string;
  /** Chẩn đoán đã định vị (YP, Y, IM2). */
  readonly diagnostics?: readonly LocatedDiag[];
  /** Dữ liệu thêm cho `ocho.error/1`. */
  readonly extra?: readonly string[];

  constructor(opts: {
    code: string;
    exitCode: ExitCode;
    msg: Msg;
    next?: Msg | null;
    data?: DataState;
    file?: string;
    diagnostics?: readonly LocatedDiag[];
    extra?: readonly string[];
  }) {
    super(`${opts.code} ${opts.msg.key}`);
    this.code = opts.code;
    this.exitCode = opts.exitCode;
    this.msg = opts.msg;
    this.next = opts.next ?? null;
    this.data = opts.data ?? 'before_read';
    if (opts.file !== undefined) this.file = opts.file;
    if (opts.diagnostics) this.diagnostics = opts.diagnostics;
    if (opts.extra) this.extra = opts.extra;
  }
}

/** Lỗi cách dùng: cờ sai, tham số thiếu. Exit 4. */
export function usage(
  key: string,
  params: Record<string, string | number> = {},
  next: Msg | null = null,
): CliError {
  return new CliError({
    code: 'ARGS',
    exitCode: 4,
    msg: { key, params },
    next,
  });
}

/** Lỗi có mã chẩn đoán của spec (`diag.<MÃ>.message`, `diag.<MÃ>.next`). */
export function diag(
  code: string,
  exitCode: ExitCode,
  params: Record<string, string | number>,
  opts: { data?: DataState; extra?: readonly string[] } = {},
): CliError {
  return new CliError({
    code,
    exitCode,
    msg: { key: `diag.${code}.message`, params },
    next: { key: `diag.${code}.next`, params },
    ...opts,
  });
}

/** Ctrl-C: không phải lỗi của ai, nhưng dừng lệnh. */
export class Interrupted extends Error {
  readonly data: DataState;
  /** File trong câu `file_write`. */
  readonly file?: string;
  constructor(data: DataState = 'before_read', file?: string) {
    super('interrupted');
    this.data = data;
    if (file !== undefined) this.file = file;
  }
}

/** Lỗi của Ocho, không phải của người dùng hay broker. Exit 5. */
export class InternalError extends Error {}
