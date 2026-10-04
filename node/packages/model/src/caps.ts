// Bảng năng lực theo phiên bản, dựng từ @ochotona/spec. Model chỉ giữ phần
// `Effective` cần (mặc định dựng sẵn theo loại queue) và cho phép tiêm bảng
// khác trong test.
import {
  type Capabilities as SpecCapabilities,
  capabilityRanges,
  defaultsFor,
  parseVersion,
} from '@ochotona/spec';
import type { QueueType } from './actual';
import type { ArgMap, Version } from './units';

export interface CapabilityEntry {
  /** Áp từ phiên bản này trở lên, tới entry kế tiếp. */
  readonly since: string;
  /** Mặc định dựng sẵn theo loại queue, khoá chuẩn (không tiền tố x-). */
  readonly defaults: Readonly<Record<QueueType, ArgMap>>;
  /** Toàn bộ năng lực của khoảng trong spec; vắng ở bảng tự dựng cho test. */
  readonly spec?: SpecCapabilities;
}

export type CapabilityTable = readonly CapabilityEntry[];

export interface Capabilities {
  readonly version: Version;
  readonly defaults: Readonly<Record<QueueType, ArgMap>>;
  readonly spec?: SpecCapabilities;
}

/** Mỗi khoảng của `capabilities.json` thành một entry. */
export const DEFAULT_CAPABILITY_TABLE: CapabilityTable = capabilityRanges.map(
  (r) => {
    const v = parseVersion(r.from)!;
    return {
      since: r.from,
      defaults: {
        classic: defaultsFor(v, 'classic'),
        quorum: defaultsFor(v, 'quorum'),
        stream: defaultsFor(v, 'stream'),
      },
      spec: r.caps,
    };
  },
);

const release = (v: Version) => [v.major, v.minor, v.patch] as const;
const cmpRelease = (a: Version, b: Version) => {
  const [x, y] = [release(a), release(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
};

/**
 * Chọn năng lực cho một phiên bản: entry có `since` lớn nhất mà ≤ phiên bản.
 * So theo `major.minor.patch`, bỏ qua `pre`, nên `4.3.0-rc.1` mang hành vi
 * của 4.3. Phiên bản cũ hơn mọi entry thì dùng entry đầu.
 * @example capabilitiesFor(DEFAULT_CAPABILITY_TABLE, parseVersion('4.2.1')!).defaults.quorum['delivery-limit'] // 20
 */
export function capabilitiesFor(
  table: CapabilityTable,
  version: Version,
): Capabilities {
  let chosen = table[0];
  for (const e of table) {
    const since = parseVersion(e.since);
    if (since && cmpRelease(since, version) <= 0) chosen = e;
  }
  return {
    version,
    defaults: chosen?.defaults ?? { classic: {}, quorum: {}, stream: {} },
    ...(chosen?.spec ? { spec: chosen.spec } : {}),
  };
}
