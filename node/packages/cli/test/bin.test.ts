// Chạy chính tệp thực thi như người dùng: `OCHO_BIN` là binary SEA
// (`pnpm test:sea`) hoặc `dist/bin/ocho.js` (chạy bằng node). Không đặt thì bỏ qua.
import { spawn } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MockServer } from '../../broker/tools/mock-mgmt.ts';
import {
  PASSWORD,
  expectSingleJson,
  startReplay,
  targetFlags,
  tempDir,
} from './helpers';
import { expectValid } from './schemas';

const BIN = process.env.OCHO_BIN;

interface Ran {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Bất đồng bộ: broker giả chạy trong chính tiến trình test, không được chặn event loop. */
function ocho(
  args: string[],
  env: Record<string, string> = {},
  input = '',
): Promise<Ran> {
  const [cmd, pre] = BIN!.endsWith('.js')
    ? [process.execPath, [BIN!]]
    : [BIN!, []];
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, [...pre, ...args], {
      env: { PATH: process.env.PATH ?? '', ...env },
      timeout: 60_000,
    });
    let stdout = '';
    let stderr = '';
    p.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    p.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, stdout, stderr }));
    p.stdin.end(input);
  });
}

describe.skipIf(!BIN)(`tệp thực thi ${BIN ?? ''}`, () => {
  let mock: MockServer;
  let home: string;
  let env: Record<string, string>;
  beforeAll(async () => {
    mock = await startReplay('rabbitmq-4.2/full');
  });
  // Thư mục tạm bị dọn sau mỗi test: mỗi test một HOME riêng.
  beforeEach(async () => {
    home = await tempDir();
    env = { HOME: home, XDG_CONFIG_HOME: join(home, '.config'), LANG: 'C' };
  });
  afterAll(() => mock.close());

  it('--version, version --json, help', async () => {
    expect(await ocho(['--version'])).toMatchObject({
      code: 0,
      stdout: 'ocho 0.1.0\n',
    });
    const v = await ocho(['version', '--json'], env);
    expectValid(expectSingleJson(v.stdout));
    expect((await ocho(['help'], env)).code).toBe(0);
  });

  it('doctor --json trên broker đã ghi; exit 1 vì có S1; mật khẩu qua stdin', async () => {
    const r = await ocho(
      ['doctor', '--json', '--password-stdin', ...targetFlags(mock)],
      env,
      `${PASSWORD}\n`,
    );
    expect(r.code).toBe(1);
    const doc = expectSingleJson(r.stdout);
    expectValid(doc);
    expect(doc.summary.fail).toBeGreaterThan(0);
    expect(r.stdout + r.stderr).not.toContain(PASSWORD);
  });

  it('doctor văn bản tiếng Việt, rồi --save và --from', async () => {
    const dir = await tempDir();
    const snap = join(dir, 'snap.json');
    const r = await ocho(
      ['doctor', '--lang', 'vi', '--save', snap, ...targetFlags(mock)],
      { ...env, OCHO_PASSWORD: PASSWORD },
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/^S1 /m);
    expect(statSync(snap).isFile()).toBe(true);
    const from = await ocho(['doctor', '--from', snap, '--json'], env);
    expect(from.code).toBe(1);
    expectValid(expectSingleJson(from.stdout));
  });

  it('context add rồi explain queue qua context; file context 0600', async () => {
    const secret = join(home, 'password.txt');
    writeFileSync(secret, `${PASSWORD}\n`);
    const add = await ocho(
      [
        'context',
        'add',
        'sut',
        '--url',
        mock.url,
        '--user',
        'ocho-doctor',
        '--password-command',
        `cat ${secret}`,
      ],
      env,
    );
    expect(add.code).toBe(0);
    const file = join(home, '.config', 'ochotona', 'contexts.yaml');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, 'utf8')).not.toContain(PASSWORD);
    const ex = await ocho(['explain', 'queue', 'overlap', '--json'], env);
    expect(ex.code).toBe(0);
    const doc = expectSingleJson(ex.stdout);
    expectValid(doc);
    expect(doc.object.brokerCheck).toBe('agrees');
  });

  it('import --non-interactive ghi ocho.yaml; import lại', async () => {
    const dir = await tempDir();
    const out = join(dir, 'ocho.yaml');
    const r = await ocho(
      ['import', '--non-interactive', '--out', out, ...targetFlags(mock)],
      { ...env, OCHO_PASSWORD: PASSWORD },
    );
    expect(r.code).toBe(0);
    expect(readFileSync(out, 'utf8')).toMatch(/^spec: /m);
  });

  it('lỗi cách dùng: exit 4, ocho.error/1 với --json', async () => {
    const r = await ocho(['doctor', '--bogus', '--json'], env);
    expect(r.code).toBe(4);
    expectValid(expectSingleJson(r.stdout));
  });
});
