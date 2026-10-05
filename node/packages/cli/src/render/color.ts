// Màu chỉ bật khi luồng là TTY, không có `NO_COLOR`, không có `--no-color`, và
// `TERM` khác `dumb`. Mọi thông tin vẫn có bằng chữ khi tắt màu (U6).

import type { Severity } from '@ochotona/spec';

export function colorEnabled(opts: {
  readonly isTTY: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly noColorFlag: boolean;
}): boolean {
  const { env } = opts;
  if (!opts.isTTY || opts.noColorFlag) return false;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  return env.TERM !== 'dumb';
}

const wrap =
  (open: string, close: string) =>
  (on: boolean) =>
  (s: string): string =>
    on ? `\u001b[${open}m${s}\u001b[${close}m` : s;

const bold = wrap('1', '22');
const dim = wrap('2', '22');
const red = wrap('31', '39');
const green = wrap('32', '39');
const yellow = wrap('33', '39');
const magenta = wrap('35', '39');

export interface Palette {
  bold(s: string): string;
  dim(s: string): string;
  ok(s: string): string;
  error(s: string): string;
  warning(s: string): string;
  severity(sev: Severity, s: string): string;
}

/** S1 đỏ đậm, S2 tím, S3 vàng, S4 và S5 mờ, mã luật đậm, `[ok]` xanh. */
export function palette(on: boolean): Palette {
  return {
    bold: bold(on),
    dim: dim(on),
    ok: green(on),
    error: (s) => bold(on)(red(on)(s)),
    warning: yellow(on),
    severity: (sev, s) => {
      switch (sev) {
        case 'S1':
          return bold(on)(red(on)(s));
        case 'S2':
          return magenta(on)(s);
        case 'S3':
          return yellow(on)(s);
        default:
          return dim(on)(s);
      }
    },
  };
}
