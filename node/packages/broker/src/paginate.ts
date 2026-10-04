import type { EndpointRead, Instant } from '@ochotona/model';
import { fetchWithRetry, type FetchCtx } from './fetch';
import type { RawFailure } from './retry';
import { apiUrl } from './target';
import { MAX_BODY_BYTES } from './transport';

export const PAGE_SIZE = 500;
/** Trần trang khi không biết tổng số đối tượng lúc nhận diện. */
export const PAGE_CAP_UNKNOWN_TOTAL = 1000;

export type Page = { readonly body: unknown; readonly observedAt: Instant };

export type EndpointOutcome =
  | { readonly ok: true; readonly pages: readonly Page[] }
  | { readonly ok: false; readonly raw: RawFailure };

/**
 * Trần an toàn: `ceil(total × 1,5 / 500) + 5` trang.
 * @example pageCap(10_000) // 35
 */
export function pageCap(total: number | null): number {
  if (total === null) return PAGE_CAP_UNKNOWN_TOTAL;
  return Math.ceil((total * 1.5) / PAGE_SIZE) + 5;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface PaginateCtx extends FetchCtx {
  readonly root: string;
  readonly clock: () => Instant;
  /** Gọi sau mỗi trang đọc xong, để đếm tiến trình. */
  readonly onPage: () => void;
}

/**
 * Đọc một endpoint, đủ mọi trang. Giữ dữ liệu thô đúng như API trả, kể cả
 * trùng lặp giữa các trang. Một trang hỏng sau khi hết lượt thử lại thì cả
 * endpoint hỏng và các trang đã đọc bị bỏ.
 */
export async function readEndpoint(
  ctx: PaginateCtx,
  read: EndpointRead,
  segments: readonly string[],
  total: number | null,
): Promise<EndpointOutcome> {
  const base: Record<string, string> = { ...read.query };
  if (read.columns) base.columns = read.columns.join(',');

  if (!read.paginated) {
    const r = await fetchWithRetry(ctx, apiUrl(ctx.root, segments, base), {
      endpoint: read.id,
      kind: 'json',
      maxBytes: MAX_BODY_BYTES,
    });
    if (!r.ok) return { ok: false, raw: r.failure.raw };
    const observedAt = ctx.clock();
    ctx.onPage();
    ctx.emit({ type: 'page', endpoint: read.id, page: 1, pageCount: 1 });
    return { ok: true, pages: [{ body: r.body, observedAt }] };
  }

  const cap = pageCap(total);
  const pages: Page[] = [];
  let lastStatus = 200;
  for (let page = 1; ; page++) {
    if (page > cap) {
      return {
        ok: false,
        raw: {
          status: 'http_error',
          code: lastStatus,
          note: 'pagination_runaway',
        },
      };
    }
    const url = apiUrl(ctx.root, segments, {
      page: String(page),
      page_size: String(PAGE_SIZE),
      ...base,
    });
    const r = await fetchWithRetry(ctx, url, {
      endpoint: read.id,
      kind: 'json',
      maxBytes: MAX_BODY_BYTES,
    });
    if (!r.ok) return { ok: false, raw: r.failure.raw };
    lastStatus = r.status;
    pages.push({ body: r.body, observedAt: ctx.clock() });
    ctx.onPage();
    if (Array.isArray(r.body)) {
      ctx.emit({
        type: 'warning',
        code: 'unpaginated_response',
        detail: `${read.id} returned an array to a paginated request`,
      });
      ctx.emit({ type: 'page', endpoint: read.id, page: 1, pageCount: 1 });
      return { ok: true, pages };
    }
    // Đọc page_count ở mọi trang: đối tượng thêm trong lúc đọc làm tăng số trang.
    const pageCount =
      isRecord(r.body) && typeof r.body.page_count === 'number'
        ? r.body.page_count
        : page;
    ctx.emit({
      type: 'page',
      endpoint: read.id,
      page,
      pageCount: Math.max(pageCount, page),
    });
    if (page >= pageCount) return { ok: true, pages };
  }
}
