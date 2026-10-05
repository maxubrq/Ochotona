// `runTui(argv, io)`: kiểm cờ bằng chính bộ phân tích của CLI (cùng cờ với
// `ocho doctor`), rồi mở giao diện toàn màn hình. Có đích sẵn (`--url`,
// `--context`, `--from`, hay `OCHO_URL`, `OCHO_CONTEXT`) thì vào thẳng Doctor.

import {
  CliError,
  type IO,
  type Parsed,
  loadSpecText,
  makeSession,
  parse,
  renderError,
  resolveLang,
  str,
  usage,
} from '@ochotona/cli/api';
import { render } from 'ink';
import React from 'react';
import { App } from './App';
import { bindT } from './i18n';
import { Ocho, type Target } from './ocho';
import { Doctor } from './views/Doctor';
import { Home } from './views/Home';
import { targetLabel } from './views/actions';
import { TUI_VERSION } from './version';

/** Cờ chọn và kết nối broker: đi cùng mọi lệnh trên đích từ dòng lệnh. */
const TARGET_FLAGS = [
  'context',
  'url',
  'user',
  'ca',
  'insecure',
  'prometheus-url',
  'no-prometheus',
  'max-rps',
  'concurrency',
];
/** Cờ riêng của `doctor` mà TUI giữ làm mặc định của lần chạy đầu. */
const DOCTOR_FLAGS = [
  'vhost',
  'flow',
  'target-version',
  'fail-on',
  'file',
  'no-file',
  'experimental',
];
/** Cờ không hợp với giao diện tương tác. */
const REFUSED = ['json', 'password-stdin', 'save', 'redact-hosts'];

function tokens(p: Parsed, names: readonly string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    const v = p.flags[n];
    if (v === true) out.push(`--${n}`);
    else if (typeof v === 'string') out.push(`--${n}`, v);
    else if (Array.isArray(v)) for (const x of v) out.push(`--${n}`, x);
  }
  return out;
}

export interface TuiOptions {
  /** stdin, stdout thật cho Ink; mặc định là của tiến trình. */
  readonly stdin?: NodeJS.ReadStream;
  readonly stdout?: NodeJS.WriteStream;
}

/**
 * Chạy `ocho-tui`. `argv` không có `node` và tên script.
 * @example await runTui(['--context', 'prod'], nodeIO()) // 0 khi thoát bình thường
 */
export async function runTui(
  argv: readonly string[],
  io: IO,
  o: TuiOptions = {},
): Promise<number> {
  const langGuess = resolveLang(undefined, io.env);
  let s = makeSession(
    io,
    { command: null, positionals: [], flags: {} },
    langGuess,
    false,
  );
  try {
    const args = parse(['doctor', ...argv]);
    const lang = resolveLang(str(args, 'lang'), io.env);
    s = makeSession(io, args, lang, false);
    await loadSpecText(lang);
    const t = bindT(lang);
    if (args.flags.help === true) {
      io.stdout.write(`${t('usage')}\n`);
      return 0;
    }
    if (args.flags.version === true) {
      io.stdout.write(`ocho-tui ${TUI_VERSION}\n`);
      return 0;
    }
    if (args.positionals.length > 0)
      throw usage('args.unknown_command', { command: args.positionals[0] });
    // Lỗi riêng của TUI: một dòng, gợi ý dùng `ocho`.
    const refused = REFUSED.find((f) => args.flags[f] !== undefined);
    const problem = refused
      ? t('refused_flag', { flag: refused })
      : !io.isTTY.stdin || !io.isTTY.stdout
        ? t('needs_tty')
        : null;
    if (problem) {
      io.stderr.write(`ocho-tui: ${problem}\n`);
      return 4;
    }

    const ocho = new Ocho(io, lang);
    const from = str(args, 'from');
    const targetArgs = tokens(args, TARGET_FLAGS);
    const cliTarget: Target | undefined =
      targetArgs.length > 0 || io.env.OCHO_URL || io.env.OCHO_CONTEXT
        ? { kind: 'cli', args: targetArgs }
        : undefined;
    const startTarget: Target | undefined = from
      ? { kind: 'snapshot', file: from }
      : args.flags.url !== undefined ||
          args.flags.context !== undefined ||
          io.env.OCHO_URL ||
          io.env.OCHO_CONTEXT
        ? cliTarget
        : undefined;

    const initial: { title: string; node: React.ReactNode }[] = [
      {
        title: t('home.crumb'),
        node: <Home {...(cliTarget ? { cliTarget } : {})} />,
      },
    ];
    if (startTarget)
      initial.push({
        title: `${t('doctor.title')} · ${targetLabel(t, startTarget)}`,
        node: (
          <Doctor target={startTarget} flags={tokens(args, DOCTOR_FLAGS)} />
        ),
      });

    const ink = render(<App ocho={ocho} initial={initial} />, {
      stdin: o.stdin ?? process.stdin,
      stdout: o.stdout ?? process.stdout,
      exitOnCtrlC: false,
      alternateScreen: true,
      patchConsole: true,
    });
    await ink.waitUntilExit();
    return 0;
  } catch (e) {
    if (e instanceof CliError) {
      renderError(s, e);
      return e.exitCode;
    }
    throw e;
  }
}
