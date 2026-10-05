// Điểm vào `runTui`: cờ kiểm bằng bộ phân tích của CLI, --help, --version,
// cờ dành cho script, cần terminal.

import { describe, expect, it } from 'vitest';
import { fakeIO } from '../../cli/test/io';
import { runTui } from '../src/main';
import { TUI_VERSION } from '../src/version';

async function run(argv: string[], tty = false) {
  const io = fakeIO({ tty: { stdin: tty, stdout: tty, stderr: tty } });
  const code = await runTui(argv, io);
  return { code, out: io.out.join(''), err: io.err.join('') };
}

describe('runTui', () => {
  it('--version and --help need no terminal', async () => {
    expect(await run(['--version'])).toMatchObject({
      code: 0,
      out: `ocho-tui ${TUI_VERSION}\n`,
    });
    const h = await run(['--help']);
    expect(h.code).toBe(0);
    expect(h.out).toContain('Usage  ocho-tui [flags]');
    expect(h.out).toContain('Read-only');
    const vi = await run(['--help', '--lang', 'vi']);
    expect(vi.out).toContain('Cách dùng  ocho-tui [cờ]');
  });

  it('unknown flags fail like ocho, with the nearest flag', async () => {
    const r = await run(['--vhosts', 'a']);
    expect(r.code).toBe(4);
    expect(r.err).toContain('unknown flag --vhosts; did you mean --vhost?');
  });

  it('script-only flags and a missing terminal point to ocho', async () => {
    const j = await run(['--json'], true);
    expect(j).toMatchObject({
      code: 4,
      err: 'ocho-tui: --json is for scripts; use ocho for it\n',
    });
    const t = await run([]);
    expect(t.code).toBe(4);
    expect(t.err).toContain('needs an interactive terminal');
  });
});
