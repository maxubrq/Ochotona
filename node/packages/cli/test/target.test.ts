import '@ochotona/spec/i18n/en';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/args';
import type { ContextEntry, ContextFile } from '../src/contexts';
import { CliError, Interrupted } from '../src/errors';
import { makeSession } from '../src/run';
import {
  pickTarget,
  resolvePassword,
  resolveTarget,
  runPasswordCommand,
  shortHost,
} from '../src/target';
import { type FakeOptions, PASSWORD, USER, fakeIO, tempDir } from './io';
import { trackOutput } from './secrets';

const entry = (over: Partial<ContextEntry> = {}): ContextEntry => ({
  url: 'https://prod.example:15671',
  user: 'ctx-user',
  password_command: null,
  ca: null,
  insecure: false,
  prometheus: 'auto',
  ...over,
});

const FILE: ContextFile = {
  current: 'prod',
  contexts: {
    prod: entry(),
    stage: entry({ url: 'https://stage.example:15671', user: 'stage-user' }),
  },
};

function session(argv: string[], o: FakeOptions = {}) {
  const io = fakeIO(o);
  const s = makeSession(io, parse(['doctor', ...argv]), 'en', false);
  return { s, io, stderr: () => io.err.join('') };
}

const caught = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    return e as CliError;
  }
  throw new Error('expected an error');
};

describe('pickTarget: flag > env > current context > default', () => {
  it('current context when nothing else is given', () => {
    const t = pickTarget(session([]).s, FILE);
    expect(t).toMatchObject({
      url: 'https://prod.example:15671',
      user: 'ctx-user',
      context: 'prod',
    });
  });

  it('OCHO_CONTEXT beats the current context; --context beats OCHO_CONTEXT', () => {
    expect(
      pickTarget(session([], { env: { OCHO_CONTEXT: 'stage' } }).s, FILE)
        .context,
    ).toBe('stage');
    expect(
      pickTarget(
        session(['--context', 'prod'], { env: { OCHO_CONTEXT: 'stage' } }).s,
        FILE,
      ).context,
    ).toBe('prod');
  });

  it('--context beats OCHO_URL; OCHO_URL beats the current context', () => {
    expect(
      pickTarget(
        session(['--context', 'stage'], {
          env: { OCHO_URL: 'http://env:15672', OCHO_USER: 'u' },
        }).s,
        FILE,
      ).url,
    ).toBe('https://stage.example:15671');
    const t = pickTarget(
      session([], { env: { OCHO_URL: 'http://env:15672', OCHO_USER: 'u' } }).s,
      FILE,
    );
    expect(t).toMatchObject({
      url: 'http://env:15672',
      user: 'u',
      context: null,
    });
  });

  it('--url wins over --context, with a warning on stderr', () => {
    const { s, stderr } = session([
      '--url',
      'http://h:15672',
      '--user',
      'u',
      '--context',
      'prod',
    ]);
    expect(pickTarget(s, FILE)).toMatchObject({
      url: 'http://h:15672',
      context: null,
    });
    expect(stderr()).toContain(
      'warning: --url is set, so context prod is ignored',
    );
  });

  it('OCHO_URL with OCHO_CONTEXT: URL wins, with a warning', () => {
    const { s, stderr } = session([], {
      env: {
        OCHO_URL: 'http://h:15672',
        OCHO_USER: 'u',
        OCHO_CONTEXT: 'stage',
      },
    });
    expect(pickTarget(s, FILE).url).toBe('http://h:15672');
    expect(stderr()).toContain('context stage is ignored');
  });

  it('user, CA, insecure: flag > env > context', () => {
    expect(
      pickTarget(session(['--user', 'f'], { env: { OCHO_USER: 'e' } }).s, FILE)
        .user,
    ).toBe('f');
    expect(
      pickTarget(session([], { env: { OCHO_USER: 'e' } }).s, FILE).user,
    ).toBe('e');
    const withCa = {
      ...FILE,
      contexts: { prod: entry({ ca: '/ctx.pem', insecure: true }) },
    };
    expect(
      pickTarget(
        session(['--ca', '/f.pem'], { env: { OCHO_CA: '/e.pem' } }).s,
        withCa,
      ).caFile,
    ).toBe('/f.pem');
    expect(
      pickTarget(session([], { env: { OCHO_CA: '/e.pem' } }).s, withCa).caFile,
    ).toBe('/e.pem');
    expect(pickTarget(session([]).s, withCa)).toMatchObject({
      caFile: '/ctx.pem',
      insecure: true,
    });
    expect(pickTarget(session(['--insecure']).s, FILE).insecure).toBe(true);
    expect(pickTarget(session([]).s, FILE)).toMatchObject({
      caFile: null,
      insecure: false,
    });
  });

  it('prometheus: --no-prometheus > --prometheus-url > context', () => {
    const ctx = (p: string) => ({
      ...FILE,
      contexts: { prod: entry({ prometheus: p }) },
    });
    expect(pickTarget(session([]).s, FILE).prometheus).toBe('auto');
    expect(pickTarget(session([]).s, ctx('off')).prometheus).toBe('off');
    expect(
      pickTarget(session([]).s, ctx('http://p:9090/metrics')).prometheus,
    ).toEqual({ url: 'http://p:9090/metrics' });
    expect(
      pickTarget(session(['--prometheus-url', 'http://x/m']).s, ctx('off'))
        .prometheus,
    ).toEqual({ url: 'http://x/m' });
    expect(
      pickTarget(
        session(['--no-prometheus', '--prometheus-url', 'http://x/m']).s,
        FILE,
      ).prometheus,
    ).toBe('off');
  });

  it('errors: no target, unknown context, missing user', async () => {
    const empty: ContextFile = { current: null, contexts: {} };
    expect((await caught(() => pickTarget(session([]).s, empty))).msg.key).toBe(
      'target.none',
    );
    const unknown = await caught(() =>
      pickTarget(session(['--context', 'nope']).s, FILE),
    );
    expect(unknown.msg).toEqual({
      key: 'target.unknown_context',
      params: { context: 'nope', known: 'prod, stage' },
    });
    expect(unknown.exitCode).toBe(4);
    expect(
      (await caught(() => pickTarget(session(['--url', 'http://h']).s, empty)))
        .msg.key,
    ).toBe('target.user_missing');
  });
});

describe('resolvePassword: first source with a value wins', () => {
  const spec = {
    user: USER,
    url: 'https://b-1234.mq.example.com',
    passwordCommand: 'op read x',
  };
  const exec =
    (stdout: string, extra: object = {}) =>
    async () => ({
      code: 0,
      stdout,
      stderr: '',
      timedOut: false,
      ...extra,
    });

  it('--password-stdin: first line, trailing newline removed', async () => {
    const { s } = session(['--password-stdin', '--debug'], {
      stdin: `${PASSWORD}\r\nsecond\n`,
      env: { OCHO_PASSWORD: 'env' },
    });
    expect(await resolvePassword(s, spec)).toBe(PASSWORD);
  });

  it('OCHO_PASSWORD before password_command', async () => {
    const { s, stderr } = session(['--debug'], {
      env: { OCHO_PASSWORD: PASSWORD },
      exec: exec('cmd'),
    });
    expect(await resolvePassword(s, spec)).toBe(PASSWORD);
    expect(stderr()).toContain('password: OCHO_PASSWORD');
    expect(stderr()).not.toContain(PASSWORD);
  });

  it('password_command: first line, trimmed; debug says only ok and time', async () => {
    const { s, stderr } = session(['--debug'], {
      exec: exec(`  ${PASSWORD}  \nignored\n`),
    });
    expect(await resolvePassword(s, spec)).toBe(PASSWORD);
    expect(stderr()).toMatch(/password_command: ok \(\d+ ms\)/);
    trackOutput(stderr());
  });

  it('password_command failures are CX7 with the first stderr line, never stdout', async () => {
    const cases = [
      exec('', { code: 0 }),
      exec('   \n'),
      exec(PASSWORD, { code: 1, stderr: 'vault: denied\nmore' }),
      exec(PASSWORD, { code: null, timedOut: true }),
      exec('', { code: null, error: 'spawn ENOENT' }),
    ];
    for (const e of cases) {
      const err = await caught(
        runPasswordCommand(session([], { exec: e }).s, 'cmd'),
      );
      expect(err.code).toBe('CX7');
      expect(err.exitCode).toBe(4);
      expect(JSON.stringify(err.extra ?? [])).not.toContain(PASSWORD);
    }
    const denied = await caught(
      runPasswordCommand(session([], { exec: cases[2] }).s, 'cmd'),
    );
    expect(denied.extra).toEqual(['vault: denied']);
  });

  it('passes the 10 s cap and 64 KB limit to exec', async () => {
    let seen: unknown;
    const { s } = session([], {
      exec: async (_c, o) => {
        seen = o;
        return { code: 0, stdout: 'x', stderr: '', timedOut: false };
      },
    });
    await runPasswordCommand(s, 'cmd');
    expect(seen).toEqual({ timeoutMs: 10_000, maxBytes: 65_536 });
  });

  it('hidden prompt only when stdin and stderr are terminals', async () => {
    const stdin = new PassThrough() as PassThrough & {
      setRawMode: (b: boolean) => void;
    };
    const raw: boolean[] = [];
    // Echo phải tắt trước khi lời nhắc hiện, không thì phím gõ ngay sau đó lộ ra.
    let promptBeforeRaw: boolean | null = null;
    stdin.setRawMode = (b) => {
      raw.push(b);
      if (b) promptBeforeRaw = stderr().includes('Password for');
    };
    const { s, stderr } = session([], {
      stdin,
      tty: { stdin: true, stderr: true },
    });
    const p = resolvePassword(s, { ...spec, passwordCommand: null });
    stdin.write('ab');
    stdin.write('\u007fc\r');
    expect(await p).toBe('ac');
    expect(raw).toEqual([true, false]);
    expect(promptBeforeRaw).toBe(false);
    expect(stderr()).toContain('Password for ocho-doctor@b-1234.mq…: ');
  });

  it('hidden prompt: empty twice is CX11; Ctrl-C is an interrupt', async () => {
    const stdin = new PassThrough();
    const { s } = session([], { stdin, tty: { stdin: true, stderr: true } });
    const p = resolvePassword(s, { ...spec, passwordCommand: null });
    stdin.write('\r');
    setTimeout(() => stdin.write('\n'), 5);
    expect((await caught(p)).code).toBe('CX11');

    const stdin2 = new PassThrough();
    const s2 = session([], {
      stdin: stdin2,
      tty: { stdin: true, stderr: true },
    }).s;
    const p2 = resolvePassword(s2, { ...spec, passwordCommand: null });
    stdin2.write('\u0003');
    await expect(p2).rejects.toBeInstanceOf(Interrupted);
  });

  it('no source at all is CX11, exit 4', async () => {
    const err = await caught(
      resolvePassword(session([]).s, { ...spec, passwordCommand: null }),
    );
    expect(err.code).toBe('CX11');
    expect(err.exitCode).toBe(4);
    expect(err.msg.params).toEqual({ user: USER });
  });
});

describe('resolveTarget', () => {
  it('checks the URL before asking for a password (CX4, CX10)', async () => {
    const cx4 = await caught(
      resolveTarget(
        session(['--url', 'https://u:p@h:15671', '--user', 'u']).s,
        FILE,
      ),
    );
    expect([cx4.code, cx4.exitCode]).toEqual(['CX4', 4]);
    const cx10 = await caught(
      resolveTarget(session(['--url', 'ftp://h', '--user', 'u']).s, FILE),
    );
    expect(cx10.code).toBe('CX10');
  });

  it('reads the CA; an unreadable CA is CX2 with the path', async () => {
    const dir = await tempDir();
    const err = await caught(
      resolveTarget(
        session(['--ca', `${dir}/missing.pem`], {
          env: { OCHO_PASSWORD: PASSWORD },
        }).s,
        FILE,
      ),
    );
    expect(err.code).toBe('CX2');
    expect(err.msg.params?.file).toBe(`${dir}/missing.pem`);
  });

  it('builds the broker target; --insecure warns CX5', async () => {
    const { s, stderr } = session(['--insecure'], {
      env: { OCHO_PASSWORD: PASSWORD },
    });
    const t = await resolveTarget(s, FILE);
    expect(t.name).toBe('prod');
    expect(t.target).toMatchObject({
      url: 'https://prod.example:15671',
      user: 'ctx-user',
      name: 'prod',
      tls: { insecure: true },
    });
    expect(stderr()).toContain('warning CX5');
    const adhoc = await resolveTarget(
      session(['--url', 'http://h.example:15672', '--user', 'u'], {
        env: { OCHO_PASSWORD: PASSWORD },
      }).s,
      FILE,
    );
    expect(adhoc.name).toBe('h.example');
    expect(adhoc.target.tls).toBeUndefined();
  });
});

describe('shortHost', () => {
  it('keeps two labels', () => {
    expect(shortHost('https://b-1234.mq.ap-southeast-1.amazonaws.com')).toBe(
      'b-1234.mq…',
    );
    expect(shortHost('http://localhost:15672')).toBe('localhost');
    expect(shortHost('not a url')).toBe('not a url');
  });
});

describe('target details', () => {
  it('empty environment values count as unset', () => {
    const t = pickTarget(
      session([], { env: { OCHO_URL: '', OCHO_CONTEXT: '', OCHO_USER: '' } }).s,
      FILE,
    );
    expect(t).toMatchObject({ context: 'prod', user: 'ctx-user' });
    expect(
      pickTarget(session(['--user', ''], { env: { OCHO_USER: 'e' } }).s, FILE)
        .user,
    ).toBe('e');
  });

  it('error messages carry their next step', async () => {
    const empty: ContextFile = { current: null, contexts: {} };
    const none = await caught(() => pickTarget(session([]).s, empty));
    expect([none.code, none.msg, none.next]).toEqual([
      'ARGS',
      { key: 'target.none', params: {} },
      { key: 'target.none.next' },
    ]);
    const unknown = await caught(() =>
      pickTarget(session(['--context', 'x']).s, {
        current: null,
        contexts: {},
      }),
    );
    expect(unknown.msg.params).toEqual({ context: 'x', known: '-' });
    expect(unknown.next).toEqual({ key: 'target.unknown_context.next' });
    const user = await caught(() =>
      pickTarget(session(['--url', 'http://h']).s, empty),
    );
    expect([user.msg, user.next]).toEqual([
      { key: 'target.user_missing', params: {} },
      { key: 'target.user_missing.next' },
    ]);
    const known = await caught(() =>
      pickTarget(session(['--context', 'x']).s, {
        current: null,
        contexts: { zed: entry(), alpha: entry() },
      }),
    );
    expect(known.msg.params?.known).toBe('alpha, zed');
  });

  it('url-wins warning is a usage-coded warning', () => {
    const { s, stderr } = session(['--url', 'http://h', '--user', 'u'], {
      env: { OCHO_CONTEXT: 'stage' },
    });
    pickTarget(s, FILE);
    expect(stderr()).toBe(
      'warning: --url is set, so context stage is ignored\n',
    );
  });

  it('shortHost keeps hosts of two labels whole', () => {
    expect(shortHost('http://a.example')).toBe('a.example');
  });

  it('password_command: debug lines and CX7 details', async () => {
    const { s, stderr } = session(['--debug'], {
      exec: async () => ({ code: 3, stdout: '', stderr: '', timedOut: false }),
    });
    const e = await caught(runPasswordCommand(s, 'cmd'));
    expect(e.msg).toEqual({ key: 'diag.CX7.message', params: { seconds: 10 } });
    expect(e.extra).toEqual([]);
    expect(stderr()).toContain('password_command: failed (exit 3)');
    const t = session(['--debug'], {
      exec: async () => ({
        code: null,
        stdout: '',
        stderr: ' slow \n',
        timedOut: true,
      }),
    });
    const te = await caught(runPasswordCommand(t.s, 'cmd'));
    expect(te.extra).toEqual(['slow']);
    expect(t.stderr()).toContain('password_command: failed (timeout)');
    const n = session(['--debug'], {
      exec: async () => ({
        code: null,
        stdout: 'x',
        stderr: '',
        timedOut: false,
      }),
    });
    await caught(runPasswordCommand(n.s, 'cmd'));
    expect(n.stderr()).toContain('password_command: failed (exit -)');
    let now = 1000;
    const ok = session(['--debug'], {
      clock: () => now,
      exec: async () => {
        now += 124;
        return { code: 0, stdout: 'pw', stderr: '', timedOut: false };
      },
    });
    await runPasswordCommand(ok.s, 'cmd');
    expect(ok.stderr()).toContain('password_command: ok (124 ms)');
  });

  it('every password source names itself in --debug', async () => {
    const spec = { user: USER, url: 'http://h', passwordCommand: 'c' };
    const a = session(['--debug', '--password-stdin'], { stdin: '' });
    expect(await resolvePassword(a.s, spec)).toBe('');
    expect(a.stderr()).toContain('password: --password-stdin');
    const b = session(['--debug'], {
      env: { OCHO_PASSWORD: '' },
      exec: async () => ({
        code: 0,
        stdout: 'from-cmd',
        stderr: '',
        timedOut: false,
      }),
    });
    expect(await resolvePassword(b.s, spec)).toBe('from-cmd');
    expect(b.stderr()).toContain('password: password_command');
    const stdin = new PassThrough();
    const c = session(['--debug'], {
      stdin,
      tty: { stdin: true, stderr: true },
    });
    const p = resolvePassword(c.s, { ...spec, passwordCommand: null });
    stdin.write('typed\r');
    expect(await p).toBe('typed');
    expect(c.stderr()).toContain('password: prompt');
  });

  it('a prompt needs both stdin and stderr to be terminals', async () => {
    const spec = { user: USER, url: 'http://h', passwordCommand: null };
    expect(
      (
        await caught(
          resolvePassword(session([], { tty: { stdin: true } }).s, spec),
        )
      ).code,
    ).toBe('CX11');
    expect(
      (
        await caught(
          resolvePassword(session([], { tty: { stderr: true } }).s, spec),
        )
      ).code,
    ).toBe('CX11');
  });

  it('resolveTarget: CA content, CX10 details, the context password_command', async () => {
    const dir = await tempDir();
    const { writeFile } = await import('node:fs/promises');
    await writeFile(`${dir}/ca.pem`, 'PEM-DATA');
    let ran = '';
    const ctx: ContextFile = {
      current: 'p',
      contexts: {
        p: entry({ password_command: 'op read p', ca: `${dir}/ca.pem` }),
      },
    };
    const { s, stderr } = session([], {
      exec: async (cmd) => {
        ran = cmd;
        return { code: 0, stdout: PASSWORD, stderr: '', timedOut: false };
      },
    });
    const t = await resolveTarget(s, ctx);
    expect(ran).toBe('op read p');
    expect(t.target.tls).toEqual({ ca: 'PEM-DATA' });
    expect(t.target.password).toBe(PASSWORD);
    expect(stderr()).toBe('');
    const cx10 = await caught(
      resolveTarget(session(['--url', 'ftp://h', '--user', 'u']).s, FILE),
    );
    expect(cx10.msg).toEqual({
      key: 'diag.CX10.message',
      params: { url: 'ftp://h' },
    });
    expect(cx10.extra).toEqual(['scheme ftp']);
    const ca = await caught(
      resolveTarget(
        session(['--ca', `${dir}/no.pem`], { env: { OCHO_PASSWORD: 'x' } }).s,
        FILE,
      ),
    );
    expect([ca.msg.key, ca.next, ca.exitCode]).toEqual([
      'target.ca_unreadable',
      { key: 'diag.CX2.next' },
      3,
    ]);
  });

  it('resolveTarget with an override uses its password command, not the file', async () => {
    let ran = '';
    const { s } = session([], {
      exec: async (cmd) => {
        ran = cmd;
        return { code: 0, stdout: 'x', stderr: '', timedOut: false };
      },
    });
    await resolveTarget(s, FILE, {
      url: 'http://new:15672',
      user: 'u',
      context: 'new',
      entry: entry({ password_command: 'from-entry' }),
      caFile: null,
      insecure: false,
      prometheus: 'auto',
      passwordCommand: 'from-override',
    });
    expect(ran).toBe('from-override');
  });
});
