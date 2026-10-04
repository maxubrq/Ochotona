// Bảng năng lực theo phiên bản. Theo spec nó thuộc @ochotona/spec; gói đó
// chưa có nội dung nên tạm đặt ở đây, giữ hình dạng dữ liệu thuần để chuyển đi.
import type { QueueType } from './actual';
import {
  type ArgMap,
  type Version,
  compareVersion,
  parseVersion,
} from './units';

export interface CapabilityEntry {
  /** Áp từ phiên bản này trở lên, tới entry kế tiếp. */
  readonly since: string;
  /** Mặc định dựng sẵn theo loại queue, khoá chuẩn (không tiền tố x-). */
  readonly defaults: Readonly<Record<QueueType, ArgMap>>;
}

export type CapabilityTable = readonly CapabilityEntry[];

export interface Capabilities {
  readonly version: Version;
  readonly defaults: Readonly<Record<QueueType, ArgMap>>;
}

export const DEFAULT_CAPABILITY_TABLE: CapabilityTable = [
  {
    since: '3.13.0',
    defaults: {
      classic: { overflow: 'drop-head' },
      quorum: { overflow: 'drop-head', 'dead-letter-strategy': 'at-most-once' },
      stream: {},
    },
  },
  {
    since: '4.0.0',
    defaults: {
      classic: { overflow: 'drop-head' },
      quorum: {
        overflow: 'drop-head',
        'dead-letter-strategy': 'at-most-once',
        'delivery-limit': 20,
      },
      stream: {},
    },
  },
];

/**
 * Chọn năng lực cho một phiên bản: entry có `since` lớn nhất mà ≤ phiên bản.
 * Phiên bản cũ hơn mọi entry thì dùng entry đầu.
 * @example capabilitiesFor(DEFAULT_CAPABILITY_TABLE, parseVersion('4.2.1')!).defaults.quorum['delivery-limit'] // 20
 */
export function capabilitiesFor(
  table: CapabilityTable,
  version: Version,
): Capabilities {
  let chosen = table[0];
  for (const e of table) {
    const since = parseVersion(e.since);
    if (since && compareVersion(since, version) <= 0) chosen = e;
  }
  return {
    version,
    defaults: chosen?.defaults ?? { classic: {}, quorum: {}, stream: {} },
  };
}
