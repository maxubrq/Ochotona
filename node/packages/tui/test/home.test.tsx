// Home và context: màn hình chào khi chưa có gì, thêm context qua form (nối
// thử, hỏi mật khẩu ở ô ẩn, không lưu mật khẩu), menu Enter, đặt mặc định, xoá.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PASSWORD, USER, startReplay, tempDir } from '../../cli/test/helpers';
import { Home } from '../src/views/Home';
import { KEY, type Mounted, mount } from './harness';

let ui: Mounted | null = null;
afterEach(() => {
  ui?.unmount();
  ui = null;
});

const home = () => [{ title: 'Home', node: <Home /> }];

describe('home', () => {
  it('no contexts yet: says what to do, every start item is listed', async () => {
    const dir = await tempDir();
    ui = await mount(home, { cwd: dir }, dir);
    const f = await ui.waitFor('No saved broker yet');
    for (const item of [
      'Add a context',
      'Connect with a URL',
      'Open a snapshot file',
      'Rules and codes',
    ])
      expect(f).toContain(item);
    // Mục đầu được chọn sẵn và có giải thích bên phải.
    expect(f).toContain('never stores the password itself');
    expect(f).toContain('? help');
  });

  it('adds a context: verifies with a password typed in the dialog, saves no password', async () => {
    const mock = await startReplay('rabbitmq-4.2/full');
    try {
      const dir = await tempDir();
      ui = await mount(home, { cwd: dir }, dir);
      await ui.waitFor('No saved broker yet');
      await ui.press('a');
      await ui.waitFor('Add a context');
      // Tên, URL; user giữ mặc định ocho-doctor; không có lệnh mật khẩu.
      await ui.press(
        'sut',
        KEY.enter,
        mock.url,
        KEY.enter,
        KEY.enter,
        KEY.enter,
      );
      await ui.press(
        KEY.enter,
        KEY.enter,
        KEY.enter,
        KEY.enter,
        KEY.enter,
        KEY.enter,
      );
      await ui.waitFor('Password needed');
      await ui.press(PASSWORD, KEY.enter);
      const f = await ui.waitFor('● sut');
      expect(f).toContain(mock.url);
      expect(f).toContain('password_command  not set');
      const file = await readFile(
        join(dir, 'cfg', 'ochotona', 'contexts.yaml'),
        'utf8',
      );
      expect(file).toContain('current: sut');
      expect(file).toContain(`user: ${USER}`);
      expect(file).not.toContain(PASSWORD);
    } finally {
      await mock.close();
    }
  });

  it('rejects a bad context name in the form, before touching anything', async () => {
    const dir = await tempDir();
    ui = await mount(home, { cwd: dir }, dir);
    await ui.waitFor('No saved broker yet');
    await ui.press('a');
    await ui.waitFor('Add a context');
    await ui.press('Bad Name', KEY.enter, 'http://h', KEY.enter);
    await ui.press(
      KEY.enter,
      KEY.enter,
      KEY.enter,
      KEY.enter,
      KEY.enter,
      KEY.enter,
      KEY.enter,
      KEY.enter,
    );
    await ui.waitFor('Use lowercase letters');
  });

  it('Enter opens the action menu; remove asks first', async () => {
    const dir = await tempDir();
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, 'cfg', 'ochotona'), { recursive: true });
    await writeFile(
      join(dir, 'cfg', 'ochotona', 'contexts.yaml'),
      'version: 1\ncurrent: a\ncontexts:\n  a:\n    url: http://a:15672\n    user: u\n  b:\n    url: http://b:15672\n    user: u\n',
      { mode: 0o600 },
    );
    ui = await mount(home, { cwd: dir }, dir);
    await ui.waitFor('● a');
    await ui.press(KEY.down);
    await ui.waitFor('Make this the default context');
    await ui.press('u');
    await ui.waitFor('Switched to context b.');
    await ui.waitFor('● b');
    await ui.press(KEY.enter);
    const menu = await ui.waitFor('b: what do you want to do?');
    expect(menu).toContain('Run doctor');
    expect(menu).toContain('Remove this context');
    await ui.press(KEY.esc);
    await ui.waitFor('Brokers');
    await ui.press('r');
    await ui.waitFor('Remove context b?');
    await ui.press('y');
    await ui.waitFor('Removed context b.');
    const file = await readFile(
      join(dir, 'cfg', 'ochotona', 'contexts.yaml'),
      'utf8',
    );
    expect(file).not.toContain('b:');
  });
});
