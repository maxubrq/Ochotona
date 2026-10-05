// Tiến trình đọc: một dòng tự cập nhật trên stderr, chỉ khi stderr là TTY và
// không có `--json`, xoá trước khi báo cáo được in:
//
//   Reading queues 12/20 pages · 5 req/s · ~14s left
//
// `throttle`, `retry` đổi phần cuối dòng. Không phải TTY thì không in gì;
// `--debug` thay bằng nhật ký từng request (do broker gửi qua `onDebug`).

import type { ReadEvent } from '@ochotona/broker';
import type { Session } from '../session';

export interface Progress {
  onEvent(e: ReadEvent): void;
  /** Xoá dòng tiến trình (nếu đang hiện). */
  clear(): void;
}

const CLEAR = '\r\u001b[2K';

export function createProgress(
  s: Session,
  opts: { readonly maxRps: number },
): Progress {
  const enabled = s.io.isTTY.stderr && !s.json;
  let shown = false;
  let rps = opts.maxRps;
  let tail: string | null = null;
  let deadlineMs: number | null = null;
  let endpoint: string | null = null;
  let page = 0;
  let pageCount = 0;

  const draw = () => {
    if (!enabled || endpoint === null) return;
    const parts = [
      s.t('progress.reading', {
        endpoint,
        page,
        count: pageCount,
      }),
      tail ?? s.t('progress.rate', { rps }),
    ];
    if (deadlineMs !== null) {
      const left = Math.max(0, Math.round((deadlineMs - s.io.clock()) / 1000));
      parts.push(s.t('progress.left', { seconds: left }));
    }
    s.io.stderr.write(`${CLEAR}${parts.join(' · ')}`);
    shown = true;
  };

  return {
    onEvent(e) {
      switch (e.type) {
        case 'estimate':
          deadlineMs = s.io.clock() + e.seconds * 1000;
          break;
        case 'page':
          endpoint = e.endpoint;
          page = e.page;
          pageCount = e.pageCount;
          break;
        case 'throttle':
          rps = e.rps;
          tail = s.t('progress.slowed', { rps: e.rps });
          s.debug(`throttle: ${e.rps} req/s`);
          break;
        case 'retry':
          tail = s.t('progress.retry', {
            endpoint: e.endpoint,
            attempt: e.attempt,
          });
          s.debug(`retry ${e.endpoint} #${e.attempt}: ${e.reason}`);
          break;
        case 'warning':
          s.debug(`warning ${e.code}: ${e.detail}`);
          break;
        case 'phase':
          s.debug(`phase: ${e.phase}`);
          break;
        default:
          break;
      }
      draw();
    },
    clear() {
      if (shown) s.io.stderr.write(CLEAR);
      shown = false;
    },
  };
}
