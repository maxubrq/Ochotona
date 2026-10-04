// Trên broker thật của SUT: đọc bằng @ochotona/broker, chạy luật, áp mọi lệnh
// sửa bằng rabbitmqadmin v2 (giả định GC25), đọc lại và kiểm kết quả. Thay đổi
// broker, nên chỉ chạy khi được yêu cầu:
//
//   OCHO_LIVE_URL=http://localhost:42011 OCHO_LIVE_USER=ocho-admin \
//   OCHO_LIVE_PASSWORD=ocho-admin RABBITMQADMIN=/path/to/rabbitmqadmin \
//   pnpm test:live
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createReader } from '@ochotona/broker';
import {
  DEFAULT_CAPABILITY_TABLE,
  buildActual,
  planRead,
  refKey,
} from '@ochotona/model';
import { makeCtx } from '../src/ctx';
import { runRules } from '../src/engine';
import { readNeeds } from '../src/read-plan';
import { selectRules } from '../src/select';
import type { RuleResult } from '../src/types';

const url = process.env.OCHO_LIVE_URL;
const user = process.env.OCHO_LIVE_USER ?? 'ocho-admin';
const password = process.env.OCHO_LIVE_PASSWORD ?? 'ocho-admin';
const admin = process.env.RABBITMQADMIN ?? 'rabbitmqadmin';

const rules = selectRules({ targetVersion: false, includeExperimental: true });

async function check(): Promise<readonly RuleResult[]> {
  const r = createReader(
    { url: url!, user, password, name: 'live', tls: {}, prometheus: 'auto' },
    { toolVersion: '0.1.0-live' },
  );
  if (!r.ok) throw new Error(r.error.detail);
  const needs = readNeeds(rules);
  const plan = planRead({
    requires: needs.requires,
    prometheus: needs.prometheus,
    users: true,
  });
  try {
    const id = await r.value.identify(plan, { maxRps: 20 });
    if (id.status !== 'ok') throw new Error(JSON.stringify(id));
    const out = await r.value.read(plan, id.identified, { maxRps: 20 });
    if (out.status !== 'complete') throw new Error('read aborted');
    const actual = buildActual(out.raw, {
      contextName: 'live',
      readStartedAt: out.readStartedAt,
      readFinishedAt: out.readFinishedAt,
      scope: plan.scope,
      caps: DEFAULT_CAPABILITY_TABLE,
    });
    const run = runRules(makeCtx({ actual, now: out.readFinishedAt }), rules, {
      waivers: [],
      scope: { vhosts: 'all', flow: null },
      mode: 'production',
    });
    expect(run.internal).toEqual([]);
    return run.results;
  } finally {
    await r.value.close();
  }
}

/** Lệnh sinh ra cộng cờ kết nối; người dùng tự thêm cờ này khi chạy thật. */
function rabbitmqadmin(cmd: string): void {
  const conn = `${admin} --base-uri ${url} --username ${user} --password ${password} --non-interactive`;
  execFileSync('sh', ['-c', cmd.replace(/^rabbitmqadmin /, `${conn} `)], {
    stdio: 'pipe',
  });
}

const failKey = (r: RuleResult) =>
  `${r.rule} ${refKey(r.object)} ${r.variant ?? ''}`;

describe.skipIf(!url)('lệnh sửa trên broker thật', () => {
  it('Q3 reads /api/users when running as an administrator', async () => {
    const q3 = (await check()).filter((r) => r.rule === 'Q3');
    // perf-test kết nối bằng ocho-admin (tag administrator).
    expect(
      q3.some((r) => r.result === 'fail' && r.variant === 'administrator'),
    ).toBe(true);
    expect(q3.filter((r) => r.result === 'not_checked')).toEqual([]);
  });

  it('applies every policy fix with rabbitmqadmin v2; the fails go away and none appear', async () => {
    const before = await check();
    const fixed = before.filter(
      (r) => r.result === 'fail' && r.fix?.rabbitmqadmin,
    );
    expect(fixed.length).toBeGreaterThan(0);
    // T2 trỏ tới ocho.unroutable, phải có trước (văn bản `next` của T2 nói vậy).
    for (const vhost of new Set(
      fixed
        .filter((r) => r.rule === 'T2')
        .map((r) => ('vhost' in r.object ? r.object.vhost : '/')),
    )) {
      const v = `--vhost '${vhost}'`;
      rabbitmqadmin(
        `rabbitmqadmin ${v} declare exchange --name ocho.unroutable --type fanout`,
      );
      rabbitmqadmin(
        `rabbitmqadmin ${v} declare queue --name ocho.unroutable --type quorum`,
      );
      rabbitmqadmin(
        `rabbitmqadmin ${v} declare binding --source ocho.unroutable --destination-type queue --destination ocho.unroutable --routing-key ''`,
      );
    }
    // Áp theo thứ tự ngược để chắc rằng thứ tự không quan trọng.
    for (const r of [...fixed].reverse()) rabbitmqadmin(r.fix!.rabbitmqadmin!);

    const after = await check();
    const failsAfter = new Set(
      after.filter((r) => r.result === 'fail').map(failKey),
    );
    const still = fixed.map(failKey).filter((k) => failsAfter.has(k));
    expect(still).toEqual([]);
    const failsBefore = new Set(
      before.filter((r) => r.result === 'fail').map(failKey),
    );
    expect([...failsAfter].filter((k) => !failsBefore.has(k))).toEqual([]);
  }, 60_000);
});
