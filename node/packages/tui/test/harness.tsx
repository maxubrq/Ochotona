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
  write = (s: string) => {
    this.frame = s;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Mounted {
  readonly ocho: Ocho;
  /** Khung hiện tại, không màu. */
  frame(): string;
  /** Gõ từng phím (chuỗi thường hay `KEY.*`), nghỉ ngắn giữa các phím. */
  press(...keys: string[]): Promise<void>;
  /** Đợi tới khi khung chứa `text` (hoặc khớp biểu thức). */
  waitFor(text: string | RegExp, timeoutMs?: number): Promise<string>;
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
  return {
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
        const f = frame();
        if (ok(f)) return f;
        await sleep(30);
      }
      throw new Error(
        `timed out waiting for ${String(text)}; frame:\n${frame()}`,
      );
    },
    exited: ink.waitUntilExit().then(() => {}),
    unmount: () => ink.unmount(),
  };
}
