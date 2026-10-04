import { AbortedError } from './transport';
import { RETRY_AFTER_CAP_MS } from './retry';

export const SLOW_MS = 2000;
export const FAST_MS = 500;
export const FAST_STREAK = 10;

export interface ThrottleDeps {
  readonly nowMs: () => number;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Tốc độ đổi. */
  readonly onRate?: (rps: number) => void;
  /** Dừng theo `Retry-After`. */
  readonly onPause?: (ms: number) => void;
}

/**
 * Token bucket thích nghi, một bộ cho mọi request tới cùng broker.
 *
 * Bucket chứa `max(1, floor(r))` token và nạp liên tục theo `r`. Bucket đơn
 * thuần cho phép tới `2r` request trong một cửa sổ 1 giây (xả đầy rồi nạp lại),
 * nên thêm một chốt cửa sổ trượt: không gửi khi 1 giây vừa qua đã có
 * `max(1, floor(r))` request.
 */
export class Throttle {
  #maxRps: number;
  #concurrency: number;
  #rate: number;
  #tokens: number;
  #last: number;
  #inFlight = 0;
  #fastStreak = 0;
  #pausedUntil = 0;
  #waiters: (() => void)[] = [];
  /** Thời điểm gửi của mọi request, theo thứ tự. */
  readonly sent: number[] = [];
  #windowStart = 0;

  constructor(
    maxRps: number,
    concurrency: number,
    private readonly deps: ThrottleDeps,
  ) {
    this.#maxRps = maxRps;
    this.#concurrency = concurrency;
    this.#rate = maxRps;
    this.#tokens = this.#capacity();
    this.#last = deps.nowMs();
  }

  get rps(): number {
    return this.#rate;
  }

  /** Đổi giới hạn giữa các lần `identify`, `read`; tốc độ hiện tại không vượt trần mới. */
  setLimits(maxRps: number, concurrency: number): void {
    this.#maxRps = maxRps;
    this.#concurrency = concurrency;
    if (this.#rate > maxRps) this.#rate = maxRps;
    this.#tokens = Math.min(this.#tokens, this.#capacity());
  }

  #capacity(): number {
    return Math.max(1, Math.floor(this.#rate));
  }

  #refill(now: number): void {
    const dt = Math.max(0, now - this.#last);
    this.#tokens = Math.min(
      this.#capacity(),
      this.#tokens + (dt / 1000) * this.#rate,
    );
    this.#last = now;
  }

  /** Số request gửi trong `(now − 1000, now]`; trả kèm thời điểm sớm nhất trong cửa sổ. */
  #window(now: number): { count: number; oldest: number } {
    while (
      this.#windowStart < this.sent.length &&
      this.sent[this.#windowStart] <= now - 1000
    ) {
      this.#windowStart++;
    }
    return {
      count: this.sent.length - this.#windowStart,
      oldest: this.sent[this.#windowStart] ?? now,
    };
  }

  /** Chờ tới khi được gửi; ném `AbortedError` khi huỷ. */
  async acquire(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw new AbortedError();
      if (this.#inFlight >= this.#concurrency) {
        await this.#waitSlot(signal);
        continue;
      }
      const now = this.deps.nowMs();
      this.#refill(now);
      let wait = 0;
      if (this.#pausedUntil > now) wait = this.#pausedUntil - now;
      else if (this.#tokens < 1) {
        wait = Math.ceil(((1 - this.#tokens) / this.#rate) * 1000);
      } else {
        const w = this.#window(now);
        if (w.count >= this.#capacity()) wait = w.oldest + 1000 - now + 1;
      }
      if (wait > 0) {
        await this.deps.sleep(wait, signal);
        continue;
      }
      this.#tokens -= 1;
      this.#inFlight++;
      this.sent.push(now);
      return;
    }
  }

  #waitSlot(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.#waiters = this.#waiters.filter((w) => w !== done);
        reject(new AbortedError());
      };
      const done = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
      this.#waiters.push(done);
    });
  }

  /**
   * Trả lượt và thích nghi theo thời gian phản hồi `latencyMs` (gửi tới nhận
   * xong body). `retryAfterMs` chỉ có khi status 429 hoặc 503 kèm `Retry-After`.
   */
  release(latencyMs: number, retryAfterMs?: number): void {
    this.#inFlight = Math.max(0, this.#inFlight - 1);
    const before = this.#rate;
    if (retryAfterMs !== undefined) {
      const ms = Math.min(RETRY_AFTER_CAP_MS, retryAfterMs);
      this.#pausedUntil = Math.max(this.#pausedUntil, this.deps.nowMs() + ms);
      this.#rate = Math.max(1, this.#rate / 2);
      this.#fastStreak = 0;
      this.deps.onPause?.(ms);
    } else if (latencyMs > SLOW_MS) {
      this.#rate = Math.max(1, this.#rate / 2);
      this.#fastStreak = 0;
    } else if (latencyMs < FAST_MS) {
      this.#fastStreak++;
      if (this.#fastStreak >= FAST_STREAK) {
        this.#rate = Math.min(this.#maxRps, this.#rate + 1);
        this.#fastStreak = 0;
      }
    } else {
      this.#fastStreak = 0;
    }
    if (this.#rate !== before) {
      this.#tokens = Math.min(this.#tokens, this.#capacity());
      this.deps.onRate?.(this.#rate);
    }
    this.#waiters.shift()?.();
  }

  /** Trả lượt mà không tính vào thích nghi (request bị huỷ). */
  cancel(): void {
    this.#inFlight = Math.max(0, this.#inFlight - 1);
    this.#waiters.shift()?.();
  }
}
