// Tra cứu luật và mã: lọc, xem ngay bên phải, Enter mở toàn màn hình.

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir } from '../../cli/test/helpers';
import { Explain } from '../src/views/Explain';
import { KEY, type Mounted, mount } from './harness';

let ui: Mounted | null = null;
afterEach(() => {
  ui?.unmount();
  ui = null;
});

describe('rules and codes', () => {
  it('lists rules, blind spots and codes; the right pane is ocho explain', async () => {
    const dir = await tempDir();
    ui = await mount(
      () => [{ title: 'Rules', node: <Explain target={null} /> }],
      { cwd: dir },
      dir,
    );
    const f = await ui.waitFor('Fails when');
    expect(f).toMatch(/Rules \(\d+\)/);
    expect(f).toContain('ocho explain C1');
  });

  it('filters and opens a code full screen', async () => {
    const dir = await tempDir();
    ui = await mount(
      () => [{ title: 'Rules', node: <Explain target={null} /> }],
      { cwd: dir },
      dir,
    );
    await ui.waitFor('Rules (');
    await ui.press('/', 'CX3', KEY.enter);
    const f = await ui.waitFor('Diagnostic codes (1)');
    expect(f).not.toContain('Rules (');
    await ui.press(KEY.enter);
    await ui.waitFor('$ ocho explain CX3');
    expect(ui.frame()).toContain('401');
  });
});
