// Trạng thái dùng chung của một lần chạy lệnh: io, tham số đã phân tích, ngôn
// ngữ, màu, và các kênh in. stdout chỉ nhận kết quả; mọi thứ khác đi stderr.

import type { Parsed } from './args';
import type { CliError } from './errors';
import { type Lang, type Params, t } from './i18n';
import type { IO } from './io';

export interface Session {
  readonly io: IO;
  readonly args: Parsed;
  readonly lang: Lang;
  readonly json: boolean;
  /** Màu trên stdout (báo cáo). */
  readonly color: boolean;
  /** Màu trên stderr (lỗi, cảnh báo). */
  readonly colorErr: boolean;
  /** Bề rộng render: `columns` nếu stdout là TTY, không thì 80; sàn 60. */
  readonly width: number;
  /** ms lúc bắt đầu, cho `[debug +123ms]`. */
  readonly startedMs: number;
  t(key: string, params?: Params): string;
  /** Một dòng `--debug` lên stderr; không làm gì khi tắt. */
  debug(line: string): void;
  readonly debugOn: boolean;
  /** Cảnh báo dạng D5 lên stderr (CX5, CX6, OC1…). */
  warn(e: CliError): void;
  /** Một dòng thông tin lên stderr. */
  note(line: string): void;
}

export function bindT(lang: Lang) {
  return (key: string, params?: Params) => t(lang, key, params);
}
