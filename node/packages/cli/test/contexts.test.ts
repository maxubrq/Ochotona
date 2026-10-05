import { chmod, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contextsPath,
  parseContexts,
  readContexts,
  serializeContexts,
  writeContexts,
} from '../src/contexts';
import { CliError } from '../src/errors';
import { fakeIO, tempDir } from './io';

describe('contextsPath', () => {
  it('XDG on Linux and macOS, APPDATA on Windows', () => {
    expect(
      contextsPath({ env: {}, platform: 'linux', homedir: '/home/a' }),
    ).toBe('/home/a/.config/ochotona/contexts.yaml');
    expect(
      contextsPath({
        env: { XDG_CONFIG_HOME: '/x' },
        platform: 'darwin',
        homedir: '/h',
      }),
    ).toBe('/x/ochotona/contexts.yaml');
    expect(
      contextsPath({
        env: { XDG_CONFIG_HOME: '' },
        platform: 'darwin',
        homedir: '/h',
      }),
    ).toBe('/h/.config/ochotona/contexts.yaml');
    expect(
      contextsPath({
        env: { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' },
        platform: 'win32',
        homedir: 'C:\\Users\\a',
      }),
    ).toBe('C:\\Users\\a\\AppData\\Roaming\\ochotona\\contexts.yaml');
    expect(
      contextsPath({ env: {}, platform: 'win32', homedir: 'C:\\Users\\a' }),
    ).toBe('C:\\Users\\a\\AppData\\Roaming\\ochotona\\contexts.yaml');
  });
});

describe('parse and serialize', () => {
  const data = {
    current: 'prod',
    contexts: {
      prod: {
        url: 'https://b-1234.mq.example.com',
        user: 'ocho-doctor',
        password_command: 'op read op://infra/rabbit-prod/password',
        ca: null,
        insecure: false,
        prometheus: 'auto',
      },
      on: {
        url: 'http://h:15672',
        user: 'yes',
        password_command: null,
        ca: '/etc/ca.pem',
        insecure: true,
        prometheus: 'off',
      },
    },
  };

  it('round trips, quoting YAML 1.1 words', () => {
    const text = serializeContexts(data);
    expect(text).toContain('  "on":\n');
    expect(text).toContain('    user: "yes"\n');
    expect(parseContexts(text, 'f')).toEqual(data);
    expect(serializeContexts({ current: null, contexts: {} })).toBe(
      'version: 1\ncurrent: null\ncontexts: {}\n',
    );
  });

  it('defaults optional fields', () => {
    expect(
      parseContexts('contexts:\n  a:\n    url: http://h\n    user: u\n', 'f')
        .contexts.a,
    ).toEqual({
      url: 'http://h',
      user: 'u',
      password_command: null,
      ca: null,
      insecure: false,
      prometheus: 'auto',
    });
    expect(parseContexts('', 'f')).toEqual({ current: null, contexts: {} });
  });

  it('rejects malformed files with exit 4', () => {
    const bad = [
      'a: [',
      '- 1',
      'version: 2',
      'contexts: []',
      'contexts:\n  a: 1',
      'contexts:\n  a:\n    user: u',
      'contexts:\n  a:\n    url: 1\n    user: u',
      'contexts:\n  a:\n    url: u\n    user: u\n    insecure: "no"',
      'current: 3',
      'x: &a 1\ny: *a',
    ];
    for (const b of bad) {
      const e = (() => {
        try {
          parseContexts(b, 'f');
        } catch (err) {
          return err as CliError;
        }
        return null;
      })();
      expect([b, e?.exitCode]).toEqual([b, 4]);
    }
  });
});

describe('read and write on disk', () => {
  it('writes the directory 0700 and the file 0600, atomically', async () => {
    const dir = await tempDir();
    const io = fakeIO({ home: dir }, dir);
    const file = await writeContexts(io, { current: null, contexts: {} });
    expect(file).toBe(join(dir, 'cfg', 'ochotona', 'contexts.yaml'));
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir, 'cfg', 'ochotona'))).mode & 0o777).toBe(0o700);
    expect(await readFile(file, 'utf8')).toBe(
      'version: 1\ncurrent: null\ncontexts: {}\n',
    );
  });

  it('missing file is empty; mode wider than 0600 warns CX6 on every read', async () => {
    const dir = await tempDir();
    const io = fakeIO({ home: dir }, dir);
    const warns: CliError[] = [];
    expect((await readContexts(io, (e) => warns.push(e))).exists).toBe(false);
    const file = await writeContexts(io, { current: null, contexts: {} });
    await readContexts(io, (e) => warns.push(e));
    expect(warns).toEqual([]);
    await chmod(file, 0o644);
    await readContexts(io, (e) => warns.push(e));
    expect(warns.map((w) => [w.code, w.msg.params?.mode])).toEqual([
      ['CX6', '0644'],
    ]);
    // Windows không kiểm quyền.
    await readContexts(
      fakeIO(
        { home: dir, platform: 'win32', env: { APPDATA: join(dir, 'cfg') } },
        dir,
      ),
      (e) => warns.push(e),
    );
    expect(warns).toHaveLength(1);
  });

  it('a failed write leaves the old file and no temp file', async () => {
    const dir = await tempDir();
    await mkdir(join(dir, 'cfg', 'ochotona'), { recursive: true });
    const file = join(dir, 'cfg', 'ochotona', 'contexts.yaml');
    await writeFile(file, 'version: 1\ncurrent: null\ncontexts: {}\n');
    const io = fakeIO(
      {
        home: dir,
        fs: { rename: async () => Promise.reject(new Error('disk full')) },
      },
      dir,
    );
    const err = await writeContexts(io, { current: 'x', contexts: {} }).catch(
      (e) => e as CliError,
    );
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).data).toBe('file_write');
    expect(await readFile(file, 'utf8')).toBe(
      'version: 1\ncurrent: null\ncontexts: {}\n',
    );
    await expect(stat(`${file}.tmp-4242`)).rejects.toThrow();
  });
});
