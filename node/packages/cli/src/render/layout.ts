// Bố cục văn bản: bề rộng, gói theo từ, khối nhãn thụt treo. Chỉ ký tự ASCII
// cho ký hiệu (`[ok]`, `->`, `x5`) để log CI và terminal cũ hiện đúng.

import type { Lang } from '@ochotona/spec';

/** Bề rộng = `columns` của stdout nếu là TTY, không thì 80; sàn 60. */
export function renderWidth(
  isTTY: boolean,
  columns: number | undefined,
): number {
  const w = isTTY && columns !== undefined && columns > 0 ? columns : 80;
  return Math.max(60, w);
}

/** Thay ký hiệu không ASCII trong nhãn đối tượng của model. */
export function ascii(s: string): string {
  return s.replace(/→/g, '->').replace(/×/g, 'x');
}

/**
 * Gói `text` theo từ trong `width` cột. Từ dài hơn cả dòng đứng riêng một dòng,
 * không bị cắt (tên queue, lệnh phải dán lại được).
 */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/ +/).filter((w) => w !== '');
    let line = '';
    for (const w of words) {
      if (line === '') line = w;
      else if (line.length + 1 + w.length <= width) line += ` ${w}`;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * Khối nhãn thụt treo:
 * ```
 *       What happened  1,240 unroutable messages were dropped since
 *                      2026-09-12 03:10 UTC.
 * ```
 * Mỗi giá trị có thể nhiều dòng; mỗi dòng gói riêng.
 */
export function labelBlock(
  rows: readonly (readonly [string, readonly string[]])[],
  opts: {
    readonly indent: number;
    readonly labelWidth: number;
    readonly width: number;
  },
): string[] {
  const pad = ' '.repeat(opts.indent);
  const hang = ' '.repeat(opts.indent + opts.labelWidth);
  const textWidth = Math.max(20, opts.width - opts.indent - opts.labelWidth);
  const out: string[] = [];
  for (const [label, values] of rows) {
    let first = true;
    for (const v of values) {
      for (const line of wrap(v, textWidth)) {
        out.push(
          first
            ? `${pad}${label.padEnd(opts.labelWidth)}${line}`
            : `${hang}${line}`,
        );
        first = false;
      }
    }
  }
  return out;
}

/** Độ dài hiện trên màn hình, bỏ mã màu ANSI. */
export function visibleLength(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '').length;
}

/** Gói một dòng có tiền tố; dòng sau thụt bằng độ dài tiền tố. */
export function hanging(prefix: string, text: string, width: number): string[] {
  const n = visibleLength(prefix);
  const hang = ' '.repeat(n);
  return wrap(text, Math.max(20, width - n)).map(
    (l, i) => (i === 0 ? prefix : hang) + l,
  );
}

/**
 * Xếp các phần ngăn bằng ` · ` vào dòng không quá `width`; dòng sau thụt hai
 * khoảng trắng. Một phần không bị cắt giữa chừng.
 */
export function joinFit(parts: readonly string[], width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const p of parts) {
    if (line === '') line = p;
    else if (visibleLength(line) + 3 + visibleLength(p) <= width)
      line += ` · ${p}`;
    else {
      out.push(line);
      line = `  ${p}`;
    }
  }
  out.push(line);
  return out;
}

/** Cột nhãn: nhãn dài nhất cộng hai khoảng trắng. */
export function labelWidth(labels: readonly string[]): number {
  return Math.max(...labels.map((l) => l.length)) + 2;
}

/** Thời điểm in một dạng cho cả hai ngôn ngữ: `2026-09-12 03:10 UTC`. */
export function fmtInstant(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const d = new Date(ms).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)} UTC`;
}

/** Thời lượng: `0.4s`, `12s`, `3m 05s`. */
export function fmtDuration(ms: number, lang: Lang = 'en'): string {
  if (ms < 10_000) {
    const x = (Math.max(0, ms) / 1000).toFixed(1);
    // Dấu thập phân theo ngôn ngữ, như mọi số khác: `0.4s`, `0,4s`.
    return `${lang === 'vi' ? x.replace('.', ',') : x}s`;
  }
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/**
 * Bảng cột cố định, cột cuối được gói. Dùng cho `explain` một đối tượng.
 * `cells[i][j]` có thể nhiều dòng (`\n`).
 */
export function table(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string[] {
  const all = [header, ...rows];
  const widths = header.map((_, j) =>
    Math.max(
      ...all.map((r) =>
        Math.max(...(r[j] ?? '').split('\n').map((x) => x.length)),
      ),
    ),
  );
  const out: string[] = [];
  for (const r of all) {
    const cells = r.map((c) => (c ?? '').split('\n'));
    const height = Math.max(...cells.map((c) => c.length));
    for (let k = 0; k < height; k++) {
      out.push(
        cells
          .map((c, j) =>
            j === cells.length - 1
              ? (c[k] ?? '')
              : (c[k] ?? '').padEnd(widths[j]),
          )
          .join('  ')
          .trimEnd(),
      );
    }
  }
  return out;
}
