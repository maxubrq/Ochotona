// Phiên bản RabbitMQ và phiên bản spec. File này không import gì để
// scripts/codegen.ts dùng lại được khi kiểm khoảng phiên bản.

export interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly pre?: string;
  readonly raw: string;
}

const VERSION_RE = /^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/;

/**
 * Parse phiên bản; thiếu patch thì là 0; không khớp thì `null`.
 * @example parseVersion('4.3.0-rc.1') // { major: 4, minor: 3, patch: 0, pre: 'rc.1', raw: '4.3.0-rc.1' }
 */
export function parseVersion(s: string): Version | null {
  const m = VERSION_RE.exec(s);
  if (!m) return null;
  const v = {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: m[3] === undefined ? 0 : Number(m[3]),
    raw: s,
  };
  return m[4] === undefined ? v : { ...v, pre: m[4] };
}

/** So `major.minor.patch`, bỏ qua `pre`. Dùng để tra khoảng năng lực. */
export function compareRelease(a: Version, b: Version): -1 | 0 | 1 {
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  return 0;
}

/**
 * So sánh theo semver: bản có `pre` nhỏ hơn bản phát hành cùng số.
 * @example compareVersion(parseVersion('4.0.0-rc.1')!, parseVersion('4.0')!) // -1
 */
export function compareVersion(a: Version, b: Version): -1 | 0 | 1 {
  const r = compareRelease(a, b);
  if (r !== 0) return r;
  if (a.pre === b.pre) return 0;
  if (a.pre === undefined) return 1;
  if (b.pre === undefined) return -1;
  const pa = a.pre.split('.');
  const pb = b.pre.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]) ? Number(pa[i]) : NaN;
    const nb = /^\d+$/.test(pb[i]) ? Number(pb[i]) : NaN;
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na < nb ? -1 : 1;
    } else if (!Number.isNaN(na)) return -1;
    else if (!Number.isNaN(nb)) return 1;
    else if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Đơn vị tương thích: từ 1.0 là major, trước 1.0 là `0.minor`.
 * @example compatKey(parseVersion('0.4.2')!) // '0.4'
 * @example compatKey(parseVersion('1.3.0')!) // '1'
 */
export function compatKey(v: Version): string {
  return v.major >= 1 ? String(v.major) : `0.${v.minor}`;
}
