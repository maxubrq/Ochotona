import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type MockServer, startMock } from '../../broker/tools/mock-mgmt.ts';
import { PASSWORD, USER, runCli, startReplay, tempDir } from './helpers';
import { expectValid } from './schemas';

const env = { OCHO_PASSWORD: PASSWORD };

describe('ocho context', () => {
  let mock: MockServer;
  beforeAll(async () => {
    mock = await startReplay('rabbitmq-4.2/full');
  });
  afterAll(() => mock.close());

  it('add verifies with identify, saves 0600, becomes current', async () => {
    const home = await tempDir();
    const r = await runCli(
      ['context', 'add', 'sut', '--url', mock.url, '--user', USER],
      { env, home },
    );
    expect(r.code).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe(
      'sut: RabbitMQ 4.2.9 · 1 node · user tags monitoring',
    );
    const file = join(home, 'cfg', 'ochotona', 'contexts.yaml');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    const text = await readFile(file, 'utf8');
    expect(text).toContain('current: sut');
    expect(text).not.toContain(PASSWORD);
    // Chỉ pha nhận diện, chỉ GET.
    expect(mock.requests.every((q) => q.method === 'GET')).toBe(true);
  });

  it('add rules: name pattern, duplicates, missing flags, --no-verify', async () => {
    const home = await tempDir();
    const add = (...a: string[]) =>
      runCli(['context', 'add', ...a], { env, home });
    expect(
      (await add('Bad Name', '--url', 'http://h', '--user', 'u')).code,
    ).toBe(4);
    expect((await add('ok')).code).toBe(4);
    expect(
      (await add('a', '--url', 'http://h:1', '--user', 'u', '--no-verify'))
        .code,
    ).toBe(0);
    expect(
      (await add('a', '--url', 'http://h:1', '--user', 'u', '--no-verify'))
        .stderr,
    ).toContain('context a already exists');
    const b = await add(
      'b',
      '--url',
      'http://h:2',
      '--user',
      'u',
      '--no-verify',
      '--password-command',
      'echo x',
    );
    expect(b.stdout).toContain('Saved context b');
    expect(b.stdout).not.toContain('current context');
  });

  it('failed verification: CX3, exit 3, nothing saved', async () => {
    const home = await tempDir();
    const bad = await startMock({ '/api/overview': { status: 401, json: {} } });
    try {
      const r = await runCli(
        ['context', 'add', 'x', '--url', bad.url, '--user', USER],
        { env, home },
      );
      expect(r.code).toBe(3);
      expect(r.stderr).toContain('error CX3');
      const list = await runCli(['context', 'list', '--json'], { home });
      expect(list.json().contexts).toEqual([]);
    } finally {
      await bad.close();
    }
  });

  it('list, show, use, remove; JSON never shows the password command', async () => {
    const home = await tempDir();
    const run = (...a: string[]) => runCli(['context', ...a], { env, home });
    await run(
      'add',
      'a',
      '--url',
      'http://a:1',
      '--user',
      'u',
      '--no-verify',
      '--password-command',
      'op read secret',
    );
    await run('add', 'b', '--url', 'http://b:1', '--user', 'v', '--no-verify');
    const list = await run('list');
    expect(list.stdout.split('\n')[1]).toMatch(/^\*\s+a\s+http:\/\/a:1\s+u$/);
    const j = await run('list', '--json');
    expectValid(j.json());
    expect(j.stdout).not.toContain('op read secret');
    expect(j.json().contexts[0].passwordCommand).toBe('set');
    const show = await run('show', 'b');
    expect(show.stdout).toMatch(/^password_command\s+not set$/m);
    expect((await run('use', 'b')).stdout).toBe('Switched to context b.\n');
    expect((await run('show', '--json')).json()).toMatchObject({
      current: 'b',
      contexts: [{ name: 'b', current: true }],
    });
    expect((await run('use', 'zzz')).code).toBe(4);
    // Không phải TTY: cần --yes.
    expect((await run('remove', 'b')).code).toBe(4);
    expect((await run('remove', 'b', '--yes')).stdout).toBe(
      'Removed context b.\n',
    );
    expect((await run('show', '--json')).code).toBe(4);
  });

  it('remove asks on a terminal', async () => {
    const home = await tempDir();
    await runCli(
      [
        'context',
        'add',
        'a',
        '--url',
        'http://a:1',
        '--user',
        'u',
        '--no-verify',
      ],
      { home },
    );
    const no = new PassThrough();
    no.end('n\n');
    const kept = await runCli(['context', 'remove', 'a'], {
      home,
      stdin: no,
      tty: { stdin: true },
    });
    expect(kept.stderr).toContain('Remove context a? [y/N] ');
    expect(kept.stderr).toContain('Context a was kept.');
    const yes = new PassThrough();
    yes.end('y\n');
    const gone = await runCli(['context', 'remove', 'a'], {
      home,
      stdin: yes,
      tty: { stdin: true },
    });
    expect(gone.stdout).toBe('Removed context a.\n');
  });

  it('doctor uses the current context and its password_command', async () => {
    const home = await tempDir();
    await runCli(
      [
        'context',
        'add',
        'sut',
        '--url',
        mock.url,
        '--user',
        USER,
        '--no-verify',
        '--password-command',
        'pw',
      ],
      {
        home,
      },
    );
    let ran = '';
    const r = await runCli(
      ['doctor', '--json', '--max-rps', '20', '--no-prometheus'],
      {
        home,
        exec: async (cmd) => {
          ran = cmd;
          return {
            code: 0,
            stdout: `${PASSWORD}\n`,
            stderr: '',
            timedOut: false,
          };
        },
      },
    );
    expect(ran).toBe('pw');
    expectValid(r.json());
    expect(r.json().sources.prometheus).toBe('not_attempted');
  });

  it('subcommand errors', async () => {
    expect((await runCli(['context'])).code).toBe(4);
    expect((await runCli(['context', 'lst'])).stderr).toContain(
      'did you mean list?',
    );
    expect((await runCli(['context', 'use'])).code).toBe(4);
  });
});
