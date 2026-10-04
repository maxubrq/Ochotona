// Ghi fixture thô từ một broker thật, rồi che host (và tuỳ chọn tên).
//
//   OCHO_PASSWORD=… pnpm --filter @ochotona/broker record-raw \
//     --url https://b-1.mq.example:443 --user ocho-doctor \
//     --label amazon-mq-3.13 --variant full --out ../../fixtures/raw [--redact names]
//
// Cần `pnpm build` trước (công cụ nạp @ochotona/broker từ dist) và Node chạy
// được TypeScript trực tiếp (≥ 22.18, hoặc 22.6 với --experimental-strip-types).
// `--context` sẽ có khi gói cli đọc được context; tới lúc đó dùng --url, --user.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createReader, planRead } from '@ochotona/broker';
import type { BrokerTarget, RawResult, ReadPlan } from '@ochotona/broker';
import { redactDir } from './redact-raw.ts';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

function fail(msg: string): never {
  console.error(`record-raw: ${msg}`);
  process.exit(2);
}

/** Kế hoạch mặc định nhưng không gửi `columns`, để thấy mọi trường broker trả. */
function withoutColumns(plan: ReadPlan): ReadPlan {
  return {
    ...plan,
    inventory: plan.inventory.map((r) => ({ ...r, columns: null })),
  };
}

function write(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function bodyOf(raw: RawResult): unknown {
  return raw.status === 'ok' ? raw.pages[0]?.body : undefined;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      url: { type: 'string' },
      user: { type: 'string' },
      context: { type: 'string' },
      label: { type: 'string' },
      variant: { type: 'string' },
      out: { type: 'string', default: '../../fixtures/raw' },
      redact: { type: 'string' },
      ca: { type: 'string' },
      insecure: { type: 'boolean' },
      prometheus: { type: 'string' },
      'max-rps': { type: 'string' },
    },
  });
  if (values.context)
    fail('--context chưa có (cần gói cli); dùng --url và --user');
  if (!values.url || !values.user) fail('thiếu --url hoặc --user');
  if (!values.label || !values.variant) fail('thiếu --label hoặc --variant');
  if (values.redact !== undefined && values.redact !== 'names')
    fail('--redact chỉ nhận "names"');
  const password = process.env.OCHO_PASSWORD;
  if (!password) fail('đặt mật khẩu qua biến môi trường OCHO_PASSWORD');

  const target: BrokerTarget = {
    url: values.url,
    user: values.user,
    password,
    name: values.label,
    tls: {
      ...(values.ca ? { ca: readFileSync(values.ca, 'utf8') } : {}),
      ...(values.insecure ? { insecure: true } : {}),
    },
    prometheus:
      values.prometheus === 'off'
        ? 'off'
        : values.prometheus
          ? { url: values.prometheus }
          : 'auto',
  };
  const created = createReader(target, { toolVersion: pkg.version });
  if (!created.ok) fail(`${created.error.diag}: ${created.error.detail}`);
  const reader = created.value;
  const opts = {
    maxRps: values['max-rps'] ? Number(values['max-rps']) : 5,
    onEvent: (e: { type: string }) => {
      if (e.type === 'warning' || e.type === 'retry')
        console.error(JSON.stringify(e));
    },
  };

  try {
    const plan = withoutColumns(planRead());
    const id = await reader.identify(plan, opts);
    if (id.status !== 'ok') fail(`identify: ${JSON.stringify(id)}`);
    const out = await reader.read(plan, id.identified, opts);
    if (out.status !== 'complete') fail('read aborted');

    const dir = join(values.out!, values.label!, values.variant!);
    mkdirSync(join(dir, 'columns'), { recursive: true });
    for (const [endpoint, raw] of Object.entries(out.raw)) {
      if (endpoint === 'prometheus') {
        const p = raw as RawResult<string>;
        if (p.status === 'ok')
          writeFileSync(join(dir, 'prometheus.txt'), p.pages[0].body);
        write(
          join(dir, 'prometheus.json'),
          p.status === 'ok'
            ? {
                ...p,
                pages: p.pages.map((x) => ({ ...x, body: '@prometheus.txt' })),
              }
            : p,
        );
      } else {
        write(join(dir, `${endpoint}.json`), raw);
      }
    }

    // Đọc lại queues, channels có `columns` để kiểm GC20.
    const colPlan = planRead({
      requires: new Set(['queues', 'channels']),
      prometheus: false,
    });
    const colId = await reader.identify(colPlan, opts);
    if (colId.status === 'ok') {
      const col = await reader.read(colPlan, colId.identified, opts);
      if (col.status === 'complete') {
        write(join(dir, 'columns', 'queues.json'), col.raw.queues);
        write(join(dir, 'columns', 'channels.json'), col.raw.channels);
      }
    }

    const whoami = bodyOf(out.raw.whoami) as { tags?: unknown } | undefined;
    const tags = whoami?.tags;
    write(join(dir, 'manifest.json'), {
      label: values.label,
      variant: values.variant,
      recordedAt: out.readFinishedAt,
      brokerVersion: id.identified.version
        ? `${id.identified.version.major}.${id.identified.version.minor}.${id.identified.version.patch}`
        : null,
      nodes: Array.isArray(bodyOf(out.raw.nodes))
        ? (bodyOf(out.raw.nodes) as unknown[]).length
        : null,
      ochoVersion: pkg.version,
      userTags: Array.isArray(tags)
        ? tags
        : typeof tags === 'string'
          ? tags.split(',').filter(Boolean)
          : null,
      sources: id.identified.sources,
      redacted: false,
    });

    redactDir(dir, {
      names: values.redact === 'names',
      literals: [new URL(values.url!).hostname],
    });
    const s = reader.stats();
    console.log(
      `record-raw: ${dir} (${s.requests} request, ${s.retries} thử lại, ${Math.ceil(s.bytes / 1024)} KB)`,
    );
  } finally {
    await reader.close();
  }
}

await main();
