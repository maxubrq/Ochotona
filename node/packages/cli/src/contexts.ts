// File context: `$XDG_CONFIG_HOME/ochotona/contexts.yaml` (mặc định
// `~/.config/ochotona/contexts.yaml`), `%APPDATA%\ochotona\contexts.yaml` trên
// Windows. Thư mục 0700, file 0600. Đọc bằng `compiler.readOchoYaml` với cùng
// tuỳ chọn an toàn (không anchor, không tag); ghi bằng `formatString` của compiler.

import { formatString, readOchoYaml } from '@ochotona/compiler';
import { posix, win32 } from 'node:path';
import { CliError, diag, usage } from './errors';
import type { IO } from './io';

export interface ContextEntry {
  readonly url: string;
  readonly user: string;
  readonly password_command: string | null;
  /** Đường dẫn file PEM. */
  readonly ca: string | null;
  readonly insecure: boolean;
  /** `auto`, `off`, hoặc URL. */
  readonly prometheus: string;
}

export interface ContextFile {
  readonly current: string | null;
  readonly contexts: Readonly<Record<string, ContextEntry>>;
}

export const EMPTY_CONTEXTS: ContextFile = { current: null, contexts: {} };
export const CONTEXT_NAME = /^[a-z0-9][a-z0-9._-]*$/;

/** Đường dẫn file context theo nền tảng. */
export function contextsPath(
  io: Pick<IO, 'env' | 'platform' | 'homedir'>,
): string {
  if (io.platform === 'win32') {
    const base = io.env.APPDATA ?? win32.join(io.homedir, 'AppData', 'Roaming');
    return win32.join(base, 'ochotona', 'contexts.yaml');
  }
  const base =
    io.env.XDG_CONFIG_HOME && io.env.XDG_CONFIG_HOME !== ''
      ? io.env.XDG_CONFIG_HOME
      : posix.join(io.homedir, '.config');
  return posix.join(base, 'ochotona', 'contexts.yaml');
}

const isNotFound = (e: unknown) =>
  (e as { code?: string } | null)?.code === 'ENOENT';

function invalid(file: string, detail: string): CliError {
  return usage(
    'contexts.invalid',
    { file, detail },
    { key: 'contexts.invalid.next', params: { file } },
  );
}

function entryOf(file: string, name: string, v: unknown): ContextEntry {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw invalid(file, `contexts.${name} is not a map`);
  const o = v as Record<string, unknown>;
  const s = (k: string, required: boolean): string | null => {
    const x = o[k];
    if (x === undefined || x === null) {
      if (required) throw invalid(file, `contexts.${name}.${k} is missing`);
      return null;
    }
    if (typeof x !== 'string')
      throw invalid(file, `contexts.${name}.${k} must be a string`);
    return x;
  };
  const insecure = o.insecure ?? false;
  if (typeof insecure !== 'boolean')
    throw invalid(file, `contexts.${name}.insecure must be true or false`);
  return {
    url: s('url', true)!,
    user: s('user', true)!,
    password_command: s('password_command', false),
    ca: s('ca', false),
    insecure,
    prometheus: s('prometheus', false) ?? 'auto',
  };
}

/** Phân tích nội dung file context; lỗi là `CliError` exit 4. */
export function parseContexts(text: string, file: string): ContextFile {
  const read = readOchoYaml(text);
  const firstError = read.diagnostics.find((d) => d.severity === 'error');
  if (firstError)
    throw invalid(file, `${firstError.code} at line ${firstError.pos.line}`);
  const doc = read.value;
  if (doc === null || doc === undefined) return EMPTY_CONTEXTS;
  if (typeof doc !== 'object' || Array.isArray(doc))
    throw invalid(file, 'the file is not a map');
  const o = doc as Record<string, unknown>;
  if (o.version !== undefined && o.version !== 1)
    throw invalid(file, `version ${String(o.version)} is not supported`);
  const raw = o.contexts ?? {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw invalid(file, 'contexts is not a map');
  const contexts: Record<string, ContextEntry> = {};
  for (const [name, v] of Object.entries(raw)) {
    contexts[name] = entryOf(file, name, v);
  }
  const current = o.current ?? null;
  if (current !== null && typeof current !== 'string')
    throw invalid(file, 'current must be a string');
  return { current, contexts };
}

/** Văn bản file context, tất định: khoá theo thứ tự cố định, context theo tên. */
export function serializeContexts(f: ContextFile): string {
  const q = (s: string | null) => (s === null ? 'null' : formatString(s));
  const lines = [
    'version: 1',
    `current: ${q(f.current)}`,
    Object.keys(f.contexts).length === 0 ? 'contexts: {}' : 'contexts:',
  ];
  for (const name of Object.keys(f.contexts).sort()) {
    const c = f.contexts[name];
    lines.push(
      `  ${formatString(name)}:`,
      `    url: ${q(c.url)}`,
      `    user: ${q(c.user)}`,
      `    password_command: ${q(c.password_command)}`,
      `    ca: ${q(c.ca)}`,
      `    insecure: ${c.insecure}`,
      `    prometheus: ${q(c.prometheus)}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Đọc file context. Không có file thì trả rỗng. Trên POSIX, quyền rộng hơn 0600
 * thì gọi `warn` với chẩn đoán CX6 (mỗi lần đọc).
 */
export async function readContexts(
  io: IO,
  warn: (e: CliError) => void,
): Promise<{ file: string; data: ContextFile; exists: boolean }> {
  const file = contextsPath(io);
  let text: string;
  try {
    text = (await io.fs.readFile(file)).toString('utf8');
  } catch (e) {
    if (isNotFound(e)) return { file, data: EMPTY_CONTEXTS, exists: false };
    throw invalid(file, (e as Error).message);
  }
  if (io.platform !== 'win32') {
    const st = await io.fs.stat(file);
    if ((st.mode & 0o077) !== 0) {
      warn(
        diag('CX6', 4, {
          file,
          mode: `0${(st.mode & 0o777).toString(8)}`,
        }),
      );
    }
  }
  return { file, data: parseContexts(text, file), exists: true };
}

/** Ghi file context: thư mục 0700, file 0600, ghi tạm rồi `rename`. */
export async function writeContexts(
  io: IO,
  data: ContextFile,
): Promise<string> {
  const file = contextsPath(io);
  const path = io.platform === 'win32' ? win32 : posix;
  await io.fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${io.pid}`;
  try {
    await io.fs.fsyncWrite(tmp, serializeContexts(data), 0o600);
    await io.fs.rename(tmp, file);
  } catch (e) {
    await io.fs.unlink(tmp).catch(() => {});
    throw new CliError({
      code: 'FILE',
      exitCode: 4,
      data: 'file_write',
      file,
      msg: {
        key: 'file.write_failed',
        params: { file, detail: (e as Error).message },
      },
    });
  }
  if (io.platform !== 'win32') await io.fs.chmod(file, 0o600);
  return file;
}
