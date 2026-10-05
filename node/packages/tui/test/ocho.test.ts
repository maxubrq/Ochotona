// Cầu nối tới CLI: argv của đích, lệnh tương đương, hỏi mật khẩu khi thiếu
// (CX11) hay sai (CX3), không lộ mật khẩu ra đầu ra hay argv.

import { diagnose, explain, loadSpecText } from '@ochotona/cli/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MockServer } from '../../broker/tools/mock-mgmt.ts';
import {
  PASSWORD,
  USER,
  fakeIO,
  startReplay,
  tempDir,
} from '../../cli/test/helpers';
import { Cancelled, Ocho, type Target } from '../src/ocho';

beforeAll(() => loadSpecText('en'));

describe('targets and commands', () => {
  const ocho = new Ocho(fakeIO(), 'en');
  it('turns each target into the flags ocho takes', () => {
    expect(ocho.targetArgs({ kind: 'context', name: 'prod' })).toEqual([
      '--context',
      'prod',
    ]);
    expect(
      ocho.targetArgs({ kind: 'url', url: 'http://h:15672', user: 'u' }),
    ).toEqual(['--url', 'http://h:15672', '--user', 'u']);
    expect(ocho.targetArgs({ kind: 'snapshot', file: 's.json' })).toEqual([
      '--from',
      's.json',
    ]);
    expect(ocho.targetArgs({ kind: 'cli', args: ['--ca', 'x.pem'] })).toEqual([
      '--ca',
      'x.pem',
    ]);
  });

  it('prints the equivalent ocho command, quoting only when needed', () => {
    expect(
      ocho.command(['doctor', '--vhost', 'pay ments', '--context', 'prod']),
    ).toBe("ocho doctor --vhost 'pay ments' --context prod");
    expect(ocho.command(['explain', "it's"])).toBe(`ocho explain 'it'\\''s'`);
  });

  it('runs a CLI command in-process and captures its output at the given width', async () => {
    const r = await ocho.run(['explain', 'T2'], { width: 70 }, explain);
    expect(r.out[0]).toBe('T2  Unroutable messages can be dropped');
    expect(
      Math.max(...r.out.map((l) => l.replace(/\u001b\[[0-9;]*m/g, '').length)),
    ).toBeLessThanOrEqual(80);
  });
});

describe('passwords', () => {
  let mock: MockServer;
  beforeAll(async () => {
    mock = await startReplay('rabbitmq-4.2/full');
    const overview = mock.routes['/api/overview'];
    // Chỉ nhận đúng mật khẩu của test, như broker thật.
    mock.routes['/api/overview'] = (req) => {
      const auth = Buffer.from(
        String(req.headers.authorization ?? '').replace(/^Basic /, ''),
        'base64',
      ).toString();
      if (auth !== `${USER}:${PASSWORD}`)
        return { status: 401, json: { error: 'not_authorised' } };
      return typeof overview === 'function' ? overview(req) : overview;
    };
  });
  afterAll(() => mock.close());

  const target = (): Target => ({ kind: 'url', url: mock.url, user: USER });
  const argv = () => [
    'doctor',
    '--url',
    mock.url,
    '--user',
    USER,
    '--no-prometheus',
    '--max-rps',
    '20',
  ];

  it('asks once when no source is set (CX11), then reuses the password', async () => {
    const ocho = new Ocho(fakeIO({}, await tempDir()), 'en');
    const asked: (string | undefined)[] = [];
    const ask = async (prompt: string, retry: string | undefined) => {
      asked.push(retry);
      // Cùng lời nhắc với CLI, host rút gọn như `shortHost`.
      expect(prompt).toBe('Password for ocho-doctor@127.0…:');
      return PASSWORD;
    };
    const r = await ocho.run(
      argv(),
      { width: 100, target: target(), ask },
      (s) => diagnose(s),
    );
    expect(r.value.exitCode).toBe(1);
    expect(asked).toEqual([undefined]);
    expect(ocho.hasPassword(target())).toBe(true);
    await ocho.run(argv(), { width: 100, target: target(), ask }, (s) =>
      diagnose(s),
    );
    expect(asked).toHaveLength(1);
    expect(mock.requests.every((q) => q.method === 'GET')).toBe(true);
  });

  it('asks again after a wrong password (CX3), saying why', async () => {
    const ocho = new Ocho(fakeIO({}, await tempDir()), 'en');
    const answers = ['wrong', PASSWORD];
    const reasons: (string | undefined)[] = [];
    const r = await ocho.run(
      argv(),
      {
        width: 100,
        target: target(),
        ask: async (_, retry) => {
          reasons.push(retry);
          return answers.shift()!;
        },
      },
      (s) => diagnose(s),
    );
    expect(reasons).toEqual([undefined, 'CX3']);
    expect(r.value.results.length).toBeGreaterThan(0);
  });

  it('a wrong OCHO_PASSWORD in the environment can be corrected in the dialog', async () => {
    const ocho = new Ocho(
      fakeIO({ env: { OCHO_PASSWORD: 'stale' } }, await tempDir()),
      'en',
    );
    const reasons: (string | undefined)[] = [];
    await ocho.run(
      argv(),
      {
        width: 100,
        target: target(),
        ask: async (_, retry) => (reasons.push(retry), PASSWORD),
      },
      (s) => diagnose(s),
    );
    expect(reasons).toEqual(['CX3']);
  });

  it('cancelling the dialog stops with Cancelled, not an error', async () => {
    const ocho = new Ocho(fakeIO({}, await tempDir()), 'en');
    await expect(
      ocho.run(
        argv(),
        { width: 100, target: target(), ask: async () => null },
        (s) => diagnose(s),
      ),
    ).rejects.toBeInstanceOf(Cancelled);
  });

  it('errors render like the CLI: message, Data, Next', async () => {
    const ocho = new Ocho(fakeIO({}, await tempDir()), 'en');
    const e = await ocho
      .run(argv(), { width: 100 }, (s) => diagnose(s))
      .catch((x) => x);
    const lines = ocho
      .errorLines(e, 100)
      .map((l) => l.replace(/\u001b\[[0-9;]*m/g, ''));
    expect(lines[0]).toMatch(/^error CX11: /);
    expect(lines.some((l) => l.startsWith('  Data'))).toBe(true);
    expect(lines.some((l) => l.startsWith('  Next'))).toBe(true);
  });
});
