import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMAND_FLAGS } from '../src/args';
import { TOOL_VERSION } from '../src/version';
import { runCli } from './helpers';
import { expectValid } from './schemas';

describe('help', () => {
  it('ocho with no command prints the overview', async () => {
    const r = await runCli([]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(
      'Usage:  ocho [global flags] <command> [arguments]',
    );
    for (const c of ['doctor', 'import', 'explain', 'context', 'version'])
      expect(r.stdout).toContain(`  ${c} `);
  });

  for (const cmd of Object.keys(COMMAND_FLAGS))
    it(`help ${cmd} and ${cmd} --help: purpose, usage, flags, three examples`, async () => {
      const a = await runCli(['help', cmd]);
      const b = await runCli([cmd, '--help']);
      expect(a.stdout).toBe(b.stdout);
      expect(a.stdout).toMatch(/^Usage:  ocho /m);
      expect(a.stdout.match(/^ {2}(ocho|npx) /gm)).toHaveLength(3);
      for (const f of Object.keys(COMMAND_FLAGS[cmd]))
        expect(a.stdout).toContain(`--${f}`);
      const readOnly = a.stdout
        .trimEnd()
        .endsWith('Read-only: this command never writes to the broker.');
      expect(readOnly).toBe(
        ['doctor', 'import', 'explain', 'context'].includes(cmd),
      );
    });

  it('help of an unknown command is a usage error', async () => {
    const r = await runCli(['help', 'doctr']);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain('did you mean doctor?');
  });

  it('Vietnamese help', async () => {
    const r = await runCli(['help', 'doctor', '--lang', 'vi']);
    expect(r.stdout).toContain(
      'Chỉ đọc: lệnh này không bao giờ ghi lên broker.',
    );
  });
});

describe('version', () => {
  it('text and ocho.version/1', async () => {
    expect((await runCli(['version'])).stdout).toBe(
      `ocho ${TOOL_VERSION} (spec 0.4.0, Node v22.0.0, linux-x64)\n`,
    );
    expect((await runCli(['--version'])).stdout).toBe(
      `ocho ${TOOL_VERSION} (spec 0.4.0, Node v22.0.0, linux-x64)\n`,
    );
    const j = await runCli(['version', '--json']);
    expectValid(j.json());
  });

  it('--lang must be en or vi', async () => {
    const r = await runCli(['version', '--lang', 'fr', '--json']);
    expect(r.code).toBe(4);
    expectValid(r.json());
  });
});

describe('usage errors point to help (D5)', () => {
  it('text and JSON carry the same Next line, for the command being run', async () => {
    const text = await runCli(['doctor', '--bogus']);
    expect(text.stderr).toMatch(
      /^ {2}Next\s+Run ocho help doctor for its flags and examples\.$/m,
    );
    const json = await runCli(['doctor', '--bogus', '--json']);
    expectValid(json.json());
    expect(json.json().next).toBe(
      'Run ocho help doctor for its flags and examples.',
    );
    const global = await runCli(['--bogus', '--json']);
    expect(global.json().next).toBe(
      'Run ocho help for the list of commands and global flags.',
    );
  });

  it('--lang applies to errors from parsing itself', async () => {
    const r = await runCli(['doctor', '--bogus', '--lang', 'vi']);
    expect(r.stderr.split('\n')[0]).toBe('error: cờ lạ --bogus');
    const eq = await runCli(['doctor', '--bogus', '--lang=vi', '--json']);
    expect(eq.json().next).toBe('Chạy ocho help doctor để xem cờ và ví dụ.');
  });
});

describe('TOOL_VERSION', () => {
  // release-please đổi cả hai cùng lúc; lệch nhau là cấu hình phát hành sai.
  it('matches package.json', async () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    expect(TOOL_VERSION).toBe(pkg.version);
  });
});
