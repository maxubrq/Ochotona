// Import từ definitions.json: menu chọn thay cho gõ chữ, mặc định cho phần
// còn lại, xem trước rồi mới ghi; dừng giữa chừng thì không ghi gì.

import { copyFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir } from '../../cli/test/helpers';
import { Import } from '../src/views/Import';
import { KEY, type Mounted, mount } from './harness';

const DEFINITIONS = fileURLToPath(
  new URL('../../../../SUT/common/definitions.json', import.meta.url),
);

let ui: Mounted | null = null;
afterEach(() => {
  ui?.unmount();
  ui = null;
});

async function start(): Promise<string> {
  const dir = await tempDir();
  await copyFile(DEFINITIONS, join(dir, 'definitions.json'));
  ui = await mount(
    () => [
      { title: 'Home', node: null },
      { title: 'Import', node: <Import target={{ kind: 'cli', args: [] }} /> },
    ],
    { cwd: dir },
    dir,
  );
  await ui.waitFor('Write to');
  // Ghi vào ocho.yaml; đọc từ file definitions; tên file; Bắt đầu.
  await ui.press(
    KEY.enter,
    KEY.right,
    KEY.enter,
    'definitions.json',
    KEY.enter,
    KEY.enter,
  );
  return dir;
}

describe('import wizard', () => {
  it('answers with the menu, takes defaults for the rest, previews, then writes', async () => {
    const dir = await start();
    const q = await ui!.waitFor('Flow 1/');
    expect(q).toContain('Keep undeclared  (default)');
    expect(q).toContain('Not decided yet');
    await ui!.press(KEY.down);
    await ui!.waitFor('Any way to lose one becomes an S1 finding');
    await ui!.press(KEY.enter);
    await ui!.waitFor('Flow 2/');
    await ui!.press('D');
    await ui!.waitFor('Use the default answer for every remaining question?');
    await ui!.press('y');
    const review = await ui!.waitFor('Ready to write ocho.yaml');
    expect(review).toMatch(/1 strict, 0 loose, \d+ undeclared/);
    expect(await readdir(dir)).not.toContain('ocho.yaml');
    await ui!.press(KEY.enter);
    await ui!.waitFor('Wrote ocho.yaml');
    const yaml = await readFile(join(dir, 'ocho.yaml'), 'utf8');
    expect(yaml.match(/tolerance: strict/g)).toHaveLength(1);
  });

  it('"same answer for the rest of this exchange" answers several flows at once', async () => {
    await start();
    await ui!.waitFor('Flow 1/');
    await ui!.press(KEY.down, KEY.down, KEY.down, KEY.enter);
    await ui!.waitFor('Tolerance for the rest of this exchange');
    await ui!.press(KEY.down, KEY.down, KEY.enter);
    const f = await ui!.waitFor(/Flow \d+\//);
    expect(f).not.toContain('Flow 2/');
  });

  it('Esc asks before stopping; stopping writes nothing', async () => {
    const dir = await start();
    await ui!.waitFor('Flow 1/');
    await ui!.press(KEY.esc);
    await ui!.waitFor('Stop the import? Nothing will be written.');
    await ui!.press('y');
    await ui!.waitFor(/^(?![\s\S]*Flow 1\/)/);
    expect(await readdir(dir)).not.toContain('ocho.yaml');
  });
});
