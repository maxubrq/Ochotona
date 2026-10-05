// Nói chuyện với broker qua @ochotona/broker cho mọi lệnh: tạo reader,
// nhận diện, đọc; đổi kết quả thất bại thành `CliError` với đúng exit code.

import {
  type BrokerReader,
  type Identified,
  type ReadOptions,
  createReader,
} from '@ochotona/broker';
import {
  type Actual,
  type Instant,
  type RawResponses,
  type ReadPlan,
  type ReadScope,
  DEFAULT_CAPABILITY_TABLE,
  ENDPOINT_IDS,
  buildActual,
} from '@ochotona/model';
import { BROKER_SUPPORT } from '@ochotona/spec';
import { intFlag } from './args';
import { Interrupted, diag } from './errors';
import type { Session } from './session';
import type { ResolvedTarget } from './target';
import { TOOL_VERSION } from './version';

export interface Limits {
  readonly maxRps: number;
  readonly concurrency: number;
}

/** `--max-rps` (1–20, mặc định 5), `--concurrency` (1–4, mặc định 2). */
export function limitsOf(s: Session): Limits {
  return {
    maxRps: intFlag(s.args, 'max-rps', 1, 20) ?? 5,
    concurrency: intFlag(s.args, 'concurrency', 1, 4) ?? 2,
  };
}

/** Tạo reader; URL sai (CX4, CX10) thì exit 4. */
export function openReader(s: Session, t: ResolvedTarget): BrokerReader {
  const r = createReader(t.target, { toolVersion: TOOL_VERSION });
  if (!r.ok)
    throw diag(
      r.error.diag,
      4,
      { url: t.target.url },
      { extra: [r.error.detail] },
    );
  return r.value;
}

export function readOptions(
  s: Session,
  limits: Limits,
  onEvent?: ReadOptions['onEvent'],
): ReadOptions {
  return {
    maxRps: limits.maxRps,
    concurrency: limits.concurrency,
    signal: s.io.signal,
    ...(onEvent ? { onEvent } : {}),
    ...(s.debugOn ? { onDebug: (line: string) => s.debug(line) } : {}),
  };
}

/** Nhận diện; CX1, CX2, CX3, CX8, CX9 thì exit 3. */
export async function identify(
  s: Session,
  reader: BrokerReader,
  plan: ReadPlan,
  t: ResolvedTarget,
  opts: ReadOptions,
): Promise<Identified> {
  const out = await reader.identify(plan, opts);
  if (out.status === 'aborted') throw new Interrupted('before_read');
  if (out.status === 'failed') {
    throw diag(
      out.diag,
      3,
      {
        host: t.name,
        user: t.target.user,
        version: out.detail.replace(/^RabbitMQ /, ''),
        min: BROKER_SUPPORT.minSupported,
      },
      { extra: out.diag === 'CX8' ? [] : [out.detail] },
    );
  }
  return out.identified;
}

export interface RawRead {
  readonly raw: RawResponses;
  readonly readStartedAt: Instant;
  readonly readFinishedAt: Instant;
}

/** Đọc theo kế hoạch, chưa dựng `Actual`. Ctrl-C thì `Interrupted` (exit 130). */
export async function readRaw(
  reader: BrokerReader,
  plan: ReadPlan,
  identified: Identified,
  opts: ReadOptions,
): Promise<RawRead> {
  const out = await reader.read(plan, identified, opts);
  if (out.status === 'aborted') throw new Interrupted('during_read');
  return out;
}

/** Dựng `Actual` từ một lần đọc, trong phạm vi của kế hoạch. */
export function actualOf(r: RawRead, name: string, scope: ReadScope): Actual {
  return buildActual(r.raw, {
    contextName: name,
    readStartedAt: r.readStartedAt,
    readFinishedAt: r.readFinishedAt,
    scope,
    caps: DEFAULT_CAPABILITY_TABLE,
  });
}

/** Đọc theo kế hoạch rồi dựng `Actual`. Ctrl-C thì `Interrupted` (exit 130). */
export async function readActual(
  s: Session,
  reader: BrokerReader,
  plan: ReadPlan,
  identified: Identified,
  name: string,
  opts: ReadOptions,
): Promise<Actual> {
  return actualOf(
    await readRaw(reader, plan, identified, opts),
    name,
    plan.scope,
  );
}

/**
 * `Actual` chỉ từ dữ liệu của pha nhận diện, để in dòng đầu báo cáo ngay sau
 * nhận diện mà không đoán: mọi endpoint chưa đọc là `not_attempted`.
 */
export function identifiedActual(
  identified: Identified,
  name: string,
  plan: ReadPlan,
): Actual {
  const raw: Record<string, unknown> = {};
  for (const id of ENDPOINT_IDS) raw[id] = { status: 'not_attempted' };
  Object.assign(raw, identified.raw);
  return buildActual(raw as unknown as RawResponses, {
    contextName: name,
    readStartedAt: identified.startedAt,
    readFinishedAt: identified.startedAt,
    scope: plan.scope,
    caps: DEFAULT_CAPABILITY_TABLE,
  });
}

/** User đang dùng có tag `administrator` không (OC1). */
export function isAdmin(identified: Identified): boolean {
  const w = identified.raw.whoami;
  if (w.status !== 'ok') return false;
  const body = w.pages[0]?.body as { tags?: unknown } | undefined;
  const tags = body?.tags;
  const list = Array.isArray(tags)
    ? tags
    : typeof tags === 'string'
      ? tags.split(',')
      : [];
  return list.map((x) => String(x).trim()).includes('administrator');
}

/** Tag của user đang dùng, cho dòng xác nhận của `context add`. */
export function userTags(identified: Identified): readonly string[] {
  const w = identified.raw.whoami;
  if (w.status !== 'ok') return [];
  const tags = (w.pages[0]?.body as { tags?: unknown } | undefined)?.tags;
  if (Array.isArray(tags)) return tags.map(String);
  return typeof tags === 'string' ? tags.split(',').map((x) => x.trim()) : [];
}
