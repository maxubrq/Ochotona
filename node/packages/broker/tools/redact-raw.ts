// Che host (và tuỳ chọn tên) trong fixture thô do record-raw ghi ra.
//
//   node tools/redact-raw.ts <thư mục bản ghi> [--redact names] [--literal <chuỗi>]…
//   node tools/redact-raw.ts --check <thư mục fixtures/raw>
//   node tools/redact-raw.ts --check-files <file>…   (lint-staged)
//
// Băm nhất quán trong một lần chạy: cùng giá trị → cùng mã, muối ngẫu nhiên
// mỗi lần. `--check` thoát 1 nếu còn chuỗi khớp IPv4, IPv6 hoặc `.amazonaws.com`.

import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const IPV4 =
  /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;
// Có `::` hoặc đủ 8 nhóm; tránh bắt nhầm giờ "12:30:45".
const IPV6 =
  /(?<![\w:])(?:[0-9a-f]{0,4}:){1,7}:(?:[0-9a-f]{0,4}:){0,6}[0-9a-f]{1,4}(?![\w:])|(?<![\w:])(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}(?![\w:])/gi;
const HOSTNAME =
  /\b[\w-]+(?:\.[\w-]+)*\.(?:amazonaws\.com|internal|compute\.internal)\b/gi;
const NODE = /\b(rabbit(?:mq)?)@([\w.-]+)/g;

export interface RedactOptions {
  readonly names: boolean;
  /** Chuỗi luôn bị che (ví dụ host của management URL). */
  readonly literals: readonly string[];
  readonly salt?: string;
}

/** Tạo bộ che dùng chung cho mọi file của một lần chạy. */
export function makeRedactor(opts: RedactOptions) {
  const salt = opts.salt ?? randomBytes(16).toString('hex');
  const h = (kind: string, v: string) =>
    `${kind}-${createHash('sha256').update(`${salt}\0${v}`).digest('hex').slice(0, 10)}`;
  const literals = [...opts.literals]
    .filter((s) => s.length > 0)
    .sort((a, b) => b.length - a.length);

  /** Che host trong một chuỗi tự do. */
  const hosts = (s: string): string => {
    let out = s;
    for (const l of literals) out = out.split(l).join(h('host', l));
    return out
      .replace(NODE, (_, p: string, host: string) => `${p}@${h('host', host)}`)
      .replace(HOSTNAME, (m) => h('host', m))
      .replace(IPV4, (m) => h('ip', m))
      .replace(IPV6, (m) => h('ip', m));
  };

  const name = (kind: string, v: unknown) =>
    typeof v === 'string' && v !== '' ? h(kind, v) : v;

  /** Che theo khoá; `endpoint` là tên file không đuôi. */
  function item(
    endpoint: string,
    v: unknown,
    key: string | null,
    parent: string | null,
  ): unknown {
    if (Array.isArray(v)) return v.map((x) => item(endpoint, x, key, parent));
    if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(o)) {
        if (
          k === 'client_properties' &&
          x &&
          typeof x === 'object' &&
          !Array.isArray(x)
        ) {
          const cp: Record<string, unknown> = {};
          for (const [ck, cv] of Object.entries(x as Record<string, unknown>)) {
            cp[ck] =
              ck === 'product' || ck === 'version' || ck === 'connection_name'
                ? cv
                : h('client', JSON.stringify(cv));
          }
          out[k] = cp;
        } else {
          out[k] = item(endpoint, x, k, key);
        }
      }
      return out;
    }
    if (typeof v !== 'string' || key === null) return v;
    if (/version/i.test(key)) return v;
    if (key === 'peer_host' || key === 'host') return h('host', v);
    // Tên connection và channel chứa địa chỉ IP của client.
    const isConnName =
      (key === 'name' &&
        parent === null &&
        (endpoint === 'connections' || endpoint === 'channels')) ||
      (key === 'name' &&
        (parent === 'connection_details' || parent === 'channel_details')) ||
      (key === 'connection_name' && parent === 'channel_details');
    if (isConnName) return h('conn', v);
    if (opts.names) {
      if (key === 'vhost') return name('vhost', v);
      if (key === 'user' || (endpoint === 'whoami' && key === 'name'))
        return name('user', v);
      if (key === 'policy' || key === 'operator_policy')
        return name('policy', v);
      if (key === 'name' && parent === null) {
        const kind =
          endpoint === 'queues'
            ? 'queue'
            : endpoint === 'exchanges'
              ? 'exchange'
              : endpoint === 'vhosts'
                ? 'vhost'
                : endpoint === 'policies' || endpoint === 'operatorPolicies'
                  ? 'policy'
                  : null;
        if (
          kind &&
          !(kind === 'exchange' && (v === '' || v.startsWith('amq.')))
        )
          return name(kind, v);
      }
      if (key === 'name' && parent === 'queue') return name('queue', v);
      if (
        endpoint === 'bindings' &&
        (key === 'source' || key === 'destination') &&
        v !== '' &&
        !v.startsWith('amq.')
      )
        return name(key === 'source' ? 'exchange' : 'queue', v);
    }
    return hosts(v);
  }

  /** Che body của một trang: mảng trần, hoặc `{ items }` của endpoint phân trang. */
  function body(endpoint: string, b: unknown): unknown {
    if (typeof b === 'string') return hosts(b);
    if (Array.isArray(b)) return b.map((x) => item(endpoint, x, null, null));
    if (
      b &&
      typeof b === 'object' &&
      Array.isArray((b as { items?: unknown }).items)
    ) {
      const o = b as { items: unknown[] };
      return { ...o, items: o.items.map((x) => item(endpoint, x, null, null)) };
    }
    return item(endpoint, b, null, null);
  }

  return { item, hosts, body };
}

/** Chuỗi còn sót: IPv4, IPv6, `.amazonaws.com`. Bỏ qua khoá chứa `version`. */
export function leaks(text: string, isJson: boolean): string[] {
  const found: string[] = [];
  const scan = (s: string) => {
    for (const re of [IPV4, IPV6, /\.amazonaws\.com/gi]) {
      for (const m of s.matchAll(re)) found.push(m[0]);
    }
  };
  if (!isJson) {
    for (const line of text.split('\n')) {
      scan(line.replace(/\w*version="[^"]*"/gi, ''));
    }
    return found;
  }
  const walk = (v: unknown, key: string) => {
    if (typeof v === 'string') {
      if (!/version/i.test(key)) scan(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(x, k);
    }
  };
  walk(JSON.parse(text), '');
  return found;
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

/** Che mọi file trong một thư mục bản ghi, ghi đè tại chỗ, cập nhật manifest. */
export function redactDir(dir: string, opts: RedactOptions): void {
  const r = makeRedactor(opts);
  for (const f of filesUnder(dir)) {
    const base = f.split('/').pop()!;
    if (base === 'manifest.json') continue;
    const text = readFileSync(f, 'utf8');
    if (f.endsWith('.txt')) {
      writeFileSync(f, r.hosts(text));
    } else if (f.endsWith('.json')) {
      const endpoint = base.replace(/\.json$/, '');
      const raw = JSON.parse(text);
      if (raw && Array.isArray(raw.pages)) {
        raw.pages = raw.pages.map(
          (p: { body: unknown; observedAt: string }) => ({
            ...p,
            body: r.body(endpoint, p.body),
          }),
        );
      }
      if (typeof raw?.message === 'string') raw.message = r.hosts(raw.message);
      writeFileSync(f, `${JSON.stringify(raw, null, 2)}\n`);
    }
  }
  const mf = join(dir, 'manifest.json');
  try {
    const m = JSON.parse(readFileSync(mf, 'utf8'));
    m.redacted = opts.names ? 'hosts+names' : 'hosts';
    writeFileSync(mf, `${JSON.stringify(m, null, 2)}\n`);
  } catch {
    // không có manifest: thư mục không do record-raw ghi
  }
}

/** Quét cả cây fixtures; trả danh sách `file: chuỗi`. */
export function checkTree(root: string): string[] {
  const bad: string[] = [];
  for (const f of filesUnder(root)) {
    if (!f.endsWith('.json') && !f.endsWith('.txt')) continue;
    for (const m of leaks(readFileSync(f, 'utf8'), f.endsWith('.json')))
      bad.push(`${f}: ${m}`);
  }
  return bad;
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      redact: { type: 'string' },
      literal: { type: 'string', multiple: true },
      check: { type: 'string' },
      'check-files': { type: 'boolean' },
    },
  });
  if (values['check-files']) {
    // Dùng trong lint-staged: chặn commit file fixture còn chuỗi định danh host.
    const bad: string[] = [];
    for (const f of positionals) {
      if (!f.endsWith('.json') && !f.endsWith('.txt')) continue;
      for (const m of leaks(readFileSync(f, 'utf8'), f.endsWith('.json')))
        bad.push(`${f}: ${m}`);
    }
    for (const b of bad) console.error(b);
    if (bad.length) {
      console.error(
        'redact-raw: chạy redact-raw trên bản ghi trước khi commit',
      );
      process.exit(1);
    }
    return;
  }
  if (values.check) {
    const bad = checkTree(values.check);
    for (const b of bad) console.error(b);
    if (bad.length) process.exit(1);
    console.log(`redact-raw: ${values.check} sạch`);
    return;
  }
  if (positionals.length !== 1) {
    console.error(
      'usage: redact-raw <dir> [--redact names] [--literal host]… | --check <dir>',
    );
    process.exit(2);
  }
  redactDir(positionals[0], {
    names: values.redact === 'names',
    literals: values.literal ?? [],
  });
  console.log(`redact-raw: đã che ${positionals[0]}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
