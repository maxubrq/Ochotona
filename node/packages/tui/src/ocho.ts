// Cầu nối tới @ochotona/cli: TUI không tự làm việc gì với broker, file context
// hay ocho.yaml. Mỗi thao tác dựng một phiên CLI từ argv như người dùng gõ
// `ocho …`, với IO bắt lại đầu ra thay vì in lên terminal (Ink đang giữ nó).
// Nhờ vậy cờ, thứ tự ưu tiên, lỗi D5 và chữ của TUI đúng như CLI.
//
// Mật khẩu: không bao giờ vào argv hay đĩa. Khi CLI báo không có nguồn mật khẩu
// (CX11), mật khẩu sai (CX3) hoặc password_command hỏng (CX7), TUI hỏi bằng ô
// ẩn rồi chạy lại với `OCHO_PASSWORD` trong env của riêng phiên đó. Mật khẩu chỉ
// nằm trong bộ nhớ tới khi thoát.

import {
  CliError,
  type ContextFile,
  type IO,
  Interrupted,
  type Lang,
  type Session,
  loadSpecText,
  makeSession,
  parse,
  pickTarget,
  readContexts,
  renderError,
  renderInternal,
  shortHost,
  t as cliT,
  TOOL_VERSION,
} from '@ochotona/cli/api';
import { PassThrough } from 'node:stream';

/** Broker (hoặc ảnh chụp) mà một thao tác nhắm tới. */
export type Target =
  /** Như `ocho` không cờ đích: biến môi trường, rồi context hiện tại; kèm cờ lúc khởi động. */
  | { readonly kind: 'cli'; readonly args: readonly string[] }
  | { readonly kind: 'context'; readonly name: string }
  | { readonly kind: 'url'; readonly url: string; readonly user: string }
  | { readonly kind: 'snapshot'; readonly file: string };

/** Đầu ra một phiên đã in, tách dòng. */
export interface Captured {
  readonly out: string[];
  readonly err: string[];
}

/**
 * Hỏi mật khẩu trên giao diện. `null`: người dùng huỷ.
 * `retry` là lý do hỏi lại (mã CX), `undefined` ở lần hỏi đầu.
 */
export type AskPassword = (
  prompt: string,
  retry: string | undefined,
) => Promise<string | null>;

/** Người dùng huỷ ô mật khẩu: không phải lỗi, chỉ dừng thao tác. */
export class Cancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

/** Lỗi khiến TUI hỏi mật khẩu rồi thử lại. */
const PASSWORD_CODES = new Set(['CX11', 'CX3', 'CX7']);

const lines = (chunks: readonly string[]) => {
  const text = chunks.join('');
  if (text === '') return [];
  return text.replace(/\n$/, '').split('\n');
};

/**
 * IO của một phiên: đầu ra bắt lại; stdin rỗng (TUI không bao giờ để CLI tự
 * hỏi); stdout và stderr tính là terminal để có màu và bề rộng; stdin không
 * phải terminal, nên CLI báo CX11 thay vì tự hỏi mật khẩu.
 */
export function captureIO(
  base: IO,
  o: {
    readonly columns: number;
    readonly signal?: AbortSignal;
    readonly env?: Readonly<Record<string, string | undefined>>;
  },
): IO & { readonly captured: () => Captured } {
  const out: string[] = [];
  const err: string[] = [];
  const stdin = new PassThrough();
  stdin.end();
  return {
    ...base,
    stdout: { write: (s) => void out.push(s) },
    stderr: { write: (s) => void err.push(s) },
    stdin,
    env: { ...base.env, ...o.env },
    isTTY: { stdin: false, stdout: true, stderr: true },
    columns: o.columns,
    signal: o.signal ?? new AbortController().signal,
    captured: () => ({ out: lines(out), err: lines(err) }),
  };
}

export class Ocho {
  private readonly passwords = new Map<string, string>();
  private language: Lang;

  constructor(
    readonly io: IO,
    lang: Lang,
  ) {
    this.language = lang;
  }

  get lang(): Lang {
    return this.language;
  }

  /** Đổi ngôn ngữ; nạp văn bản của spec trước. */
  async setLang(lang: Lang): Promise<void> {
    await loadSpecText(lang);
    this.language = lang;
  }

  /** Cờ đích cho argv của CLI. */
  targetArgs(t: Target): string[] {
    switch (t.kind) {
      case 'cli':
        return [...t.args];
      case 'context':
        return ['--context', t.name];
      case 'url':
        return ['--url', t.url, '--user', t.user];
      case 'snapshot':
        return ['--from', t.file];
    }
  }

  /** Lệnh `ocho …` tương đương, để người dùng học dần CLI. */
  command(argv: readonly string[]): string {
    const q = (a: string) =>
      /^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`;
    return ['ocho', ...argv.map(q)].join(' ');
  }

  private passwordKey(t: Target): string {
    return JSON.stringify(t);
  }

  /** Mật khẩu đã nhập cho đích này trong lần chạy TUI hiện tại (để test). */
  hasPassword(t: Target): boolean {
    return this.passwords.has(this.passwordKey(t));
  }

  /**
   * Phiên CLI cho `argv`, với IO bắt đầu ra và bề rộng `width` (không có sàn
   * 60 cột của CLI: khung của TUI có thể hẹp hơn).
   */
  session(
    argv: readonly string[],
    o: {
      readonly width: number;
      readonly signal?: AbortSignal;
      readonly target?: Target;
    },
  ): { readonly s: Session; readonly captured: () => Captured } {
    const password = o.target
      ? this.passwords.get(this.passwordKey(o.target))
      : undefined;
    const io = captureIO(this.io, {
      columns: o.width,
      ...(o.signal ? { signal: o.signal } : {}),
      ...(password !== undefined ? { env: { OCHO_PASSWORD: password } } : {}),
    });
    const s = makeSession(io, parse(argv), this.language, false);
    return { s: { ...s, width: Math.max(20, o.width) }, captured: io.captured };
  }

  /** Phiên chỉ để render (khối báo cáo, nhãn), không chạy lệnh. */
  renderSession(width: number): Session {
    return this.session([], { width }).s;
  }

  /** Chữ của CLI theo ngôn ngữ hiện tại. */
  cliText(key: string, params?: Readonly<Record<string, string | number>>) {
    return cliT(this.language, key, params);
  }

  /** Lời nhắc mật khẩu như CLI: `Password for ocho-doctor@host:`. */
  async passwordPrompt(t: Target): Promise<string> {
    if (t.kind === 'url')
      return this.cliText('target.password_prompt', {
        user: t.user,
        host: shortHost(t.url),
      }).trim();
    const { s } = this.session(['doctor', ...this.targetArgs(t)], {
      width: 80,
    });
    try {
      const file = await readContexts(s.io, () => {});
      const spec = pickTarget(s, file.data);
      return this.cliText('target.password_prompt', {
        user: spec.user,
        host: shortHost(spec.url),
      }).trim();
    } catch {
      return this.cliText('target.password_prompt', {
        user: '?',
        host: '?',
      }).trim();
    }
  }

  /**
   * Chạy `fn` trên phiên của `argv`. Thiếu hoặc sai mật khẩu thì hỏi qua `ask`
   * rồi chạy lại. Trả giá trị, đầu ra đã bắt (stdout) và cảnh báo (stderr).
   */
  async run<T>(
    argv: readonly string[],
    o: {
      readonly width: number;
      readonly signal?: AbortSignal;
      readonly target?: Target;
      readonly ask?: AskPassword;
    },
    fn: (s: Session) => Promise<T> | T,
  ): Promise<{ readonly value: T } & Captured> {
    let retry: string | undefined;
    for (;;) {
      const { s, captured } = this.session(argv, o);
      try {
        const value = await fn(s);
        return { value, ...captured() };
      } catch (e) {
        const canAsk =
          e instanceof CliError &&
          PASSWORD_CODES.has(e.code) &&
          o.ask !== undefined &&
          o.target !== undefined &&
          o.target.kind !== 'snapshot';
        if (!canAsk) throw e;
        const password = await o.ask!(
          await this.passwordPrompt(o.target!),
          retry ?? (e.code === 'CX11' ? undefined : e.code),
        );
        if (password === null) throw new Cancelled();
        this.passwords.set(this.passwordKey(o.target!), password);
        retry = 'CX3';
      }
    }
  }

  /** Lỗi dừng lệnh, in như CLI (D5: chuyện gì, dữ liệu có an toàn không, làm gì tiếp). */
  errorLines(e: unknown, width: number): string[] {
    const { s, captured } = this.session([], { width });
    if (e instanceof Cancelled) return [];
    if (e instanceof CliError) renderError(s, e);
    else if (e instanceof Interrupted)
      s.io.stderr.write(`${this.cliText('error.interrupted')}\n`);
    else
      renderInternal(s, String((e as Error)?.message ?? e), {
        tool: TOOL_VERSION,
        node: this.io.nodeVersion,
        os: `${this.io.platform}-${this.io.arch}`,
      });
    return captured().err;
  }

  /** File context, kèm cảnh báo của CLI (CX6…) dạng dòng. */
  async contexts(): Promise<{
    readonly file: string;
    readonly data: ContextFile;
    readonly warnings: string[];
  }> {
    const { s, captured } = this.session([], { width: 100 });
    const r = await readContexts(s.io, (e) => s.warn(e));
    return { file: r.file, data: r.data, warnings: captured().err };
  }
}
