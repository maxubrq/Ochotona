// Ngữ pháp dòng lệnh: `ocho [cờ chung] <lệnh> [tham số] [cờ của lệnh]`.
// Cờ đặt trước hay sau tên lệnh đều được. `node:util` parseArgs ở chế độ strict;
// cờ lạ thì exit 4 kèm gợi ý cờ gần nhất (Levenshtein ≤ 2).

import { parseArgs } from 'node:util';
import { usage } from './errors';

type Kind = 'string' | 'boolean';

interface FlagDef {
  readonly type: Kind;
  readonly multiple?: boolean;
  readonly short?: string;
}

export const GLOBAL_FLAGS: Readonly<Record<string, FlagDef>> = {
  context: { type: 'string' },
  url: { type: 'string' },
  user: { type: 'string' },
  'password-stdin': { type: 'boolean' },
  ca: { type: 'string' },
  insecure: { type: 'boolean' },
  'prometheus-url': { type: 'string' },
  'no-prometheus': { type: 'boolean' },
  'max-rps': { type: 'string' },
  concurrency: { type: 'string' },
  lang: { type: 'string' },
  json: { type: 'boolean' },
  'no-color': { type: 'boolean' },
  debug: { type: 'boolean' },
  version: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

export const COMMAND_FLAGS: Readonly<
  Record<string, Readonly<Record<string, FlagDef>>>
> = {
  doctor: {
    vhost: { type: 'string', multiple: true },
    flow: { type: 'string' },
    'target-version': { type: 'string' },
    'fail-on': { type: 'string' },
    file: { type: 'string' },
    'no-file': { type: 'boolean' },
    save: { type: 'string' },
    'redact-hosts': { type: 'boolean' },
    from: { type: 'string' },
    why: { type: 'boolean' },
    verbose: { type: 'boolean' },
    experimental: { type: 'boolean' },
  },
  import: {
    from: { type: 'string' },
    out: { type: 'string' },
    'non-interactive': { type: 'boolean' },
  },
  explain: {
    vhost: { type: 'string' },
    file: { type: 'string' },
    'no-file': { type: 'boolean' },
  },
  context: {
    'password-command': { type: 'string' },
    'no-verify': { type: 'boolean' },
    yes: { type: 'boolean' },
  },
  version: {},
  help: {},
};

export const COMMANDS = Object.keys(COMMAND_FLAGS);
export const CONTEXT_SUBCOMMANDS = ['add', 'use', 'list', 'show', 'remove'];

export type FlagValue = string | boolean | readonly string[];

export interface Parsed {
  /** `null`: không có lệnh (`ocho`, `ocho --version`). */
  readonly command: string | null;
  /** Tham số vị trí sau tên lệnh. */
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, FlagValue | undefined>>;
}

/** Khoảng cách Levenshtein, cho gợi ý cờ và lệnh gần đúng. */
export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return prev[b.length];
}

/** Ứng viên gần nhất với khoảng cách ≤ 2; hoà thì lấy cái đứng trước. */
export function closest(
  input: string,
  candidates: readonly string[],
): string | null {
  let best: string | null = null;
  let bestD = 3;
  for (const c of candidates) {
    const d = levenshtein(input, c);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

function toOptions(defs: Readonly<Record<string, FlagDef>>) {
  const out: Record<
    string,
    { type: Kind; multiple?: boolean; short?: string }
  > = {};
  for (const [name, d] of Object.entries(defs)) out[name] = { ...d };
  return out;
}

const ALL_FLAGS: Readonly<Record<string, FlagDef>> = Object.assign(
  {},
  GLOBAL_FLAGS,
  ...Object.values(COMMAND_FLAGS),
);

/** Tên lệnh: tham số vị trí đầu tiên, bỏ qua giá trị của cờ. */
function findCommand(argv: readonly string[]): string | null {
  const { tokens } = parseArgs({
    args: [...argv],
    options: toOptions(ALL_FLAGS),
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  const first = tokens.find((t) => t.kind === 'positional');
  return first && first.kind === 'positional' ? first.value : null;
}

/**
 * Phân tích `argv` (không có `node` và tên script). Ném `CliError` exit 4 khi
 * cờ lạ, thiếu giá trị, hay lệnh lạ.
 * @example parse(['doctor', '--vhost', 'a', '--json']).flags.vhost // ['a']
 */
export function parse(argv: readonly string[]): Parsed {
  const command = findCommand(argv);
  if (command !== null && !COMMAND_FLAGS[command]) {
    const near = closest(command, COMMANDS);
    throw near
      ? usage('args.unknown_command_near', { command, near })
      : usage('args.unknown_command', { command });
  }
  const defs = { ...GLOBAL_FLAGS, ...(command ? COMMAND_FLAGS[command] : {}) };
  let result: ReturnType<typeof parseArgs>;
  try {
    result = parseArgs({
      args: [...argv],
      options: toOptions(defs),
      strict: true,
      allowPositionals: true,
    });
  } catch (e) {
    throw fromParseError(e as Error & { code?: string }, defs, command);
  }
  const positionals = result.positionals.slice(command === null ? 0 : 1);
  return {
    command,
    positionals,
    flags: result.values as Record<string, FlagValue | undefined>,
  };
}

function fromParseError(
  e: Error & { code?: string },
  defs: Readonly<Record<string, FlagDef>>,
  command: string | null,
) {
  const where = command ?? 'ocho';
  // parse hỏng trước khi phiên biết lệnh: gợi ý trợ giúp của lệnh nằm ngay ở lỗi.
  const next = command
    ? { key: 'args.next_command', params: { command } }
    : null;
  if (e.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
    const m = /'(-{1,2}[^']+)'/.exec(e.message);
    const raw = m ? m[1] : '?';
    const flag = raw.replace(/^-+/, '').split('=')[0];
    const near = closest(flag, Object.keys(defs));
    if (near) return usage('args.unknown_flag_near', { flag, near }, next);
    // Cờ đúng của lệnh khác: nói rõ lệnh nào nhận nó.
    const owner = Object.entries(COMMAND_FLAGS).find(([, f]) => flag in f);
    if (owner)
      return usage(
        'args.flag_of_other_command',
        {
          flag,
          command: where,
          owner: owner[0],
        },
        next,
      );
    return usage('args.unknown_flag', { flag }, next);
  }
  if (e.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
    const m = /'(-{1,2}[^' ]+)/.exec(e.message);
    const flag = m ? m[1].replace(/^-+/, '') : '?';
    return defs[flag]?.type === 'boolean'
      ? usage('args.flag_takes_no_value', { flag }, next)
      : usage('args.flag_needs_value', { flag }, next);
  }
  return usage('args.invalid', { detail: e.message }, next);
}

/** Giá trị chuỗi của cờ; cờ lặp thì lấy lần cuối. */
export function str(p: Parsed, name: string): string | undefined {
  const v = p.flags[name];
  if (Array.isArray(v)) return v[v.length - 1];
  return typeof v === 'string' ? v : undefined;
}

export function bool(p: Parsed, name: string): boolean {
  return p.flags[name] === true;
}

export function list(p: Parsed, name: string): readonly string[] {
  const v = p.flags[name];
  if (Array.isArray(v)) return v;
  return typeof v === 'string' ? [v] : [];
}

/** Số nguyên trong `[min, max]`, không thì exit 4. */
export function intFlag(
  p: Parsed,
  name: string,
  min: number,
  max: number,
): number | undefined {
  const s = str(p, name);
  if (s === undefined) return undefined;
  const n = Number(s);
  if (!/^\d+$/.test(s) || n < min || n > max)
    throw usage('args.out_of_range', { flag: name, value: s, min, max });
  return n;
}

/** Một trong các giá trị cho phép, không thì exit 4. */
export function enumFlag<T extends string>(
  p: Parsed,
  name: string,
  allowed: readonly T[],
): T | undefined {
  const s = str(p, name);
  if (s === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(s))
    throw usage('args.not_one_of', {
      flag: name,
      value: s,
      allowed: allowed.join(', '),
    });
  return s as T;
}
