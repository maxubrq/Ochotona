import { copyFile, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MockServer } from '../../broker/tools/mock-mgmt.ts';
import {
  PASSWORD,
  expectSingleJson,
  runCli,
  startReplay,
  targetFlags,
  tempDir,
} from './helpers';
import { expectValid } from './schemas';

const DEFINITIONS = new URL(
  '../../../../SUT/common/definitions.json',
  import.meta.url,
).pathname;
const env = { OCHO_PASSWORD: PASSWORD };

async function withDefinitions(): Promise<string> {
  const dir = await tempDir();
  await copyFile(DEFINITIONS, join(dir, 'definitions.json'));
  return dir;
}

/** stdin giả là terminal, trả lời theo kịch bản (mỗi phần tử một dòng). */
function answers(lines: string[], end = true): PassThrough {
  const s = new PassThrough();
  s.write(lines.map((l) => `${l}\n`).join(''));
  if (end) s.end();
  return s;
}

describe('import --from definitions.json', () => {
  it('non-interactive: writes ocho.yaml 0644, every flow undeclared, then up to date', async () => {
    const dir = await withDefinitions();
    const r = await runCli(
      ['import', '--from', 'definitions.json', '--non-interactive'],
      { cwd: dir },
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(
      /^Wrote ocho\.yaml: \d+ flows \(0 strict, 0 loose, \d+ undeclared\), 0 families, .*Next: ocho doctor\n$/,
    );
    const text = await readFile(join(dir, 'ocho.yaml'), 'utf8');
    expect(text).toContain('spec: "0.4"');
    expect((await stat(join(dir, 'ocho.yaml'))).mode & 0o777).toBe(0o644);
    expect((await readdir(dir)).filter((f) => f.includes('.tmp-'))).toEqual([]);
    // doctor đọc lại file vừa ghi được.
    const lint = await runCli(['doctor', '--from', 'nope.json'], { cwd: dir });
    expect(lint.stderr).not.toMatch(/ocho\.yaml:\d+/);
  });

  it('stdin not a terminal switches to non-interactive with a note', async () => {
    const dir = await withDefinitions();
    const r = await runCli(['import', '--from', 'definitions.json'], {
      cwd: dir,
    });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain(
      'stdin is not a terminal: running non-interactively',
    );
  });

  it('--json: one document, stays non-interactive', async () => {
    const dir = await withDefinitions();
    const r = await runCli(['import', '--from', 'definitions.json', '--json'], {
      cwd: dir,
      tty: { stdin: true },
    });
    const doc = expectSingleJson(r.stdout);
    expect(doc).toMatchObject({
      schema: 'ocho.import/1',
      file: 'ocho.yaml',
      written: true,
    });
    expect(r.stderr).toContain('--json is set');
  });

  it('interactive: scripted answers set tolerances; ? explains; bad answers ask again', async () => {
    const dir = await withDefinitions();
    const stdin = answers(['?', 'x', 's', 'l', 'A', 's'], false);
    // Câu còn lại trả lời mặc định bằng dòng trống.
    stdin.end('\n'.repeat(200));
    const r = await runCli(['import', '--from', 'definitions.json'], {
      cwd: dir,
      stdin,
      tty: { stdin: true },
    });
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/Flow 1\/\d+: /);
    expect(r.stderr).toContain(
      'strict: a message lost in this flow is an S1 finding',
    );
    expect(r.stderr).toContain('Answer one of: s, l, k, A, ?');
    const text = await readFile(join(dir, 'ocho.yaml'), 'utf8');
    expect(text).toMatch(/tolerance: strict/);
    expect(text).toMatch(/tolerance: loose/);
  });

  it('EOF in the middle: exit 4, nothing written, hint --non-interactive', async () => {
    const dir = await withDefinitions();
    const r = await runCli(['import', '--from', 'definitions.json'], {
      cwd: dir,
      stdin: answers(['s']),
      tty: { stdin: true },
    });
    expect(r.code).toBe(4);
    expect(r.stderr).toContain('stdin closed in the middle of the questions');
    expect(r.stderr).toContain('--non-interactive');
    await expect(stat(join(dir, 'ocho.yaml'))).rejects.toThrow();
  });

  it('Ctrl-C at a question: exit 130, "Nothing was written."', async () => {
    const dir = await withDefinitions();
    const ac = new AbortController();
    const stdin = new PassThrough();
    const p = runCli(['import', '--from', 'definitions.json'], {
      cwd: dir,
      stdin,
      tty: { stdin: true },
      signal: ac.signal,
    });
    setTimeout(() => ac.abort(), 50);
    const r = await p;
    expect(r.code).toBe(130);
    expect(r.stderr).toContain('Nothing was written.');
    expect(r.stderr).toContain('ocho.yaml is unchanged');
    await expect(stat(join(dir, 'ocho.yaml'))).rejects.toThrow();
  });

  it('file changed while answering: exit 4, temp file removed, user edit kept', async () => {
    const dir = await withDefinitions();
    const path = join(dir, 'ocho.yaml');
    const stdin = new PassThrough();
    const p = runCli(['import', '--from', 'definitions.json'], {
      cwd: dir,
      stdin,
      tty: { stdin: true },
    });
    // Người dùng tạo file trong lúc đang trả lời câu đầu.
    setTimeout(async () => {
      await writeFile(path, '# written by hand\n');
      stdin.end('\n'.repeat(200));
    }, 50);
    const r = await p;
    expect(r.code).toBe(4);
    expect(r.stderr).toContain('ocho.yaml changed while import was running');
    expect(await readFile(path, 'utf8')).toBe('# written by hand\n');
    expect((await readdir(dir)).filter((f) => f.includes('.tmp-'))).toEqual([]);
  });

  it('crash between temp file and rename: the old file is intact', async () => {
    const dir = await withDefinitions();
    const path = join(dir, 'ocho.yaml');
    await runCli(
      ['import', '--from', 'definitions.json', '--non-interactive'],
      { cwd: dir },
    );
    const before = await readFile(path, 'utf8');
    await writeFile(path, before.replace('# Edit', '# Kept\n# Edit'));
    const kept = await readFile(path, 'utf8');
    const r = await runCli(
      ['import', '--from', 'definitions.json', '--non-interactive'],
      {
        cwd: dir,
        fs: {
          rename: async () => Promise.reject(new Error('simulated crash')),
        },
      },
    );
    expect(r.code).toBe(4);
    expect(r.stderr).toContain(
      'the broker was not touched; ocho.yaml is unchanged',
    );
    expect(await readFile(path, 'utf8')).toBe(kept);
    expect((await readdir(dir)).filter((f) => f.includes('.tmp-'))).toEqual([]);
  });

  it('existing file with errors: IM2, exit 4, diagnostics', async () => {
    const dir = await withDefinitions();
    await writeFile(join(dir, 'ocho.yaml'), 'spec: "0.4"\nflows: [\n');
    const r = await runCli(['import', '--from', 'definitions.json', '--json'], {
      cwd: dir,
    });
    expect(r.code).toBe(4);
    const doc = r.json();
    expectValid(doc);
    expect(doc.code).toBe('IM2');
    expect(doc.diagnostics[0].code).toMatch(/^YP/);
  });

  it('bad definitions file: exit 4', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'd.json'), '{"queues": 3}');
    expect(
      (await runCli(['import', '--from', 'd.json'], { cwd: dir })).code,
    ).toBe(4);
    expect(
      (await runCli(['import', '--from', 'missing.json'], { cwd: dir })).code,
    ).toBe(4);
  });
});

describe('import from a recorded broker', () => {
  let mock: MockServer;
  beforeAll(async () => {
    mock = await startReplay('rabbitmq-4.2/full');
  });
  afterAll(() => mock.close());

  it('reads the topology over GET only and writes ocho.yaml', async () => {
    const dir = await tempDir();
    const r = await runCli(
      [
        'import',
        '--non-interactive',
        '--out',
        'infra.yaml',
        ...targetFlags(mock),
      ],
      {
        env,
        cwd: dir,
      },
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Wrote infra.yaml:');
    expect(mock.requests.every((q) => q.method === 'GET')).toBe(true);
    const doctor = await runCli(
      ['doctor', '--json', '--file', 'infra.yaml', ...targetFlags(mock)],
      { env, cwd: dir },
    );
    expectValid(doctor.json());
  });

  it('a collection the user cannot read makes the topology unknown: exit 3', async () => {
    const dir = await tempDir();
    const saved = mock.routes['/api/policies'];
    mock.routes['/api/policies'] = { status: 403, json: {} };
    try {
      const r = await runCli(
        ['import', '--non-interactive', ...targetFlags(mock)],
        { env, cwd: dir },
      );
      expect(r.code).toBe(3);
      expect(r.stderr).toContain('policies');
    } finally {
      mock.routes['/api/policies'] = saved;
    }
  });
});
