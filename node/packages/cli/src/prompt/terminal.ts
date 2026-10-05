// Đọc stdin theo dòng, cho `--password-stdin` và phiên hỏi đáp của `import`.
// EOF trả `null`; Ctrl-C (signal huỷ) ném `Interrupted`.

import { Interrupted } from '../errors';
import type { In } from '../io';

export class LineReader {
  private buf = '';
  private ended = false;
  private waiter: (() => void) | null = null;
  private readonly onData = (chunk: Buffer | string) => {
    this.buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    this.wake();
  };
  private readonly onEnd = () => {
    this.ended = true;
    this.wake();
  };

  constructor(
    private readonly stdin: In,
    private readonly signal: AbortSignal,
  ) {
    stdin.on('data', this.onData);
    stdin.on('end', this.onEnd);
    stdin.on('close', this.onEnd);
    stdin.resume();
  }

  private wake() {
    const w = this.waiter;
    this.waiter = null;
    w?.();
  }

  /** Dòng kế tiếp, không có ký tự xuống dòng; `null` khi stdin đã đóng. */
  async next(): Promise<string | null> {
    for (;;) {
      if (this.signal.aborted) throw new Interrupted();
      const i = this.buf.indexOf('\n');
      if (i >= 0) {
        const line = this.buf.slice(0, i).replace(/\r$/, '');
        this.buf = this.buf.slice(i + 1);
        return line;
      }
      if (this.ended) {
        if (this.buf === '') return null;
        const line = this.buf.replace(/\r$/, '');
        this.buf = '';
        return line;
      }
      await new Promise<void>((resolve) => {
        const onAbort = () => resolve();
        this.waiter = () => {
          this.signal.removeEventListener('abort', onAbort);
          resolve();
        };
        this.signal.addEventListener('abort', onAbort, { once: true });
      });
    }
  }

  close(): void {
    this.stdin.off('data', this.onData);
    this.stdin.off('end', this.onEnd);
    this.stdin.off('close', this.onEnd);
    this.stdin.pause();
  }
}
