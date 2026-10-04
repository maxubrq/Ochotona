// Overview, node, vhost, whoami, feature flag, deprecated feature, Prometheus.
import type {
  BrokerInfoBase,
  Churn,
  Node,
  Principal,
  QueueType,
  ReadSource,
  SourceState,
  Totals,
  Vhost,
} from '../actual';
import { QUEUE_TYPES } from '../actual';
import { type Observed, known, unknown } from '../observed';
import {
  type Instant,
  type Seconds,
  type Version,
  isCount,
  isPlainObject,
  parseVersion,
} from '../units';
import { type ParseOutcome, malformed } from './collect';
import {
  type FieldCtx,
  type RawResult,
  asCount,
  asRate,
  asString,
  field,
  getPath,
  reasonOf,
} from './raw';

type Sources = Readonly<Record<ReadSource, SourceState>>;

/** Thân của endpoint một trang (overview, whoami...), hoặc `unknown` cho cả endpoint. */
function single(
  raw: RawResult,
  endpoint: string,
): { body: unknown; observedAt: Instant } | Observed<never> {
  if (raw.status !== 'ok')
    return unknown(reasonOf(raw), 'http.list', `http:${endpoint}`);
  const page = raw.pages[raw.pages.length - 1];
  if (!page)
    return unknown(
      { kind: 'error', message: 'empty response' },
      'http.list',
      `http:${endpoint}`,
    );
  return page;
}

const isObs = (x: unknown): x is Observed<never> =>
  isPlainObject(x) && 'state' in x;

/** Trường của overview; endpoint lỗi thì mọi trường mang lý do của endpoint. */
function fromSingle<T>(
  page: ReturnType<typeof single>,
  endpoint: string,
  apiPath: string,
  source: 'http.list' | 'http.stats',
  sources: Sources,
  convert: (v: unknown) => T | undefined,
): Observed<T> {
  if (isObs(page)) {
    return page.state === 'unknown'
      ? { ...page, source, path: `http:${endpoint}#${apiPath}` }
      : page;
  }
  const fc: FieldCtx = { endpoint, observedAt: page.observedAt, sources };
  return field(page.body, apiPath, source, fc, convert);
}

const asVersion = (v: unknown): Version | undefined =>
  typeof v === 'string' ? (parseVersion(v) ?? undefined) : undefined;

export function sourcesOf(raw: {
  overview: RawResult;
  prometheus: RawResult<string>;
}): Sources {
  const list: SourceState =
    raw.overview.status === 'ok'
      ? 'ok'
      : raw.overview.status === 'not_attempted'
        ? 'not_attempted'
        : raw.overview.status === 'http_error' &&
            (raw.overview.code === 401 || raw.overview.code === 403)
          ? 'forbidden'
          : 'unavailable';
  let stats: SourceState = list;
  if (raw.overview.status === 'ok') {
    const body = raw.overview.pages[raw.overview.pages.length - 1]?.body;
    stats =
      isPlainObject(body) && 'message_stats' in body ? 'ok' : 'unavailable';
  }
  const p = raw.prometheus;
  const prom: SourceState =
    p.status === 'ok'
      ? 'ok'
      : p.status === 'not_attempted'
        ? 'not_attempted'
        : p.status === 'http_error' && (p.code === 401 || p.code === 403)
          ? 'forbidden'
          : 'unavailable';
  return { 'http.list': list, 'http.stats': stats, prometheus: prom };
}

/** Tổng của mọi series có đúng tên metric trong văn bản exposition. `undefined` nếu không có series nào. */
export function sumPrometheus(
  text: string,
  metric: string,
): number | undefined | 'invalid' {
  let total: number | undefined;
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    const m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)/.exec(line);
    if (!m || m[1] !== metric) continue;
    let i = m[1].length;
    if (line[i] === '{') {
      let inStr = false;
      for (i++; i < line.length; i++) {
        const c = line[i];
        if (inStr) {
          if (c === '\\') i++;
          else if (c === '"') inStr = false;
        } else if (c === '"') inStr = true;
        else if (c === '}') break;
      }
      i++;
    }
    const value = Number(line.slice(i).trim().split(/\s+/)[0]);
    if (!Number.isFinite(value)) return 'invalid';
    total = (total ?? 0) + value;
  }
  return total;
}

function promCounter(raw: RawResult<string>, metric: string): Observed<number> {
  const path = `prom:${metric}`;
  if (raw.status !== 'ok') {
    const reason =
      raw.status === 'not_attempted'
        ? { kind: 'source_unavailable' as const }
        : reasonOf(raw);
    return unknown(reason, 'prometheus', path);
  }
  const text = raw.pages.map((p) => p.body).join('\n');
  const sum = sumPrometheus(text, metric);
  if (sum === undefined)
    return unknown({ kind: 'field_absent' }, 'prometheus', path);
  if (sum === 'invalid' || !isCount(sum)) {
    return unknown(
      { kind: 'error', message: `invalid counter value` },
      'prometheus',
      path,
    );
  }
  const observedAt = raw.pages[raw.pages.length - 1].observedAt;
  return known(sum, { source: 'prometheus', path, observedAt });
}

function firstKnownOf<T>(...os: Observed<T>[]): Observed<T> {
  return os.find((o) => o.state === 'known') ?? os[0];
}

export function ingestBroker(
  raw: {
    overview: RawResult;
    featureFlags: RawResult;
    deprecatedUsed: RawResult;
    prometheus: RawResult<string>;
  },
  sources: Sources,
): BrokerInfoBase {
  const ov = single(raw.overview, '/api/overview');
  const o = <T>(
    path: string,
    source: 'http.list' | 'http.stats',
    conv: (v: unknown) => T | undefined,
  ) => fromSingle(ov, '/api/overview', path, source, sources, conv);

  const totals = o<Totals>('object_totals', 'http.list', (v) => {
    const t = {
      queues: 0,
      exchanges: 0,
      connections: 0,
      channels: 0,
      consumers: 0,
    };
    for (const k of Object.keys(t) as (keyof Totals)[]) {
      const n = getPath(v, k);
      if (!isCount(n)) return undefined;
      t[k] = n;
    }
    return t;
  });

  const churnKeys: [keyof Churn, string][] = [
    ['connectionCreated', 'connection_created'],
    ['connectionClosed', 'connection_closed'],
    ['queueDeclared', 'queue_declared'],
    ['queueCreated', 'queue_created'],
    ['queueDeleted', 'queue_deleted'],
  ];
  let churn: Observed<Churn> | undefined;
  const churnValue: Partial<Record<keyof Churn, unknown>> = {};
  for (const [k, api] of churnKeys) {
    const r = o(`churn_rates.${api}_details.rate`, 'http.stats', asRate);
    if (r.state === 'unknown') {
      churn = r;
      break;
    }
    churnValue[k] = r.value;
  }
  if (!churn) {
    const page = ov as { observedAt: Instant };
    churn = known(churnValue as unknown as Churn, {
      source: 'http.stats',
      path: 'http:/api/overview#churn_rates',
      observedAt: page.observedAt,
    });
  }

  const ff = single(raw.featureFlags, '/api/feature-flags');
  let featureFlags: BrokerInfoBase['featureFlags'];
  if (isObs(ff)) featureFlags = ff;
  else {
    const list = Array.isArray(ff.body) ? ff.body : null;
    const rec: Record<string, 'enabled' | 'disabled' | 'unavailable'> = {};
    let bad = list === null;
    for (const f of list ?? []) {
      const name = getPath(f, 'name');
      const state = getPath(f, 'state');
      if (typeof name !== 'string') bad = true;
      else
        rec[name] =
          state === 'enabled' || state === 'disabled' ? state : 'unavailable';
    }
    featureFlags = bad
      ? unknown(
          { kind: 'error', message: 'unexpected response body' },
          'http.list',
          'http:/api/feature-flags',
        )
      : known(rec, {
          source: 'http.list',
          path: 'http:/api/feature-flags',
          observedAt: ff.observedAt,
        });
  }

  const dep = single(raw.deprecatedUsed, '/api/deprecated-features/used');
  let deprecatedInUse: Observed<readonly string[]>;
  if (isObs(dep)) deprecatedInUse = dep;
  else {
    const names = Array.isArray(dep.body)
      ? dep.body.map((d) => getPath(d, 'name'))
      : null;
    deprecatedInUse =
      names && names.every((n) => typeof n === 'string')
        ? known(names as string[], {
            source: 'http.list',
            path: 'http:/api/deprecated-features/used',
            observedAt: dep.observedAt,
          })
        : unknown(
            { kind: 'error', message: 'unexpected response body' },
            'http.list',
            'http:/api/deprecated-features/used',
          );
  }

  return {
    productName: o('product_name', 'http.list', asString),
    clusterName: o('cluster_name', 'http.list', asString),
    featureFlags,
    deprecatedInUse,
    totals,
    churn,
    reported: {
      version: o('rabbitmq_version', 'http.list', asVersion),
      unroutableDropped: firstKnownOf(
        promCounter(
          raw.prometheus,
          'rabbitmq_global_messages_unroutable_dropped_total',
        ),
        o('message_stats.drop_unroutable', 'http.stats', asCount),
      ),
      unroutableReturned: firstKnownOf(
        promCounter(
          raw.prometheus,
          'rabbitmq_global_messages_unroutable_returned_total',
        ),
        o('message_stats.return_unroutable', 'http.stats', asCount),
      ),
    },
  };
}

/** `object_totals` của một overview, để so với số phần tử đọc được. */
export function totalsOf(raw: RawResult): Totals | null {
  const page = single(raw, '/api/overview');
  if (isObs(page)) return null;
  const t = getPath(page.body, 'object_totals');
  if (!isPlainObject(t)) return null;
  const keys = [
    'queues',
    'exchanges',
    'connections',
    'channels',
    'consumers',
  ] as const;
  return keys.every((k) => isCount(t[k])) ? (t as unknown as Totals) : null;
}

export function ingestWhoami(raw: RawResult): Observed<Principal> {
  const page = single(raw, '/api/whoami');
  if (isObs(page)) return page;
  const path = 'http:/api/whoami';
  const name = getPath(page.body, 'name');
  const rawTags = getPath(page.body, 'tags');
  // Bản cũ trả chuỗi cách bởi dấu phẩy, bản mới trả mảng.
  const tags =
    typeof rawTags === 'string'
      ? rawTags.split(',').filter((t) => t !== '')
      : Array.isArray(rawTags) && rawTags.every((t) => typeof t === 'string')
        ? (rawTags as string[])
        : rawTags === undefined
          ? []
          : null;
  if (typeof name !== 'string' || tags === null) {
    return unknown(
      { kind: 'error', message: 'unexpected response body' },
      'http.list',
      path,
    );
  }
  return known(
    { name, tags },
    { source: 'http.list', path, observedAt: page.observedAt },
  );
}

export function parseNode(it: unknown, fc: FieldCtx): ParseOutcome<Node> {
  if (!isPlainObject(it) || typeof it.name !== 'string')
    return malformed('missing name');
  const apps = it.applications;
  const rabbit = Array.isArray(apps)
    ? apps.find((a) => getPath(a, 'name') === 'rabbit')
    : undefined;
  const versionPath = 'applications[name=rabbit].version';
  const version: Observed<Version> =
    rabbit === undefined
      ? unknown(
          { kind: 'field_absent' },
          'http.list',
          `http:${fc.endpoint}#${versionPath}`,
        )
      : field(rabbit, 'version', 'http.list', { ...fc }, asVersion);
  return {
    item: {
      ref: { kind: 'node', name: it.name },
      running: it.running === true,
      version:
        version.state === 'known'
          ? {
              ...version,
              prov: {
                ...version.prov,
                path: `http:${fc.endpoint}#${versionPath}`,
              },
            }
          : { ...version, path: `http:${fc.endpoint}#${versionPath}` },
      memLimitBytes: field(it, 'mem_limit', 'http.list', fc, asCount),
      diskFreeLimitBytes: field(
        it,
        'disk_free_limit',
        'http.list',
        fc,
        asCount,
      ),
      uptime: field(it, 'uptime', 'http.list', fc, (v) =>
        isCount(v) ? ((v / 1000) as Seconds) : undefined,
      ),
    },
  };
}

export function parseVhost(it: unknown, fc: FieldCtx): ParseOutcome<Vhost> {
  if (!isPlainObject(it) || typeof it.name !== 'string')
    return malformed('missing name');
  const path = `http:${fc.endpoint}#default_queue_type`;
  const d = it.default_queue_type;
  let defaultQueueType: Observed<QueueType | null>;
  if (d === undefined || d === null || d === 'undefined') {
    defaultQueueType = known(null, {
      source: 'http.list',
      path,
      observedAt: fc.observedAt,
    });
  } else if ((QUEUE_TYPES as readonly unknown[]).includes(d)) {
    defaultQueueType = known(d as QueueType, {
      source: 'http.list',
      path,
      observedAt: fc.observedAt,
    });
  } else {
    defaultQueueType = unknown(
      { kind: 'error', message: `default_queue_type ${String(d)}` },
      'http.list',
      path,
    );
  }
  return { item: { ref: { kind: 'vhost', name: it.name }, defaultQueueType } };
}
