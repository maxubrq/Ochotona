import { parseVersion } from '@ochotona/spec';
import type { CollectionName, ReadSource, SourceState } from '../actual';
import { type CapabilityTable, capabilitiesFor } from '../caps';
import { type Observed, unknown } from '../observed';
import type { RawResult } from './raw';
import { isPlainObject } from '../units';

type ActivityList = 'connections' | 'channels' | 'consumers';
const ENDPOINT: Record<ActivityList, string> = {
  connections: '/api/connections',
  channels: '/api/channels',
  consumers: '/api/consumers',
};

/**
 * Hành vi của `/api/{connections,channels,consumers}` khi bộ thu thống kê tắt,
 * theo bảng năng lực của phiên bản trong overview. `null` khi không biết.
 */
function statsOffBehaviour(
  overview: RawResult,
  table: CapabilityTable,
  collection: ActivityList,
): 'listed' | 'rejected' | 'empty' | null {
  const body = overview.status === 'ok' ? overview.pages[0]?.body : undefined;
  const text = isPlainObject(body) ? body.rabbitmq_version : undefined;
  const v = typeof text === 'string' ? parseVersion(text) : null;
  if (!v) return null;
  return capabilitiesFor(table, v).spec?.statsOffLists[collection] ?? null;
}

/**
 * Danh sách hoạt động khi thống kê tắt (CL2). Trả `null` khi giữ nguyên danh sách.
 *
 * - Bảng năng lực nói phiên bản này trả 200 với danh sách rỗng (`empty`, 4.3):
 *   danh sách thành `unknown: source_unavailable`, bất kể nội dung.
 * - Broker trả 400 (`Stats in management UI are disabled`): lý do là
 *   `source_unavailable` thay vì `error: HTTP 400`.
 */
export function statsOffGuard<T>(
  collection: ActivityList,
  raw: RawResult,
  overview: RawResult,
  sources: Readonly<Record<ReadSource, SourceState>>,
  table: CapabilityTable,
): Observed<readonly T[]> | null {
  if (sources['http.list'] !== 'ok' || sources['http.stats'] === 'ok') {
    return null;
  }
  const path = `http:${ENDPOINT[collection]}`;
  const rejected = raw.status === 'http_error' && raw.code === 400;
  if (rejected || statsOffBehaviour(overview, table, collection) === 'empty') {
    return unknown({ kind: 'source_unavailable' }, 'http.stats', path);
  }
  return null;
}

/**
 * Đối chiếu chung, không phụ thuộc phiên bản: danh sách rỗng trong khi
 * `object_totals` của overview đếm > 0 thì không tin danh sách. Chỉ áp khi
 * phạm vi là mọi vhost, vì `object_totals` tính cho cả cluster.
 */
export function emptyButCounted<T>(
  collection: CollectionName,
  list: Observed<readonly T[]>,
  readCount: number,
  overview: RawResult,
  endpoint: string,
): Observed<readonly T[]> | null {
  if (list.state !== 'known' || readCount > 0) return null;
  const body = overview.status === 'ok' ? overview.pages[0]?.body : undefined;
  const totals = isPlainObject(body) ? body.object_totals : undefined;
  const n = isPlainObject(totals) ? totals[collection] : undefined;
  if (typeof n !== 'number' || n <= 0) return null;
  return unknown(
    {
      kind: 'inconsistent_read',
      detail: `${endpoint} returned no items while object_totals.${collection} = ${n}`,
    },
    'http.list',
    `http:${endpoint}`,
  );
}
