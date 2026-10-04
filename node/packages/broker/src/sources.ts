import type { RawResult, SourceState, Totals } from '@ochotona/model';
import type { Sources } from './events';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function lastBody(raw: RawResult): unknown {
  return raw.status === 'ok'
    ? raw.pages[raw.pages.length - 1]?.body
    : undefined;
}

function stateOf(raw: RawResult<unknown>): SourceState {
  if (raw.status === 'ok') return 'ok';
  if (raw.status === 'not_attempted') return 'not_attempted';
  if (raw.status === 'http_error' && (raw.code === 401 || raw.code === 403))
    return 'forbidden';
  return 'unavailable';
}

/**
 * Ba nguồn dữ liệu. Khi không chắc, nghiêng về "không có": báo nhầm "có" sẽ
 * làm model đọc trường vắng thành 0 (GC21).
 */
export function detectSources(
  overview: RawResult,
  prometheus: RawResult<string>,
): Sources {
  const list = stateOf(overview);
  let stats: SourceState = list;
  if (list === 'ok') {
    const body = lastBody(overview);
    stats =
      isRecord(body) && 'message_stats' in body && 'churn_rates' in body
        ? 'ok'
        : 'unavailable';
  }
  return {
    'http.list': list,
    'http.stats': stats,
    prometheus: stateOf(prometheus),
  };
}

const TOTAL_KEYS = [
  'queues',
  'exchanges',
  'connections',
  'channels',
  'consumers',
] as const;

/** `object_totals` của overview; `null` khi thiếu hoặc sai kiểu. */
export function totalsOf(overview: RawResult): Totals | null {
  const body = lastBody(overview);
  if (!isRecord(body) || !isRecord(body.object_totals)) return null;
  const t = body.object_totals;
  for (const k of TOTAL_KEYS) {
    const v = t[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return null;
  }
  return t as unknown as Totals;
}

export function versionStringOf(overview: RawResult): string | null {
  const body = lastBody(overview);
  return isRecord(body) && typeof body.rabbitmq_version === 'string'
    ? body.rabbitmq_version
    : null;
}

export function nodeCountOf(nodes: RawResult): number | null {
  const body = lastBody(nodes);
  return Array.isArray(body) ? body.length : null;
}

/** Tên các vhost từ body của `/api/vhosts`; `null` khi không đọc được. */
export function vhostNamesOf(body: unknown): string[] | null {
  if (!Array.isArray(body)) return null;
  const names: string[] = [];
  for (const v of body) {
    if (!isRecord(v) || typeof v.name !== 'string') return null;
    names.push(v.name);
  }
  return names;
}
