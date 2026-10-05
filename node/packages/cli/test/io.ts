// IO giả cho `run(argv, io)` trong tiến trình. Không import gì ngoài gói cli,
// để chạy được trong sandbox của Stryker.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, expect } from 'vitest';
import type { Exec, IO } from '../src/io';
import { nodeFs } from '../src/io-node';
import { run } from '../src/run';
import { trackOutput } from './secrets';

export const PASSWORD = 'Pa55-w0rd-for-tests';
export const USER = 'ocho-doctor';
/** Thời điểm cố định cho test tất định. */
export const FIXED_MS = Date.parse('2026-10-04T08:00:00.000Z');

const tmpDirs: string[] = [];
afterEach(async () => {
  for (const d of tmpDirs.splice(0))
    await rm(d, { recursive: true, force: true });
});

export async function tempDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'ocho-cli-'));
  tmpDirs.push(d);
  return d;
}

export interface FakeOptions {
  env?: Record<string, string | undefined>;
  tty?: Partial<IO['isTTY']>;
  columns?: number;
  stdin?: string | PassThrough;
  exec?: Exec;
  fs?: Partial<IO['fs']>;
  cwd?: string;
  home?: string;
  clock?: () => number;
  platform?: NodeJS.Platform;
  signal?: AbortSignal;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  /** stdout parse thành JSON (một document). */
  json(): any;
}

export interface FakeIO extends IO {
  readonly out: string[];
  readonly err: string[];
}

export function fakeIO(o: FakeOptions = {}, dir = tmpdir()): FakeIO {
  const out: string[] = [];
  const err: string[] = [];
  let stdin: PassThrough;
  if (o.stdin instanceof PassThrough) stdin = o.stdin;
  else {
    stdin = new PassThrough();
    stdin.end(o.stdin ?? '');
  }
  let seed = 0;
  return {
    out,
    err,
    stdout: { write: (s) => void out.push(s) },
    stderr: { write: (s) => void err.push(s) },
    stdin,
    env: {
      HOME: o.home ?? dir,
      XDG_CONFIG_HOME: join(o.home ?? dir, 'cfg'),
      ...o.env,
    },
    isTTY: { stdin: false, stdout: false, stderr: false, ...o.tty },
    columns: o.columns,
    clock: o.clock ?? (() => Date.now()),
    fs: { ...nodeFs, ...o.fs },
    exec:
      o.exec ??
      (async () => ({
        code: 127,
        stdout: '',
        stderr: 'no exec in test',
        timedOut: false,
      })),
    signal: o.signal ?? new AbortController().signal,
    cwd: o.cwd ?? dir,
    platform: o.platform ?? 'linux',
    homedir: o.home ?? dir,
    pid: 4242,
    randomBytes: (n) =>
      Uint8Array.from({ length: n }, () => (seed = (seed * 31 + 7) % 256)),
    nodeVersion: 'v22.0.0',
    arch: 'x64',
  };
}

/** Chạy `ocho` trong tiến trình. Mọi đầu ra đi qua hook quét bí mật. */
export async function runCli(
  argv: readonly string[],
  o: FakeOptions = {},
): Promise<RunResult & { io: FakeIO }> {
  const dir = o.cwd ?? (await tempDir());
  const io = fakeIO(o, dir);
  const code = await run(argv, io);
  const stdout = io.out.join('');
  const stderr = io.err.join('');
  trackOutput(stdout, stderr);
  return {
    code,
    stdout,
    stderr,
    io,
    json: () => JSON.parse(stdout),
  };
}

/** stdout có đúng một document JSON, kết thúc bằng một ký tự xuống dòng. */
export function expectSingleJson(stdout: string): any {
  expect(stdout.endsWith('\n')).toBe(true);
  expect(stdout.endsWith('\n\n')).toBe(false);
  return JSON.parse(stdout);
}
