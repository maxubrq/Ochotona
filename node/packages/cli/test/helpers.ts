// Management API giả phát lại bản ghi thô thật (`fixtures/raw`, do
// SUT/record.sh ghi), và ảnh chụp tất định cho báo cáo vàng. IO giả ở `io.ts`.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  type MockReply,
  type MockRoute,
  type MockServer,
  startMock,
} from '../../broker/tools/mock-mgmt.ts';
import {
  DEFAULT_CAPABILITY_TABLE,
  ENDPOINT_IDS,
  type Instant,
  type RawResponses,
  type RawResult,
  buildActual,
  saveSnapshot,
} from '@ochotona/model';
import { USER } from './io';

export * from './io';

export const RAW_ROOT = new URL('../../../fixtures/raw/', import.meta.url)
  .pathname;

// ------------------------------------------------------------- bản ghi thô

export function recordings(): string[] {
  if (!existsSync(RAW_ROOT)) return [];
  return readdirSync(RAW_ROOT).flatMap((label) =>
    readdirSync(join(RAW_ROOT, label))
      .filter((v) => existsSync(join(RAW_ROOT, label, v, 'manifest.json')))
      .map((v) => `${label}/${v}`),
  );
}

export function loadRecording(rec: string): {
  raw: RawResponses;
  start: Instant;
  end: Instant;
} {
  const dir = join(RAW_ROOT, rec);
  const json = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const raw = {} as Record<string, RawResult<unknown>>;
  for (const id of ENDPOINT_IDS) {
    const r = json(`${id}.json`) as RawResult<unknown>;
    if (id === 'prometheus' && r.status === 'ok') {
      const text = readFileSync(join(dir, 'prometheus.txt'), 'utf8');
      raw[id] = { ...r, pages: r.pages.map((p) => ({ ...p, body: text })) };
    } else raw[id] = r;
  }
  const times = Object.values(raw)
    .flatMap((r) => (r.status === 'ok' ? r.pages.map((p) => p.observedAt) : []))
    .sort();
  return {
    raw: raw as unknown as RawResponses,
    start: times[0],
    end: times[times.length - 1],
  };
}

/** Ảnh chụp tất định của một bản ghi, cho báo cáo vàng qua `--from`. */
export function snapshotOf(rec: string): string {
  const { raw, start, end } = loadRecording(rec);
  const actual = buildActual(raw, {
    contextName: 'sut',
    readStartedAt: start,
    readFinishedAt: end,
    scope: { vhosts: 'all' },
    caps: DEFAULT_CAPABILITY_TABLE,
  });
  return saveSnapshot(actual, {
    toolVersion: '0.1.0',
    specVersion: '0.4.0',
    takenAt: end,
    contextName: 'sut',
    url: 'http://sut.example:15672',
    redactHosts: false,
    randomBytes: (n) => new Uint8Array(n),
  });
}

const PATHS: Partial<Record<keyof RawResponses, string>> = {
  overview: '/api/overview',
  whoami: '/api/whoami',
  nodes: '/api/nodes',
  vhosts: '/api/vhosts',
  featureFlags: '/api/feature-flags',
  deprecatedUsed: '/api/deprecated-features/used',
  exchanges: '/api/exchanges',
  queues: '/api/queues',
  bindings: '/api/bindings',
  policies: '/api/policies',
  operatorPolicies: '/api/operator-policies',
  connections: '/api/connections',
  channels: '/api/channels',
  consumers: '/api/consumers',
  prometheus: '/metrics',
};

const VHOST_OF: Partial<Record<keyof RawResponses, (x: any) => string>> = {
  exchanges: (x) => x.vhost,
  queues: (x) => x.vhost,
  bindings: (x) => x.vhost,
  policies: (x) => x.vhost,
  operatorPolicies: (x) => x.vhost,
  consumers: (x) => x.queue?.vhost,
};

function replyOf(
  r: RawResult<unknown>,
  page: number,
  vhost: string | null,
  id: keyof RawResponses,
): MockReply {
  switch (r.status) {
    case 'ok': {
      const p = r.pages[Math.max(0, page - 1)] ?? r.pages[0];
      if (typeof p.body === 'string') return { text: p.body };
      let body: any = p.body;
      if (vhost !== null && VHOST_OF[id]) {
        const keep = (xs: any[]) =>
          xs.filter((x) => VHOST_OF[id]!(x) === vhost);
        body = Array.isArray(body)
          ? keep(body)
          : { ...body, items: keep(body.items ?? []) };
      }
      return { json: body };
    }
    case 'http_error':
      return { status: r.code, json: { error: 'error', reason: 'recorded' } };
    case 'network_error':
      return { destroy: true };
    default:
      return { status: 404, json: { error: 'Object Not Found' } };
  }
}

/** Management API giả phát lại một bản ghi. Đường dẫn theo vhost được lọc từ bản ghi đầy đủ. */
export async function startReplay(rec: string): Promise<MockServer> {
  const { raw } = loadRecording(rec);
  const routes: Record<string, MockRoute> = {};
  const vhostNames: string[] = [];
  const vh = raw.vhosts;
  if (vh.status === 'ok')
    for (const v of vh.pages[0].body as { name: string }[])
      vhostNames.push(v.name);
  for (const [id, path] of Object.entries(PATHS) as [
    keyof RawResponses,
    string,
  ][]) {
    const r = raw[id] as RawResult<unknown>;
    routes[path] = (req) =>
      replyOf(r, Number(req.query.get('page') ?? 1), null, id);
    if (VHOST_OF[id])
      for (const v of vhostNames)
        routes[`${path}/${encodeURIComponent(v)}`] = (req) =>
          replyOf(r, Number(req.query.get('page') ?? 1), v, id);
  }
  Object.assign(routes, objectRoutes(raw));
  return startMock(routes);
}

const listOf = (r: RawResult<unknown>): any[] =>
  r.status === 'ok'
    ? r.pages.flatMap((p: any) =>
        Array.isArray(p.body) ? p.body : p.body.items,
      )
    : [];

/** Endpoint của từng queue, exchange (`explain queue|exchange <tên>`), dựng từ danh sách đã ghi. */
function objectRoutes(raw: RawResponses): Record<string, MockRoute> {
  const routes: Record<string, MockRoute> = {};
  const bindings = listOf(raw.bindings);
  const at = (x: any) =>
    `${encodeURIComponent(x.vhost)}/${encodeURIComponent(x.name)}`;
  for (const q of listOf(raw.queues)) {
    routes[`/api/queues/${at(q)}`] = { json: q };
    routes[`/api/queues/${at(q)}/bindings`] = {
      json: bindings.filter(
        (b) =>
          b.vhost === q.vhost &&
          b.destination_type === 'queue' &&
          b.destination === q.name,
      ),
    };
  }
  for (const x of listOf(raw.exchanges)) {
    if (x.name === '') continue;
    routes[`/api/exchanges/${at(x)}`] = { json: x };
    routes[`/api/exchanges/${at(x)}/bindings/source`] = {
      json: bindings.filter((b) => b.vhost === x.vhost && b.source === x.name),
    };
  }
  return routes;
}

/** Cờ chung cho một broker giả: URL, user, Prometheus của chính mock, tốc độ tối đa. */
export function targetFlags(mock: MockServer): string[] {
  return [
    '--url',
    mock.url,
    '--user',
    USER,
    '--prometheus-url',
    `${mock.url}/metrics`,
    '--max-rps',
    '20',
    '--concurrency',
    '4',
  ];
}
