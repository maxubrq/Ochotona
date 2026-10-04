import type { EndpointId } from '@ochotona/model';
import type { ReadEvent } from './events';
import {
  backoffMs,
  bodyTooLarge,
  classifyError,
  classifyStatus,
  type Failure,
  parseError,
  shouldRetry,
} from './retry';
import type { Throttle } from './throttle';
import { AbortedError, type Transport } from './transport';

export interface Counters {
  requests: number;
  retries: number;
  bytes: number;
}

/** Mọi thứ một lần gọi cần; dựng một lần cho mỗi `identify` hoặc `read`. */
export interface FetchCtx {
  readonly transport: Transport;
  readonly throttle: Throttle;
  readonly nowMs: () => number;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly random: () => number;
  readonly signal?: AbortSignal;
  readonly redact: (s: string) => string;
  readonly emit: (e: ReadEvent) => void;
  readonly debug: (line: string) => void;
  readonly counters: Counters;
}

export interface FetchOptions {
  readonly endpoint: EndpointId;
  readonly kind: 'json' | 'prometheus';
  readonly maxBytes: number;
  readonly deadlineMs?: number;
  /** `false`: một lượt duy nhất (phép thử Prometheus). */
  readonly retry?: boolean;
}

export type FetchResult<T> =
  | { readonly ok: true; readonly status: number; readonly body: T }
  | { readonly ok: false; readonly failure: Failure };

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AbortedError();
}

/** Đường dẫn và query, không origin, để in ra nhật ký. */
function pathOf(url: string): string {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}

/**
 * Một GET qua bộ giới hạn, kèm phân loại lỗi và thử lại. Không ném lỗi vì
 * broker hay mạng; chỉ ném `AbortedError` khi bị huỷ.
 */
export async function fetchWithRetry(
  ctx: FetchCtx,
  url: string,
  opts: FetchOptions & { kind: 'json' },
): Promise<FetchResult<unknown>>;
export async function fetchWithRetry(
  ctx: FetchCtx,
  url: string,
  opts: FetchOptions & { kind: 'prometheus' },
): Promise<FetchResult<string>>;
export async function fetchWithRetry(
  ctx: FetchCtx,
  url: string,
  opts: FetchOptions,
): Promise<FetchResult<unknown>> {
  for (let attempt = 1; ; attempt++) {
    checkAborted(ctx.signal);
    await ctx.throttle.acquire(ctx.signal);
    let outcome;
    try {
      outcome = await ctx.transport.get({
        url,
        kind: opts.kind,
        maxBytes: opts.maxBytes,
        deadlineMs: opts.deadlineMs,
        signal: ctx.signal,
      });
    } catch (e) {
      ctx.throttle.cancel();
      throw e;
    }
    ctx.counters.requests++;
    let failure: Failure | null = null;
    let result: FetchResult<unknown> | null = null;
    if (outcome.kind === 'response') {
      ctx.counters.bytes += outcome.bytes;
      const s = outcome.status;
      const throttled = s === 429 || s === 503;
      const f =
        s >= 200 && s < 300
          ? null
          : classifyStatus(s, outcome.headers, ctx.nowMs());
      ctx.throttle.release(
        outcome.latencyMs,
        throttled ? f?.retryAfterMs : undefined,
      );
      ctx.debug(
        `GET ${pathOf(url)} ${s} ${Math.round(outcome.latencyMs)}ms ${Math.ceil(outcome.bytes / 1024)}KB attempt=${attempt} rps=${ctx.throttle.rps}`,
      );
      if (f) failure = f;
      else if (outcome.body === null) failure = bodyTooLarge(s);
      else if (opts.kind === 'prometheus') {
        result = { ok: true, status: s, body: outcome.body.toString('utf8') };
      } else {
        try {
          result = {
            ok: true,
            status: s,
            body: JSON.parse(outcome.body.toString('utf8')),
          };
        } catch {
          failure = parseError(s);
        }
      }
    } else {
      ctx.throttle.release(outcome.latencyMs);
      failure = classifyError(outcome.error, ctx.redact);
      ctx.debug(
        `GET ${pathOf(url)} ${failure.reason} ${Math.round(outcome.latencyMs)}ms attempt=${attempt} rps=${ctx.throttle.rps}`,
      );
    }
    if (result) return result;
    const f = failure!;
    if (opts.retry === false || !shouldRetry(f, attempt)) {
      return { ok: false, failure: f };
    }
    ctx.counters.retries++;
    ctx.emit({
      type: 'retry',
      endpoint: opts.endpoint,
      attempt: attempt + 1,
      reason: f.reason,
    });
    await ctx.sleep(backoffMs(attempt, ctx.random, f.retryAfterMs), ctx.signal);
  }
}
