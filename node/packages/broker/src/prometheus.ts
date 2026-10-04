import type { Instant, RawResult } from '@ochotona/model';
import { fetchWithRetry, type FetchCtx } from './fetch';

/** Trần body của văn bản exposition. */
export const MAX_PROMETHEUS_BYTES = 32 * 1024 * 1024;
/** Trần của phép thử Prometheus. */
export const PROMETHEUS_DEADLINE_MS = 2000;

/** Body hợp lệ khi bắt đầu bằng `# HELP` hoặc `# TYPE`. */
export function looksLikeExposition(text: string): boolean {
  return text.startsWith('# HELP') || text.startsWith('# TYPE');
}

/**
 * Lấy toàn bộ văn bản exposition một lần, trả nguyên văn; việc parse thuộc
 * model. Không gửi header xác thực. Một lượt duy nhất, trần 2 giây.
 */
export async function fetchPrometheus(
  ctx: FetchCtx & { readonly clock: () => Instant },
  url: string,
): Promise<RawResult<string>> {
  const r = await fetchWithRetry(ctx, url, {
    endpoint: 'prometheus',
    kind: 'prometheus',
    maxBytes: MAX_PROMETHEUS_BYTES,
    deadlineMs: PROMETHEUS_DEADLINE_MS,
    retry: false,
  });
  if (!r.ok) return r.failure.raw;
  if (r.status !== 200 || !looksLikeExposition(r.body)) {
    return { status: 'http_error', code: r.status, note: 'parse_error' };
  }
  return { status: 'ok', pages: [{ body: r.body, observedAt: ctx.clock() }] };
}
