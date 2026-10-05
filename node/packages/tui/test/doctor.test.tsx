// Màn hình Doctor đầu-cuối: ảnh chụp tất định của bản ghi SUT 4.2, và mock
// broker phát lại bản ghi đó (hỏi mật khẩu, chỉ GET).

import { diagnose } from '@ochotona/cli/api';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  USER,
  snapshotOf,
  startReplay,
  tempDir,
} from '../../cli/test/helpers';
import { Doctor } from '../src/views/Doctor';
import { KEY, type Mounted, mount } from './harness';

let ui: Mounted | null = null;
afterEach(() => {
  ui?.unmount();
  ui = null;
});

async function snapshotDir(): Promise<string> {
  const dir = await tempDir();
  await writeFile(join(dir, 'snap.json'), snapshotOf('rabbitmq-4.2/full'));
  return dir;
}

const doctorOn =
  (file: string, flags: string[] = []) =>
  () => [
    { title: 'Home', node: null },
    {
      title: 'Doctor',
      node: <Doctor target={{ kind: 'snapshot', file }} flags={flags} />,
    },
  ];

describe('doctor on a snapshot', () => {
  it('shows the head lines, the equivalent command, sections and details', async () => {
    const dir = await snapshotDir();
    ui = await mount(doctorOn('snap.json'), { cwd: dir }, dir);
    await ui.waitFor('Findings');
    // Khung chi tiết vẽ sau danh sách một nhịp.
    const f = await ui.waitFor('What happened');
    expect(f).toContain('$ ocho doctor --from snap.json');
    expect(f).toContain('From snapshot taken');
    expect(f).toMatch(/\d+ rules · \d+ fail · \d+ pass · .* · exit 1/);
    expect(f).toContain('Do these first (3)');
    expect(f).toContain('S1  DATA SAFETY');
    // Mục đầu là việc 1; chi tiết có đủ các nhãn của báo cáo văn bản.
    expect(f).toContain('What happened');
    expect(f).toContain('Is data safe');
    expect(f).toContain('ocho explain');
  });

  it('moves through findings, opens the rule explanation, and comes back', async () => {
    const dir = await snapshotDir();
    ui = await mount(doctorOn('snap.json'), { cwd: dir }, dir);
    await ui.waitFor('Findings');
    await ui.press(KEY.down, KEY.down, KEY.down, KEY.down);
    const f = await ui.waitFor('5/');
    const rule = /│ › ([A-Z]+\d+) /.exec(f)?.[1];
    expect(rule).toMatch(/^[A-Z]+\d+$/);
    await ui.press(KEY.enter);
    await ui.waitFor('Fails when');
    expect(ui.frame()).toContain(`$ ocho explain ${rule}`);
    await ui.press(KEY.esc);
    await ui.waitFor('Findings');
    expect(ui.frame()).toContain('5/');
  });

  it('filters by rule code or object name', async () => {
    const dir = await snapshotDir();
    ui = await mount(doctorOn('snap.json'), { cwd: dir }, dir);
    await ui.waitFor('Findings');
    await ui.press('/', 'T5', KEY.enter);
    const f = await ui.waitFor('/ T5');
    expect(f).toContain('T5   queue orders.created');
    expect(f).not.toContain('T4   queue');
    await ui.press('/', KEY.esc);
    await ui.waitFor('T4   queue');
  });

  it('passes doctor flags through: --vhost limits what is shown', async () => {
    const dir = await snapshotDir();
    ui = await mount(
      doctorOn('snap.json', ['--vhost', 'payments']),
      { cwd: dir },
      dir,
    );
    const f = await ui.waitFor('Findings');
    expect(f).toContain('$ ocho doctor --from snap.json --vhost payments');
    expect(f).not.toContain('queue overlap');
  });

  it('saves a redacted snapshot that ocho can read back', async () => {
    const dir = await snapshotDir();
    ui = await mount(doctorOn('snap.json'), { cwd: dir }, dir);
    await ui.waitFor('Findings');
    await ui.press('s');
    await ui.waitFor('Save a snapshot');
    // File mặc định snap.json đang mở: thêm hậu tố cho file mới.
    await ui.press(
      KEY.end,
      KEY.backspace,
      KEY.backspace,
      KEY.backspace,
      KEY.backspace,
      KEY.backspace,
      'copy.json',
    );
    await ui.press(KEY.enter, KEY.enter, KEY.enter);
    await ui.waitFor('Saved snapcopy.json');
    const again = await ui.ocho.run(
      ['doctor', '--from', 'snapcopy.json'],
      { width: 100 },
      (s) => diagnose(s),
    );
    expect(again.value.results.length).toBeGreaterThan(0);
    expect(again.value.exitCode).toBe(1);
  });

  it('switches to Vietnamese with L', async () => {
    const dir = await snapshotDir();
    ui = await mount(doctorOn('snap.json'), { cwd: dir }, dir);
    await ui.waitFor('Findings');
    await ui.press('L');
    const f = await ui.waitFor('Kết quả');
    expect(f).toContain('Làm trước (3)');
    expect(f).toContain('Chuyện gì');
  });
});

describe('doctor on a broker', () => {
  it('asks for the password in a dialog, then reads with GET only', async () => {
    const mock = await startReplay('rabbitmq-4.2/full');
    try {
      const dir = await tempDir();
      ui = await mount(
        () => [
          { title: 'Home', node: null },
          {
            title: 'Doctor',
            node: (
              <Doctor
                target={{
                  kind: 'cli',
                  args: [
                    '--url',
                    mock.url,
                    '--user',
                    USER,
                    '--no-prometheus',
                    '--max-rps',
                    '20',
                  ],
                }}
              />
            ),
          },
        ],
        { cwd: dir },
        dir,
      );
      await ui.waitFor('Password needed');
      expect(ui.frame()).toContain('Password for ocho-doctor@127.0…:');
      await ui.press(PASSWORD, KEY.enter);
      const f = await ui.waitFor('Findings', 30_000);
      expect(f).toContain('Connected to 127.0.0.1');
      expect(f).not.toContain(PASSWORD);
      expect(mock.requests.every((q) => q.method === 'GET')).toBe(true);
    } finally {
      await mock.close();
    }
  });

  it('cannot reach the broker: the CLI error, with Data and Next', async () => {
    const dir = await tempDir();
    ui = await mount(
      () => [
        { title: 'Home', node: null },
        {
          title: 'Doctor',
          node: (
            <Doctor
              target={{
                kind: 'cli',
                args: ['--url', 'http://127.0.0.1:9', '--user', USER],
              }}
            />
          ),
        },
      ],
      { cwd: dir, env: { OCHO_PASSWORD: 'x' } },
      dir,
    );
    const f = await ui.waitFor('error CX1');
    expect(f).toContain('Data');
    expect(f).toContain('Next');
    expect(f).toContain('try again');
  });
});
