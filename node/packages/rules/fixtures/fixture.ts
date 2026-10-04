// Định dạng fixture và cách chạy một fixture. Định dạng `expect` dùng chung cho
// tầng đơn vị và tầng tích hợp.
import {
  type Instant,
  type RawResponses,
  type Waiver,
  buildActual,
  buildDesired,
  DEFAULT_CAPABILITY_TABLE,
  parseVersion,
} from '@ochotona/model';
import type { Result, RuleCode, Severity, Tolerance } from '@ochotona/spec';
import { makeCtx } from '../src/ctx';
import { type RunOutput, runRules } from '../src/engine';
import { selectRules } from '../src/select';
import type { Ctx } from '../src/types';
import { T0, T2 } from './builder';

export const NOW = '2026-10-04T02:00:00.000Z' as Instant;

export interface Expect {
  /** `refKey` của đối tượng; `*` là bất kỳ đối tượng nào (chỉ tầng tích hợp). */
  readonly object: string;
  /** `none`: luật không ra kết quả nào cho đối tượng (loại trừ `skip`). */
  readonly result: Result | 'none';
  readonly severity?: Severity;
  readonly variant?: string;
  readonly note?: string;
  /** Đường dẫn của `not_checked`. */
  readonly path?: string;
  readonly waived?: boolean;
  readonly urgency?: string;
  /** Một phần của `params`: chỉ các khoá được nêu. */
  readonly params?: Readonly<Record<string, unknown>>;
  readonly fixSet?: Readonly<Record<string, unknown>>;
  /** `"<kind> <path>[ <note>]"` theo đúng thứ tự. */
  readonly evidence?: readonly string[];
}

export interface Fixture {
  readonly rule: RuleCode;
  /** `fail`: phải bắt; `near`: gần đúng mà không được báo; `anti`: trường hợp hợp lệ rõ ràng. */
  readonly kind: 'fail' | 'near' | 'anti';
  readonly title: string;
  readonly raw: RawResponses;
  /** `ocho.yaml` đã parse; `null` khi không có. */
  readonly desired?: unknown;
  readonly targetVersion?: string;
  readonly waivers?: readonly Waiver[];
  readonly expect: readonly Expect[];
}

export const fixture = (f: Fixture): Fixture => f;

const e = encodeURIComponent;
/** `refKey` viết tắt cho `expect`. */
export const ref = {
  queue: (name: string, vhost = '/') => `queue:${e(vhost)}:${e(name)}`,
  exchange: (name: string, vhost = '/') => `exchange:${e(vhost)}:${e(name)}`,
  connection: (name: string) => `connection:${e(name)}`,
  channel: (conn: string, n: number) => `channel:${e(`${conn} (${n})`)}`,
  consumer: (conn: string, n: number, tag: string) =>
    `consumer:${e(`${conn} (${n})`)}:${e(tag)}`,
  node: (name: string) => `node:${e(name)}`,
  broker: 'broker',
} as const;

type FlowDecl = {
  tolerance: Tolerance;
  vhost?: string;
  queue?: string;
  exchange?: string;
  groups?: string[];
};

/** `ocho.yaml` tối thiểu: luồng và service (user → luồng). */
export function declared(
  flows: Record<string, FlowDecl>,
  services: Record<string, { user: string; flows: string[] }> = {},
): unknown {
  return { spec: '0.4', broker: { min_version: '3.13' }, flows, services };
}

/** Chạy một fixture qua đúng đường của CLI: buildActual → buildDesired → runRules. */
export function runFixture(
  f: Fixture,
  mode: 'test' | 'production' = 'test',
): RunOutput & { ctx: Ctx } {
  const actual = buildActual(f.raw, {
    contextName: 'fixture',
    readStartedAt: T0,
    readFinishedAt: T2,
    scope: { vhosts: 'all' },
    caps: DEFAULT_CAPABILITY_TABLE,
  });
  let desired = null;
  if (f.desired !== undefined && f.desired !== null) {
    const d = buildDesired(f.desired, NOW);
    if (!d.ok)
      throw new Error(
        `${f.rule} ${f.title}: bad ocho.yaml ${JSON.stringify(d.error)}`,
      );
    desired = d.value;
  }
  const targetVersion = f.targetVersion ? parseVersion(f.targetVersion) : null;
  const ctx = makeCtx({ actual, desired, targetVersion, now: NOW });
  const rules = selectRules({
    targetVersion: targetVersion !== null,
    includeExperimental: true,
    only: [f.rule],
  });
  const out = runRules(ctx, rules, {
    waivers: f.waivers ?? desired?.waivers ?? [],
    scope: { vhosts: 'all', flow: null },
    mode,
  });
  return { ...out, ctx };
}
