// Lõi của CLI: `run(argv, io)` trả exit code. Phân tích tham số, chọn lệnh
// (nạp lười), bắt lỗi ngoài cùng. Không gọi `process.*`: mọi thứ bên ngoài đi
// qua `io`, nên test đầu-cuối chạy trong tiến trình.

import { bool, enumFlag, parse, type Parsed } from './args';
import { CliError, type ExitCode, InternalError, Interrupted } from './errors';
import { type Lang, resolveLang, t } from './i18n';
import type { IO } from './io';
import { colorEnabled } from './render/color';
import { renderError, renderInternal, renderWarning } from './render/errors';
import { writeJson } from './render/json';
import { renderWidth } from './render/layout';
import type { Session } from './session';
import { TOOL_VERSION } from './version';

const EMPTY: Parsed = { command: null, positionals: [], flags: {} };

export function makeSession(
  io: IO,
  args: Parsed,
  lang: Lang,
  json: boolean,
): Session {
  const debugOn = args.flags.debug === true || io.env.OCHO_DEBUG === '1';
  const noColorFlag = args.flags['no-color'] === true;
  const startedMs = io.clock();
  const s: Session = {
    io,
    args,
    lang,
    json,
    color:
      !json &&
      colorEnabled({ isTTY: io.isTTY.stdout, env: io.env, noColorFlag }),
    colorErr: colorEnabled({
      isTTY: io.isTTY.stderr,
      env: io.env,
      noColorFlag,
    }),
    width: renderWidth(io.isTTY.stdout, io.columns),
    startedMs,
    debugOn,
    t: (key, params) => t(lang, key, params),
    debug: (line) => {
      if (debugOn)
        io.stderr.write(`[debug +${io.clock() - startedMs}ms] ${line}\n`);
    },
    warn: (e) => renderWarning(s, e),
    note: (line) => io.stderr.write(`${line}\n`),
  };
  return s;
}

/** Nạp văn bản của spec (luật, mã chẩn đoán); tiếng Anh luôn có làm dự phòng. */
async function loadSpecText(lang: Lang): Promise<void> {
  await import('@ochotona/spec/i18n/en');
  if (lang === 'vi') await import('@ochotona/spec/i18n/vi');
}

function handle(s: Session, e: unknown): ExitCode {
  if (e instanceof CliError) {
    renderError(s, e);
    return e.exitCode;
  }
  if (e instanceof Interrupted) {
    const data = t(s.lang, `error.data.${e.data}`, { file: e.file ?? '' });
    if (s.json)
      writeJson(s, {
        schema: 'ocho.error/1',
        code: 'INTERRUPTED',
        message: t(s.lang, 'error.interrupted'),
        data,
        next: '',
        exitCode: 130,
      });
    else {
      if (e.data === 'file_write')
        s.io.stderr.write(`${t(s.lang, 'import.nothing_written')}\n`);
      s.io.stderr.write(`${t(s.lang, 'error.interrupted')} ${data}\n`);
    }
    return 130;
  }
  const err = e as Error;
  s.debug(`internal: ${err?.stack ?? String(e)}`);
  renderInternal(
    s,
    err instanceof InternalError ? err.message : String(err?.message ?? e),
    {
      tool: TOOL_VERSION,
      node: s.io.nodeVersion,
      os: `${s.io.platform}-${s.io.arch}`,
    },
  );
  return 5;
}

/**
 * Chạy một lệnh `ocho`. `argv` không có `node` và tên script.
 * @example await run(['doctor', '--context', 'prod', '--json'], io) // 0…5 hoặc 130
 */
export async function run(argv: readonly string[], io: IO): Promise<ExitCode> {
  // Đoán trước khi parse, để lỗi của chính bước parse đúng dạng và đúng ngôn ngữ.
  const jsonGuess = argv.includes('--json');
  const at = argv.indexOf('--lang');
  const langArg =
    argv.find((a) => a.startsWith('--lang='))?.slice('--lang='.length) ??
    (at >= 0 ? argv[at + 1] : undefined);
  let lang = resolveLang(
    langArg === 'en' || langArg === 'vi' ? langArg : undefined,
    io.env,
  );
  let s = makeSession(io, EMPTY, lang, jsonGuess);
  try {
    await loadSpecText(lang);
    const args = parse(argv);
    s = makeSession(io, args, lang, bool(args, 'json'));
    const langFlag = enumFlag(args, 'lang', ['en', 'vi'] as const);
    lang = resolveLang(langFlag, io.env);
    await loadSpecText(lang);
    s = makeSession(io, args, lang, bool(args, 'json'));
    s.debug(`ocho ${TOOL_VERSION} ${args.command ?? '-'} (lang ${lang})`);

    if (bool(args, 'help') || args.command === 'help') {
      const { help } = await import('./commands/help');
      // `ocho help <lệnh>`, `ocho <lệnh> --help`, và `ocho help --help`.
      const target =
        args.command === 'help'
          ? (args.positionals[0] ?? (bool(args, 'help') ? 'help' : undefined))
          : (args.command ?? undefined);
      return help(s, target);
    }
    if (bool(args, 'version') || args.command === 'version') {
      const { version } = await import('./commands/version');
      return version(s);
    }
    switch (args.command) {
      case null: {
        const { help } = await import('./commands/help');
        return help(s);
      }
      case 'doctor': {
        const { doctor } = await import('./commands/doctor');
        return await doctor(s);
      }
      case 'import': {
        const { importCmd } = await import('./commands/import');
        return await importCmd(s);
      }
      case 'explain': {
        const { explain } = await import('./commands/explain');
        return await explain(s);
      }
      case 'context': {
        const { context } = await import('./commands/context');
        return await context(s);
      }
      default:
        throw new InternalError(`no handler for ${args.command}`);
    }
  } catch (e) {
    return handle(s, e);
  }
}
