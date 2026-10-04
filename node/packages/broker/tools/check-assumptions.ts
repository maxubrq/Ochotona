// Đọc mọi bản ghi trong fixtures/raw và in bảng kiểm giả định GC, dạng Markdown.
//
//   node tools/check-assumptions.ts [thư mục, mặc định ../../fixtures/raw]
//
// ✓ đạt, ✗ không đạt, — không áp dụng hoặc thiếu dữ liệu. Thoát 1 nếu có ✗.
// Biến thể `nostats` và `listonly` được kỳ vọng không có thống kê.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

type Raw = { status: string; pages?: { body: unknown }[] };
type Mark = '✓' | '✗' | '—';

export interface Recording {
  readonly dir: string;
  readonly manifest: Record<string, unknown>;
  read(endpoint: string): Raw | null;
  text(file: string): string | null;
}

export function openRecording(dir: string): Recording {
  const json = (f: string) => {
    const p = join(dir, f);
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
  };
  return {
    dir,
    manifest: json('manifest.json') ?? {},
    read: (e) => json(`${e}.json`),
    text: (f) =>
      existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null,
  };
}

function items(raw: Raw | null): Record<string, unknown>[] | null {
  if (!raw || raw.status !== 'ok' || !raw.pages) return null;
  const out: Record<string, unknown>[] = [];
  for (const p of raw.pages) {
    const b = p.body as unknown;
    const list = Array.isArray(b) ? b : (b as { items?: unknown[] })?.items;
    if (!Array.isArray(list)) return null;
    out.push(...(list as Record<string, unknown>[]));
  }
  return out;
}

function getPath(o: unknown, path: string): unknown {
  let cur = o;
  for (const k of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

const all = (
  xs: Record<string, unknown>[] | null,
  f: (x: Record<string, unknown>) => boolean,
): Mark => (xs === null || xs.length === 0 ? '—' : xs.every(f) ? '✓' : '✗');

const PLAN_ENDPOINTS = [
  'overview',
  'whoami',
  'nodes',
  'vhosts',
  'featureFlags',
  'deprecatedUsed',
  'exchanges',
  'queues',
  'bindings',
  'policies',
  'operatorPolicies',
  'connections',
  'channels',
  'consumers',
  'totalsAtEnd',
];

const COLUMN_CHECKS: Record<string, string[]> = {
  queues: [
    'message_stats.publish_details.rate',
    'message_stats.deliver_get_details.rate',
    'message_stats.redeliver_details.rate',
  ],
  channels: [
    'connection_details.name',
    'message_stats.publish',
    'message_stats.publish_details.rate',
  ],
};

/** Biến thể tắt thống kê management: `nostats` và `listonly`. */
export const statsOff = (r: Recording) =>
  /nostats|listonly/.test(String(r.manifest.variant));

export const CHECKS: Record<string, (r: Recording) => Mark> = {
  // User chỉ có tag monitoring đọc được mọi endpoint: không endpoint nào 401, 403.
  GC1: (r) => {
    const tags = r.manifest.userTags;
    if (!Array.isArray(tags) || tags.length !== 1 || tags[0] !== 'monitoring')
      return '—';
    return PLAN_ENDPOINTS.every((e) => {
      const raw = r.read(e) as (Raw & { code?: number }) | null;
      return !(
        raw?.status === 'http_error' &&
        (raw.code === 401 || raw.code === 403)
      );
    })
      ? '✓'
      : '✗';
  },
  GC2: (r) => {
    if (!statsOff(r)) return '—';
    const raw = r.read('channels');
    if (raw?.status !== 'ok') return '✗';
    return all(items(raw), (c) => 'confirm' in c);
  },
  'GC8, GC21': (r) => {
    const o = r.read('overview');
    const b = o?.status === 'ok' ? o.pages?.[0]?.body : undefined;
    if (!b || typeof b !== 'object') return '—';
    const has = 'message_stats' in b && 'churn_rates' in b;
    return has === !statsOff(r) ? '✓' : '✗';
  },
  GC9: (r) =>
    all(
      items(r.read('nodes')),
      (n) =>
        Array.isArray(n.applications) &&
        n.applications.some(
          (a: { name?: unknown; version?: unknown }) =>
            a?.name === 'rabbit' && typeof a.version === 'string',
        ),
    ),
  GC12: (r) =>
    all(items(r.read('queues')), (q) => 'effective_policy_definition' in q),
  GC15: (r) => all(items(r.read('vhosts')), (v) => 'default_queue_type' in v),
  GC17: (r) =>
    String(r.manifest.brokerVersion ?? '').startsWith('3.13.')
      ? r.read('deprecatedUsed')?.status === 'ok'
        ? '✓'
        : '✗'
      : '—',
  GC20: (r) => {
    const marks: Mark[] = [];
    for (const [endpoint, paths] of Object.entries(COLUMN_CHECKS)) {
      const full = items(r.read(endpoint));
      const cols = items(openRecording(join(r.dir, 'columns')).read(endpoint));
      if (!full || !cols) continue;
      const key = (x: Record<string, unknown>) => `${x.vhost}\0${x.name}`;
      const byKey = new Map(cols.map((c) => [key(c), c]));
      let ok = true;
      for (const f of full) {
        const c = byKey.get(key(f));
        if (!c) continue;
        for (const p of paths) {
          if (getPath(f, p) !== undefined && getPath(c, p) === undefined)
            ok = false;
        }
      }
      marks.push(ok ? '✓' : '✗');
    }
    return marks.length === 0 ? '—' : marks.includes('✗') ? '✗' : '✓';
  },
  GC22: (r) => {
    const t = r.text('prometheus.txt');
    if (t === null) return '—';
    return /^rabbitmq_identity_info\{[^}]*rabbitmq_node="/m.test(t) ? '✓' : '✗';
  },
};

function recordings(root: string): string[] {
  const out: string[] = [];
  for (const label of readdirSync(root).sort()) {
    const l = join(root, label);
    if (!statSync(l).isDirectory()) continue;
    for (const variant of readdirSync(l).sort()) {
      const d = join(l, variant);
      if (statSync(d).isDirectory() && existsSync(join(d, 'manifest.json')))
        out.push(d);
    }
  }
  return out;
}

export function table(root: string): { markdown: string; failed: boolean } {
  const codes = Object.keys(CHECKS);
  const lines = [
    `| Bản ghi | ${codes.join(' | ')} |`,
    `| --- | ${codes.map(() => '---').join(' | ')} |`,
  ];
  let failed = false;
  for (const d of recordings(root)) {
    const r = openRecording(d);
    const marks = codes.map((c) => CHECKS[c](r));
    if (marks.includes('✗')) failed = true;
    lines.push(
      `| ${r.manifest.label}/${r.manifest.variant} | ${marks.join(' | ')} |`,
    );
  }
  return { markdown: lines.join('\n'), failed };
}

function main(): void {
  const root = process.argv[2] ?? '../../fixtures/raw';
  if (!existsSync(root)) {
    console.error(`check-assumptions: không có ${root}`);
    process.exit(2);
  }
  const { markdown, failed } = table(root);
  console.log(markdown);
  if (failed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
