import type { CollectionName, ReadAnomaly } from '../actual';
import { type Observed, known, unknown } from '../observed';
import { type ObjectRef, refKey, sortByRefKey } from '../ref';
import { type Instant, latestInstant } from '../units';
import { type FieldCtx, type RawResult, pageItems, reasonOf } from './raw';

export type ParseOutcome<T> =
  { item: T } | { anomaly: Omit<ReadAnomaly, 'collection'> };

export interface IngestedList<T> {
  readonly list: Observed<readonly T[]>;
  readonly anomalies: readonly ReadAnomaly[];
  /** Số phần tử sau khi bỏ trùng, trước khi lọc; dùng cho page_shift. */
  readonly readCount: number;
}

/**
 * Ánh xạ một endpoint danh sách: đọc mọi trang, bỏ trùng (giữ bản ở trang sau),
 * sắp theo `refKey`. Endpoint không trả 200 thì cả bộ sưu tập `unknown`.
 */
export function ingestList<T extends { readonly ref: ObjectRef }>(
  raw: RawResult,
  endpoint: string,
  collection: CollectionName,
  base: Omit<FieldCtx, 'endpoint' | 'observedAt'>,
  fallbackAt: Instant,
  parse: (item: unknown, fc: FieldCtx) => ParseOutcome<T> | null,
): IngestedList<T> {
  const path = `http:${endpoint}`;
  if (raw.status !== 'ok') {
    return {
      list: unknown(reasonOf(raw), 'http.list', path),
      anomalies: [],
      readCount: 0,
    };
  }
  const anomalies: ReadAnomaly[] = [];
  const byKey = new Map<string, T>();
  for (const page of raw.pages) {
    const items = pageItems(page.body);
    if (items === null) {
      return {
        list: unknown(
          { kind: 'error', message: 'unexpected response body' },
          'http.list',
          path,
        ),
        anomalies: [],
        readCount: 0,
      };
    }
    const fc: FieldCtx = { ...base, endpoint, observedAt: page.observedAt };
    for (const it of items) {
      const out = parse(it, fc);
      if (out === null) continue;
      if ('anomaly' in out) {
        anomalies.push({ ...out.anomaly, collection });
        continue;
      }
      const key = refKey(out.item.ref);
      if (byKey.has(key)) {
        anomalies.push({
          kind: 'duplicate_key',
          collection,
          ref: out.item.ref,
          detail: 'seen on two pages; kept the later one',
        });
        byKey.delete(key);
      }
      byKey.set(key, out.item);
    }
  }
  const observedAt =
    latestInstant(raw.pages.map((p) => p.observedAt)) ?? fallbackAt;
  return {
    list: known(sortByRefKey([...byKey.values()]), {
      source: 'http.list',
      path,
      observedAt,
    }),
    anomalies,
    readCount:
      byKey.size + anomalies.filter((a) => a.kind !== 'duplicate_key').length,
  };
}

export function malformed(detail: string): ParseOutcome<never> {
  return { anomaly: { kind: 'malformed_item', ref: null, detail } };
}
