// Ô nhập mật khẩu ẩn: tắt echo bằng chế độ raw của terminal. Ctrl-C trong lúc
// nhập ném `Interrupted` (exit 130). Giả định GC31: chạy đúng trên Windows
// Terminal và PowerShell.

import { Interrupted } from '../errors';
import type { IO } from '../io';

const CTRL_C = '\u0003';
const CTRL_D = '\u0004';
const BACKSPACE = ['\u007f', '\b'];

/** Hỏi một dòng không hiện ký tự; lời nhắc in ra stderr. */
export function readHidden(
  io: Pick<IO, 'stdin' | 'stderr' | 'signal'>,
  prompt: string,
): Promise<string> {
  const { stdin, stderr, signal } = io;
  // Tắt echo trước khi in lời nhắc: phím gõ ngay sau lời nhắc không được hiện.
  stdin.setRawMode?.(true);
  stderr.write(prompt);
  return new Promise<string>((resolve, reject) => {
    let value = '';
    const finish = (err: Error | null) => {
      stdin.off('data', onData);
      signal.removeEventListener('abort', onAbort);
      stdin.setRawMode?.(false);
      stdin.pause();
      stderr.write('\n');
      if (err) reject(err);
      else resolve(value);
    };
    const onAbort = () => finish(new Interrupted());
    const onData = (chunk: Buffer | string) => {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const ch of s) {
        if (ch === CTRL_C) return finish(new Interrupted());
        if (ch === '\r' || ch === '\n' || ch === CTRL_D) return finish(null);
        if (BACKSPACE.includes(ch)) value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
    signal.addEventListener('abort', onAbort, { once: true });
    stdin.resume();
  });
}
