// Gắn TUI vào terminal giả kích thước cố định (120 × 40): đọc khung đã vẽ
// (bỏ màu), gõ phím, đợi chữ xuất hiện. IO của CLI là bản giả trong thư mục
// tạm (file context, cwd), như test của CLI.

import type { Lang } from '@ochotona/cli/api';
import { loadSpecText } from '@ochotona/cli/api';
import { render } from 'ink';
import { EventEmitter } from 'node:events';
import React from 'react';
import { App } from '../src/App';
import { Ocho } from '../src/ocho';
import { fakeIO, type FakeOptions } from '../../cli/test/io';

class Stdout extends EventEmitter {
  frame = '';
  constructor(
    readonly columns: number,
    readonly rows: number,
  ) {
    super();
  }
  readonly isTTY = true;
  /** Số lần Ink đã ghi, để biết khung còn đang đổi không. */
  writes = 0;
  write = (s: string) => {
    this.frame = s;
    this.writes++;
    return true;
  };
}

class Stdin extends EventEmitter {
  readonly isTTY = true;
  private data: string | null = null;
  write(s: string) {
    this.data = s;
    this.emit('readable');
    this.emit('data', s);
  }
  read = () => {
    const d = this.data;
    this.data = null;
    return d;
  };
  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
}

export const KEY = {
  up: '\u001b[A',
  down: '\u001b[B',
  right: '\u001b[C',
  left: '\u001b[D',
  enter: '\r',
  esc: '\u001b',
  tab: '\t',
  end: '\u001b[F',
  backspace: '\u007f',
} as const;

// eslint-disable-next-line no-control-regex
const strip = (s: string) => s.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');

/** Khung không đổi trong ngần này thì coi như màn hình đã sẵn sàng nhận phím. */
const STABLE_MS = 150;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Mounted {
  readonly ocho: Ocho;
  /** Khung hiện tại, không màu. */
  frame(): string;
  /** Gõ từng phím (chuỗi thường hay `KEY.*`), nghỉ ngắn giữa các phím. */
  press(...keys: string[]): Promise<void>;
  /** Đợi tới khi khung chứa `text` (hoặc khớp biểu thức). */
  waitFor(text: string | RegExp, timeoutMs?: number): Promise<string>;
  /**
   * Gõ `key` rồi đợi `expected`; chưa thấy thì gõ lại (tối đa 5 lần). Ink vẽ
   * khung trước khi `useInput` của màn hình mới kịp nghe stdin, nên phím gõ
   * ngay sau khi khung hiện có thể rơi khi máy bận. Mỗi bước kiểm đúng kết
   * quả mong đợi, nên phím thừa vẫn làm test hỏng.
   */
  pressUntil(key: string, expected: string | RegExp): Promise<string>;
  readonly exited: Promise<void>;
  unmount(): void;
}

export async function mount(
  initial: (ocho: Ocho) => { title: string; node: React.ReactNode }[],
  o: FakeOptions & { lang?: Lang; cols?: number; rows?: number } = {},
  dir?: string,
): Promise<Mounted> {
  const lang = o.lang ?? 'en';
  await loadSpecText(lang);
  const io = fakeIO(o, dir);
  const ocho = new Ocho(io, lang);
  const stdout = new Stdout(o.cols ?? 120, o.rows ?? 40);
  const stdin = new Stdin();
  const ink = render(<App ocho={ocho} initial={initial(ocho)} />, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: new Stdout(120, 40) as unknown as NodeJS.WriteStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  const frame = () => strip(stdout.frame);
  const ui: Mounted = {
    ocho,
    frame,
    async press(...keys) {
      for (const k of keys) {
        // Chuỗi thường gõ từng ký tự, như người gõ.
        const parts = Object.values(KEY).includes(k as never) ? [k] : [...k];
        for (const p of parts) {
          stdin.write(p);
          await sleep(25);
        }
      }
      await sleep(60);
    },
    async waitFor(text, timeoutMs = 15_000) {
      const end = Date.now() + timeoutMs;
      const ok = (f: string) =>
        typeof text === 'string' ? f.includes(text) : text.test(f);
      while (Date.now() < end) {
        if (ok(frame())) {
          // Khung khớp có thể vẽ trước effect của cùng lần commit (useInput
          // đăng ký nghe stdin, useHints). Đợi khung đứng yên rồi mới trả, để
          // phím gõ tiếp theo không rơi khi máy bận.
          let last = stdout.writes;
          let quietSince = Date.now();
          while (Date.now() - quietSince < STABLE_MS && Date.now() < end) {
            await sleep(20);
            if (stdout.writes !== last) {
              last = stdout.writes;
              quietSince = Date.now();
            }
          }
          if (ok(frame())) return frame();
        }
        await sleep(30);
      }
      throw new Error(
        `timed out waiting for ${String(text)}; frame:\n${frame()}`,
      );
    },
    async pressUntil(key, expected) {
      for (let attempt = 1; ; attempt++) {
        await ui.press(key);
        try {
          return await ui.waitFor(expected, 1500);
        } catch (e) {
          if (attempt >= 5) throw e;
        }
      }
    },
    exited: ink.waitUntilExit().then(() => {}),
    unmount: () => ink.unmount(),
  };
  return ui;
}
