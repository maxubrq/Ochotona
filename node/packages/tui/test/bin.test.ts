// Tệp thực thi đã dựng: `dist/bin/ocho-tui.js` (mặc định) hoặc binary SEA qua
// OCHO_TUI_BIN. Không có terminal nên chỉ kiểm các đường không vẽ giao diện.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = process.env.OCHO_TUI_BIN ?? 'dist/bin/ocho-tui.js';
const path = new URL(bin, `file://${root}/`).pathname;
const version = JSON.parse(
  readFileSync(`${root}/package.json`, 'utf8'),
).version;

const run = (args: string[]) => {
  const isJs = path.endsWith('.js');
  return spawnSync(
    isJs ? process.execPath : path,
    isJs ? [path, ...args] : args,
    {
      encoding: 'utf8',
      // Không rò OCHO_*, LANG của máy chạy test.
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([k]) => !/^(OCHO_|LANG|LC_)/.test(k),
          ),
        ),
        OCHO_LANG: 'en',
        NO_COLOR: '1',
      },
    },
  );
};

describe.skipIf(!existsSync(path))(`built binary ${bin}`, () => {
  it('--version matches package.json', () => {
    const r = run(['--version']);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`ocho-tui ${version}\n`);
  });

  it('--help prints the usage', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage  ocho-tui [flags]');
  });

  it('without a terminal: exit 4 and a pointer to ocho', () => {
    const r = run([]);
    expect(r.status).toBe(4);
    expect(r.stderr).toContain('ocho-tui needs an interactive terminal');
  });
});
