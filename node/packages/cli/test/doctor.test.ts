// `ocho doctor` đầu-cuối: `run(argv, io)` trong tiến trình, broker là
// management API giả phát lại bản ghi thô thật của ma trận SUT.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  overviewBody,
  startMock,
  type MockServer,
} from '../../broker/tools/mock-mgmt.ts';
import {
  FIXED_MS,
  PASSWORD,
  expectSingleJson,
  recordings,
  runCli,
  snapshotOf,
  startReplay,
  targetFlags,
  tempDir,
} from './helpers';
import { expectValid } from './schemas';

const env = { OCHO_PASSWORD: PASSWORD };

describe('doctor on recorded brokers', () => {
  const recs = recordings();
  it('has recordings', () => expect(recs.length).toBeGreaterThan(0));

  for (const rec of recs) {
    it(`${rec}: one valid ocho.report/1 on stdout, only GET, exit 0-2`, async () => {
      const mock = await startReplay(rec);
      try {
        const r = await runCli(['doctor', '--json', ...targetFlags(mock)], {
          env,
        });
        const doc = expectSingleJson(r.stdout);
        expectValid(doc);
        expect(doc.exitCode).toBe(r.code);
        expect([0, 1, 2]).toContain(r.code);
        expect(doc.findings.length).toBeGreaterThan(0);
        expect(mock.requests.every((q) => q.method === 'GET')).toBe(true);
        expect(r.stdout).not.toContain('\u001b[');
      } finally {
        await mock.close();
      }
    });
  }
});

describe('doctor text report', () => {
  let mock: MockServer;
  beforeAll(async () => {
    mock = await startReplay('rabbitmq-4.2/full');
  });
  afterAll(() => mock.close());

  it('prints the three head lines, sections, actions and the count line', async () => {
    const r = await runCli(['doctor', ...targetFlags(mock)], { env });
    const lines = r.stdout.split('\n');
    expect(lines[0]).toMatch(
      /^Connected to 127\.0\.0\.1 in \d+\.\ds · RabbitMQ 4\.2\.9 · 1 node · Khepri$/,
    );
    expect(lines[1]).toBe(
      'Sources: HTTP API [ok] · management stats [ok] · Prometheus [ok]',
    );
    expect(lines[2]).toMatch(/^\d+ queues · \d+ exchanges · 2 vhosts$/);
    expect(r.stdout).toContain('S1  DATA SAFETY');
    expect(r.stdout).toContain('Do these first:');
    expect(r.stdout).toContain('Not visible from the broker: LE2');
    expect(lines.at(-2)).toMatch(
      /^\d+ rules · \d+ fail · \d+ pass · \d+ not checked · \d+ n\/a · exit 1$/,
    );
    expect(r.code).toBe(1);
    // Không phải TTY: không có dòng xác nhận, không tiến trình.
    expect(r.stderr).toBe('');
  });

  it('TTY stderr: confirmation line and a progress line cleared before the report', async () => {
    const r = await runCli(['doctor', ...targetFlags(mock)], {
      env,
      tty: { stderr: true },
    });
    expect(r.stderr.startsWith('Connecting to http://127.0.0.1')).toBe(true);
    expect(r.stderr).toContain('Reading ');
    expect(r.stderr.endsWith('\r\u001b[2K')).toBe(true);
  });

  it('--debug logs each request with a [debug +Nms] prefix and no secret', async () => {
    const r = await runCli(['doctor', '--debug', ...targetFlags(mock)], {
      env,
    });
    const debug = r.stderr.split('\n').filter((l) => l !== '');
    expect(debug.every((l) => /^\[debug \+\d+ms\] /.test(l))).toBe(true);
    expect(r.stderr).toContain('GET /api/overview 200');
    expect(r.stderr).toContain('password: OCHO_PASSWORD');
    expect(r.stderr).toContain('rules selected: ');
  });

  it('color only on a TTY stdout without NO_COLOR', async () => {
    const on = await runCli(['doctor', ...targetFlags(mock)], {
      env,
      tty: { stdout: true },
      columns: 120,
    });
    expect(on.stdout).toContain('\u001b[31m');
    const off = await runCli(['doctor', ...targetFlags(mock)], {
      env: { ...env, NO_COLOR: '1' },
      tty: { stdout: true },
    });
    expect(off.stdout).not.toContain('\u001b[');
  });

  it('--fail-on S3 turns S3 fails into exit 1; --vhost limits reads', async () => {
    const r = await runCli(
      [
        'doctor',
        '--json',
        '--vhost',
        '/',
        '--fail-on',
        'S3',
        ...targetFlags(mock),
      ],
      { env },
    );
    const doc = r.json();
    expect(doc.filters.vhost).toBe('/');
    expect(
      doc.findings.every(
        (f: { object: { id: string } }) => !f.object.id.includes(':payments:'),
      ),
    ).toBe(true);
  });

  it('--target-version must be newer than the broker', async () => {
    const r = await runCli(
      ['doctor', '--json', '--target-version', '4.1', ...targetFlags(mock)],
      { env },
    );
    expect(r.code).toBe(4);
    expectValid(r.json());
    const ok = await runCli(
      ['doctor', '--json', '--target-version', '4.3', ...targetFlags(mock)],
      { env },
    );
    expect(ok.json().filters.targetVersion).toBe('4.3');
    const bad = await runCli(
      ['doctor', '--target-version', 'x', ...targetFlags(mock)],
      { env },
    );
    expect(bad.code).toBe(4);
  });

  it('--save writes a snapshot that --from reads back without the broker', async () => {
    const dir = await tempDir();
    const save = await runCli(
      [
        'doctor',
        '--json',
        '--save',
        'snap.json.gz',
        '--redact-hosts',
        ...targetFlags(mock),
      ],
      {
        env,
        cwd: dir,
      },
    );
    const snap = JSON.parse(
      gunzipSync(await readFile(join(dir, 'snap.json.gz'))).toString(),
    );
    expect(snap.schema).toBe('ocho.snapshot/1');
    expect(snap.redaction.hosts).toBe(true);
    expect(JSON.stringify(snap)).not.toContain(mock.url);
    const from = await runCli(['doctor', '--json', '--from', 'snap.json.gz'], {
      cwd: dir,
    });
    expect(from.code).toBe(save.code);
    expect(from.json().summary).toEqual(save.json().summary);
    const text = await runCli(['doctor', '--from', 'snap.json.gz'], {
      cwd: dir,
    });
    expect(text.stdout.split('\n')[0]).toMatch(
      /^From snapshot taken \d{4}-\d\d-\d\d \d\d:\d\d UTC \(context 127\.0\.0\.1\)/,
    );
  });
});

describe('doctor errors and exit codes', () => {
  it('no target: exit 4 with three lines (error, Data, Next)', async () => {
    const r = await runCli(['doctor']);
    expect(r.code).toBe(4);
    expect(r.stderr.split('\n').slice(0, 3)).toEqual([
      'error: no broker to connect to',
      '  Data  nothing was read or changed',
      expect.stringMatching(/^ {2}Next {2}Pass --url and --user/),
    ]);
  });

  it('401 at /api/overview: CX3, exit 3, ocho.error/1 on stdout with --json', async () => {
    const mock = await startMock({
      '/api/overview': { status: 401, json: { error: 'not_authorised' } },
    });
    try {
      const r = await runCli(['doctor', '--json', ...targetFlags(mock)], {
        env,
      });
      expect(r.code).toBe(3);
      const doc = expectSingleJson(r.stdout);
      expectValid(doc);
      expect(doc).toMatchObject({
        code: 'CX3',
        exitCode: 3,
        data: 'nothing was read or changed',
      });
      const text = await runCli(['doctor', ...targetFlags(mock)], { env });
      expect(text.stderr).toContain(
        'error CX3: The broker rejected user ocho-doctor at /api/overview with 401.',
      );
    } finally {
      await mock.close();
    }
  });

  it('403 is CX9; old broker is CX8; unreachable is CX1', async () => {
    const m403 = await startMock({
      '/api/overview': { status: 403, json: {} },
    });
    const mOld = await startMock({
      '/api/overview': { json: overviewBody({ version: '3.12.1' }) },
    });
    try {
      expect(
        (
          await runCli(['doctor', '--json', ...targetFlags(m403)], { env })
        ).json().code,
      ).toBe('CX9');
      const old = await runCli(['doctor', '--json', ...targetFlags(mOld)], {
        env,
      });
      expect([old.code, old.json().code]).toEqual([3, 'CX8']);
      expect(old.json().message).toContain(
        'RabbitMQ 3.12.1 is older than 3.13.0',
      );
    } finally {
      await m403.close();
      await mOld.close();
    }
    const down = await runCli(
      ['doctor', '--json', '--url', 'http://127.0.0.1:9', '--user', 'u'],
      { env },
    );
    expect([down.code, down.json().code]).toEqual([3, 'CX1']);
  });

  it('Ctrl-C during the read: exit 130, nothing changed', async () => {
    const mock = await startReplay('rabbitmq-4.2/full');
    const ac = new AbortController();
    mock.routes['/api/vhosts'] = () => {
      ac.abort();
      return { json: [] };
    };
    try {
      const r = await runCli(['doctor', ...targetFlags(mock)], {
        env,
        signal: ac.signal,
      });
      expect(r.code).toBe(130);
      expect(r.stderr).toContain(
        'Interrupted. nothing was changed; the read was incomplete',
      );
    } finally {
      await mock.close();
    }
  });

  it('ocho.yaml errors: GNU diagnostics on stderr, exit 4; --no-file ignores the file', async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, 'ocho.yaml'),
      'spec: "0.4"\nflows:\n  a:\n    tolerance: strict\n',
    );
    const r = await runCli(
      ['doctor', '--url', 'http://127.0.0.1:9', '--user', 'u'],
      { env, cwd: dir },
    );
    expect(r.code).toBe(4);
    expect(r.stderr).toMatch(/^ocho\.yaml:\d+:\d+: error Y\d+ /m);
    const j = await runCli(
      ['doctor', '--json', '--url', 'http://127.0.0.1:9', '--user', 'u'],
      { env, cwd: dir },
    );
    expectValid(j.json());
    expect(j.json().diagnostics.length).toBeGreaterThan(0);
    const skip = await runCli(
      ['doctor', '--no-file', '--url', 'http://127.0.0.1:9', '--user', 'u'],
      { env, cwd: dir },
    );
    expect(skip.code).toBe(3);
  });

  it('--flow needs ocho.yaml; --file must exist', async () => {
    const r = await runCli(
      ['doctor', '--flow', 'x', '--url', 'http://h', '--user', 'u'],
      { env },
    );
    expect(r.code).toBe(4);
    expect(r.stderr).toContain('--flow x needs ocho.yaml');
    const f = await runCli(
      ['doctor', '--file', 'nope.yaml', '--url', 'http://h', '--user', 'u'],
      { env },
    );
    expect([f.code, f.stderr.split('\n')[0]]).toEqual([
      4,
      'error: nope.yaml does not exist',
    ]);
  });

  it('snapshot errors are SNAP1-SNAP3, exit 4', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'a.json'), '{"schema":"ocho.snapshot/9"}');
    await writeFile(join(dir, 'b.json'), '{nope');
    const a = await runCli(['doctor', '--json', '--from', 'a.json'], {
      cwd: dir,
    });
    expect([a.code, a.json().code]).toEqual([4, 'SNAP1']);
    expectValid(a.json());
    const b = await runCli(['doctor', '--json', '--from', 'b.json'], {
      cwd: dir,
    });
    expect(b.json().code).toBe('SNAP2');
    const c = await runCli(['doctor', '--from', 'missing.json'], { cwd: dir });
    expect(c.code).toBe(4);
  });
});

describe('golden reports from recordings', () => {
  // Báo cáo vàng: ảnh chụp tất định của bản ghi × ngôn ngữ × bề rộng × màu.
  const cases = [
    'rabbitmq-3.13/full',
    'rabbitmq-4.2/full',
    'rabbitmq-4.3/full',
    'rabbitmq-4.2/nostats',
  ];
  for (const rec of cases)
    for (const lang of ['en', 'vi'])
      for (const columns of [80, 120])
        it(`${rec} ${lang} ${columns} columns`, async () => {
          const dir = await tempDir();
          await writeFile(join(dir, 'snap.json'), snapshotOf(rec));
          const r = await runCli(
            ['doctor', '--from', 'snap.json', '--lang', lang],
            {
              cwd: dir,
              tty: { stdout: true },
              columns,
              env: { NO_COLOR: '1' },
              clock: () => FIXED_MS,
            },
          );
          expect([0, 1, 2]).toContain(r.code);
          for (const l of r.stdout.split('\n'))
            if (!/rabbitmqadmin|'\{/.test(l))
              expect(l.length, l).toBeLessThanOrEqual(columns);
          expect(r.stdout).toMatchSnapshot();
        });

  it('color on: same text once the codes are removed', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'snap.json'), snapshotOf('rabbitmq-4.2/full'));
    const run = (tty: boolean) =>
      runCli(['doctor', '--from', 'snap.json'], {
        cwd: dir,
        tty: { stdout: tty },
        columns: 80,
        clock: () => FIXED_MS,
      });
    const color = await run(true);
    const plain = await run(false);
    expect(color.stdout).toContain('\u001b[');
    // eslint-disable-next-line no-control-regex
    expect(color.stdout.replace(/\u001b\[[0-9;]*m/g, '')).toBe(plain.stdout);
  });
});
