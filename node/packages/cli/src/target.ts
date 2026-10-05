// Dựng `BrokerTarget` cho @ochotona/broker từ cờ, biến môi trường và file
// context. Nơi duy nhất trong CLI chạm tới mật khẩu.
//
// Thứ tự ưu tiên cho mọi giá trị: cờ > biến môi trường > context đang chọn >
// mặc định. `--url` và `--context` cùng có thì `--url` thắng, kèm cảnh báo.

import { type BrokerTarget, normalizeUrl } from '@ochotona/broker';
import { bool, str } from './args';
import type { ContextEntry, ContextFile } from './contexts';
import { CliError, diag, usage } from './errors';
import { readHidden } from './prompt/hidden';
import { LineReader } from './prompt/terminal';
import type { Session } from './session';

export const PASSWORD_COMMAND_TIMEOUT_MS = 10_000;
export const PASSWORD_COMMAND_MAX_BYTES = 64 * 1024;

export interface ResolvedTarget {
  readonly target: BrokerTarget;
  /** Tên context, hoặc host khi dùng `--url`. */
  readonly name: string;
  /** `null` khi dùng `--url`. */
  readonly context: string | null;
}

/** Nguồn đích sau khi áp thứ tự ưu tiên, chưa có mật khẩu. */
export interface TargetSpec {
  readonly url: string;
  readonly user: string;
  readonly context: string | null;
  readonly entry: ContextEntry | null;
  readonly caFile: string | null;
  readonly insecure: boolean;
  readonly prometheus: BrokerTarget['prometheus'];
}

const nonEmpty = (s: string | undefined) =>
  s === undefined || s === '' ? undefined : s;

/**
 * Chọn đích theo thứ tự ưu tiên. Không đọc đĩa, không hỏi gì; ném `CliError`
 * exit 4 khi thiếu thông tin.
 */
export function pickTarget(
  s: Pick<Session, 'args' | 'io' | 'warn'>,
  file: ContextFile,
): TargetSpec {
  const { args, io } = s;
  const env = io.env;
  const flagUrl = nonEmpty(str(args, 'url'));
  const flagContext = nonEmpty(str(args, 'context'));
  const envUrl = nonEmpty(env.OCHO_URL);
  const envContext = nonEmpty(env.OCHO_CONTEXT);

  // Cờ thắng biến môi trường; trong cùng một tầng, URL thắng context.
  let url: string | undefined;
  let contextName: string | undefined;
  if (flagUrl) {
    url = flagUrl;
    if (flagContext || envContext)
      s.warn(
        new CliError({
          code: 'ARGS',
          exitCode: 4,
          msg: {
            key: 'target.url_wins',
            params: { context: (flagContext ?? envContext)! },
          },
        }),
      );
  } else if (flagContext) {
    contextName = flagContext;
  } else if (envUrl) {
    url = envUrl;
    if (envContext)
      s.warn(
        new CliError({
          code: 'ARGS',
          exitCode: 4,
          msg: { key: 'target.url_wins', params: { context: envContext } },
        }),
      );
  } else {
    contextName = envContext ?? file.current ?? undefined;
  }

  let entry: ContextEntry | null = null;
  if (url === undefined) {
    if (contextName === undefined)
      throw usage('target.none', {}, { key: 'target.none.next' });
    entry = file.contexts[contextName] ?? null;
    if (!entry)
      throw usage(
        'target.unknown_context',
        {
          context: contextName,
          known: Object.keys(file.contexts).sort().join(', ') || '-',
        },
        { key: 'target.unknown_context.next' },
      );
    url = entry.url;
  }

  const user =
    nonEmpty(str(args, 'user')) ?? nonEmpty(env.OCHO_USER) ?? entry?.user;
  if (user === undefined)
    throw usage('target.user_missing', {}, { key: 'target.user_missing.next' });

  const caFile =
    nonEmpty(str(args, 'ca')) ?? nonEmpty(env.OCHO_CA) ?? entry?.ca ?? null;
  const insecure = bool(args, 'insecure') || (entry?.insecure ?? false);

  let prometheus: BrokerTarget['prometheus'];
  const promUrl = nonEmpty(str(args, 'prometheus-url'));
  if (bool(args, 'no-prometheus')) prometheus = 'off';
  else if (promUrl) prometheus = { url: promUrl };
  else if (!entry || entry.prometheus === 'auto') prometheus = 'auto';
  else if (entry.prometheus === 'off') prometheus = 'off';
  else prometheus = { url: entry.prometheus };

  return {
    url,
    user,
    context: entry ? contextName! : null,
    entry,
    caFile,
    insecure,
    prometheus,
  };
}

/** Host rút gọn cho lời nhắc mật khẩu: `b-1234.mq…`. */
export function shortHost(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return url;
  }
  const parts = host.split('.');
  return parts.length > 2 ? `${parts.slice(0, 2).join('.')}…` : host;
}

/** Chạy `password_command`: trần 10 giây, stdin đóng, lấy dòng đầu của stdout. */
export async function runPasswordCommand(
  s: Pick<Session, 'io' | 'debug'>,
  command: string,
): Promise<string> {
  const started = s.io.clock();
  const r = await s.io.exec(command, {
    timeoutMs: PASSWORD_COMMAND_TIMEOUT_MS,
    maxBytes: PASSWORD_COMMAND_MAX_BYTES,
  });
  const line = r.stdout.split(/\r?\n/)[0].trim();
  if (r.error || r.timedOut || r.code !== 0 || line === '') {
    // Không bao giờ kèm stdout: nó có thể là mật khẩu.
    const why = r.error ?? r.stderr.split(/\r?\n/)[0].trim();
    s.debug(
      `password_command: failed (${r.timedOut ? 'timeout' : `exit ${r.code ?? '-'}`})`,
    );
    throw diag(
      'CX7',
      4,
      { seconds: PASSWORD_COMMAND_TIMEOUT_MS / 1000 },
      { extra: why ? [why] : [] },
    );
  }
  s.debug(`password_command: ok (${s.io.clock() - started} ms)`);
  return line;
}

/**
 * Mật khẩu, theo thứ tự; nguồn đầu tiên có giá trị thắng: `--password-stdin`,
 * `OCHO_PASSWORD`, `password_command` của context, ô nhập ẩn (chỉ khi stdin
 * và stderr đều là terminal). Không có nguồn nào thì CX11.
 */
export async function resolvePassword(
  s: Session,
  spec: Pick<TargetSpec, 'user' | 'url'> & {
    readonly passwordCommand: string | null;
  },
): Promise<string> {
  const { io } = s;
  if (bool(s.args, 'password-stdin')) {
    const reader = new LineReader(io.stdin, io.signal);
    const line = await reader.next().finally(() => reader.close());
    s.debug('password: --password-stdin');
    return line ?? '';
  }
  if (io.env.OCHO_PASSWORD !== undefined && io.env.OCHO_PASSWORD !== '') {
    s.debug('password: OCHO_PASSWORD');
    return io.env.OCHO_PASSWORD;
  }
  if (spec.passwordCommand) {
    const p = await runPasswordCommand(s, spec.passwordCommand);
    s.debug('password: password_command');
    return p;
  }
  if (io.isTTY.stdin && io.isTTY.stderr) {
    const prompt = s.t('target.password_prompt', {
      user: spec.user,
      host: shortHost(spec.url),
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const p = await readHidden(io, prompt);
      if (p !== '') {
        s.debug('password: prompt');
        return p;
      }
    }
  }
  throw diag('CX11', 4, { user: spec.user });
}

/** Đọc file CA (PEM) trước khi gọi broker; không đọc được thì CX2. */
export async function readCa(
  s: Pick<Session, 'io'>,
  file: string,
): Promise<string> {
  try {
    return (await s.io.fs.readFile(file)).toString('utf8');
  } catch (e) {
    throw new CliError({
      code: 'CX2',
      exitCode: 3,
      msg: {
        key: 'target.ca_unreadable',
        params: { file, detail: (e as Error).message },
      },
      next: { key: 'diag.CX2.next' },
    });
  }
}

/**
 * Đích đầy đủ: chọn theo thứ tự ưu tiên, kiểm URL (CX4, CX10) trước khi hỏi
 * mật khẩu, đọc CA, cảnh báo CX5 khi `--insecure`.
 */
export async function resolveTarget(
  s: Session,
  file: ContextFile,
  override?: TargetSpec & { readonly passwordCommand: string | null },
): Promise<ResolvedTarget> {
  const spec: TargetSpec = override ?? pickTarget(s, file);
  const url = normalizeUrl(spec.url);
  if (!url.ok)
    throw diag(
      url.error.diag,
      4,
      { url: spec.url },
      { extra: [url.error.detail] },
    );
  const name = spec.context ?? url.value.hostname;
  const password = await resolvePassword(s, {
    user: spec.user,
    url: spec.url,
    passwordCommand: override
      ? override.passwordCommand
      : (spec.entry?.password_command ?? null),
  });
  const ca = spec.caFile ? await readCa(s, spec.caFile) : undefined;
  if (spec.insecure) s.warn(diag('CX5', 4, {}));
  const tls =
    ca !== undefined || spec.insecure
      ? {
          ...(ca !== undefined ? { ca } : {}),
          ...(spec.insecure ? { insecure: true } : {}),
        }
      : undefined;
  return {
    target: {
      url: spec.url,
      user: spec.user,
      password,
      name,
      prometheus: spec.prometheus,
      ...(tls ? { tls } : {}),
    },
    name,
    context: spec.context,
  };
}
