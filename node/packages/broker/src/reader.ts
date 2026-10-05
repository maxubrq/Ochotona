import type {
  EndpointId,
  EndpointRead,
  Instant,
  RawResponses,
  RawResult,
  ReadPlan,
  Result,
  Totals,
} from '@ochotona/model';
import { capabilitiesFor, parseVersion } from '@ochotona/spec';
import type { CapabilityLookup, Version } from '@ochotona/spec';
import type { Dispatcher } from 'undici';
import { safeEmitter, type ReadEvent, type Sources } from './events';
import type { Counters, FetchCtx } from './fetch';
import {
  PAGE_SIZE,
  readEndpoint,
  type Page,
  type PaginateCtx,
} from './paginate';
import { fetchPrometheus } from './prometheus';
import type { RawFailure } from './retry';
import {
  detectSources,
  nodeCountOf,
  totalsOf,
  versionStringOf,
  vhostNamesOf,
} from './sources';
import {
  normalizeUrl,
  prometheusUrl,
  tlsOptions,
  type BrokerTarget,
  type TargetError,
} from './target';
import { Throttle } from './throttle';
import {
  AbortedError,
  createDispatcher,
  createTransport,
  getOnly,
} from './transport';

export interface ReaderDeps {
  /** Cho `User-Agent`. */
  readonly toolVersion: string;
  readonly clock?: () => Instant;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Jitter của backoff. */
  readonly random?: () => number;
  /** Chỉ dùng trong test. */
  readonly dispatcher?: Dispatcher;
}

export interface ReadOptions {
  /** 1–20, mặc định 5. */
  readonly maxRps?: number;
  /** 1–4, mặc định 2. */
  readonly concurrency?: number;
  readonly signal?: AbortSignal;
  readonly onEvent?: (e: ReadEvent) => void;
  /** Một dòng mỗi request, cho `--debug`. Không bao giờ chứa header hay mật khẩu. */
  readonly onDebug?: (line: string) => void;
}

export interface BrokerReader {
  identify(plan: ReadPlan, opts?: ReadOptions): Promise<IdentifyOutcome>;
  read(
    plan: ReadPlan,
    identified: Identified,
    opts?: ReadOptions,
  ): Promise<ReadOutcome>;
  stats(): { requests: number; retries: number; bytes: number; rpsNow: number };
  close(): Promise<void>;
}

export type IdentifyDiag = 'CX1' | 'CX2' | 'CX3' | 'CX8' | 'CX9';

export type IdentifyOutcome =
  | { status: 'ok'; identified: Identified }
  | { status: 'failed'; diag: IdentifyDiag; detail: string }
  | { status: 'aborted' };

export interface Identified {
  readonly raw: Pick<
    RawResponses,
    'overview' | 'whoami' | 'featureFlags' | 'nodes' | 'prometheus'
  >;
  readonly sources: Sources;
  readonly version: Version | null;
  /** `null` khi overview không có phiên bản đọc được. */
  readonly capability: CapabilityLookup | null;
  readonly totals: Totals | null;
  readonly estimate: { requests: number; seconds: number };
  readonly startedAt: Instant;
}

export type ReadOutcome =
  | {
      status: 'complete';
      raw: RawResponses;
      readStartedAt: Instant;
      readFinishedAt: Instant;
    }
  | { status: 'aborted'; pagesRead: number; pagesTotal: number };

export const DEFAULT_MAX_RPS = 5;
export const DEFAULT_CONCURRENCY = 2;
/** Binding và consumer đọc theo từng vhost khi broker có không quá ngần này vhost. */
export const SPLIT_VHOST_LIMIT = 20;

/** Ba nhóm của pha kiểm kê; nhóm sau chỉ bắt đầu khi nhóm trước xong. */
const GROUPS: readonly (readonly EndpointId[])[] = [
  ['vhosts', 'users', 'policies', 'operatorPolicies', 'deprecatedUsed'],
  ['exchanges', 'queues', 'bindings'],
  ['connections', 'channels', 'consumers'],
];

const TOTAL_OF: Partial<Record<EndpointId, keyof Totals>> = {
  queues: 'queues',
  exchanges: 'exchanges',
  connections: 'connections',
  channels: 'channels',
};

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortedError());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new AbortedError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function checkLimits(opts: ReadOptions): {
  maxRps: number;
  concurrency: number;
} {
  const maxRps = opts.maxRps ?? DEFAULT_MAX_RPS;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  if (!(maxRps >= 1 && maxRps <= 20)) {
    throw new RangeError(
      `@ochotona/broker: maxRps must be 1–20, got ${maxRps}`,
    );
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new RangeError(
      `@ochotona/broker: concurrency must be 1–4, got ${concurrency}`,
    );
  }
  return { maxRps, concurrency };
}

function diagOf(raw: RawFailure): Exclude<IdentifyDiag, 'CX8'> {
  if (raw.status === 'network_error') return raw.kind === 'tls' ? 'CX2' : 'CX1';
  if (raw.status === 'http_error') {
    if (raw.code === 401) return 'CX3';
    if (raw.code === 403) return 'CX9';
  }
  return 'CX1';
}

function detailOf(raw: RawFailure): string {
  switch (raw.status) {
    case 'network_error':
      return raw.message;
    case 'http_error':
      return raw.note ? `HTTP ${raw.code} (${raw.note})` : `HTTP ${raw.code}`;
    case 'not_attempted':
      return 'not attempted';
  }
}

function toRaw(
  o: { ok: true; pages: readonly Page[] } | { ok: false; raw: RawFailure },
): RawResult {
  return o.ok ? { status: 'ok', pages: o.pages } : o.raw;
}

/**
 * Ước tính số request và thời gian của pha kiểm kê và pha đóng.
 * @example estimateRead(plan, { queues: 10_000, … }, 5) // { requests: 26, seconds: 7 }
 */
export function estimateRead(
  plan: ReadPlan,
  totals: Totals | null,
  maxRps: number,
  capability: CapabilityLookup | null = null,
): { requests: number; seconds: number } {
  const reads = new Map<EndpointId, EndpointRead[]>();
  for (const r of plan.inventory) {
    if (r.requiresCapability && !capable(capability, r.requiresCapability))
      continue;
    reads.set(r.id, [...(reads.get(r.id) ?? []), r]);
  }
  let requests = (plan.totalsAtEnd ?? true) ? 1 : 0; // pha đóng
  for (const [id, rs] of reads) {
    if (rs[0].paginated) {
      const key = TOTAL_OF[id];
      const total = key && totals ? totals[key] : null;
      requests += Math.max(
        rs.length,
        total === null ? 0 : Math.ceil(total / PAGE_SIZE),
      );
    } else {
      requests += rs.length;
    }
  }
  return { requests, seconds: Math.ceil((requests / maxRps) * 1.2) };
}

function capable(
  capability: CapabilityLookup | null,
  name: 'deprecatedFeaturesUsed',
): boolean {
  // Không biết phiên bản thì vẫn thử; 404 sẽ thành endpoint_missing.
  if (capability === null || capability.status === 'unsupported') return true;
  return capability.caps.endpoints[name];
}

/**
 * Tạo reader cho một broker. Chỉ trả lỗi khi URL bị từ chối (CX4, CX10);
 * không gửi request nào.
 */
export function createReader(
  target: BrokerTarget,
  deps: ReaderDeps,
): Result<BrokerReader, TargetError> {
  const url = normalizeUrl(target.url);
  if (!url.ok) return url;
  const promUrl = prometheusUrl(url.value, target.prometheus);
  if (!promUrl.ok) return promUrl;
  const root = url.value.root;
  const prom = promUrl.value;

  const clock = deps.clock ?? (() => new Date().toISOString() as Instant);
  const nowMs = () => Date.parse(clock());
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;

  const owned = deps.dispatcher
    ? null
    : createDispatcher({
        tls: tlsOptions(target.tls),
        connectMs: target.timeouts?.connectMs ?? 5000,
        // Đủ cho concurrency tối đa (4) + 1.
        connections: 5,
      });
  const dispatcher = (deps.dispatcher ?? owned!).compose(getOnly);
  const transport = createTransport({
    dispatcher,
    user: target.user,
    password: target.password,
    userAgent: `ochotona/${deps.toolVersion} (read-only)`,
    requestMs: target.timeouts?.requestMs ?? 15_000,
    nowMs,
  });

  // Thay origin, host và (phòng xa) mật khẩu trong mọi chuỗi rời gói.
  const label = target.name ?? 'broker';
  const secrets = [
    target.password.length >= 3 ? target.password : null,
    Buffer.from(`${target.user}:${target.password}`).toString('base64'),
  ].filter((s): s is string => s !== null);
  const origins = [
    root,
    url.value.origin,
    prom ? new URL(prom).origin : null,
    url.value.hostname,
  ]
    .filter((s): s is string => !!s)
    .sort((a, b) => b.length - a.length);
  const redact = (s: string): string => {
    let out = s;
    for (const x of secrets) out = out.split(x).join('***');
    for (const o of origins) out = out.split(o).join(`<${label}>`);
    return out;
  };

  const counters: Counters = { requests: 0, retries: 0, bytes: 0 };
  let emit: (e: ReadEvent) => void = () => {};
  let warnedSlow = false;
  const throttle = new Throttle(DEFAULT_MAX_RPS, DEFAULT_CONCURRENCY, {
    nowMs,
    sleep,
    onRate: (rps) => {
      emit({ type: 'throttle', rps });
      if (rps === 1 && !warnedSlow) {
        warnedSlow = true;
        emit({
          type: 'warning',
          code: 'slow_broker',
          detail:
            'broker responds slowly; request rate lowered to 1 per second',
        });
      }
    },
    onPause: (ms) =>
      emit({ type: 'warning', code: 'retry_after', detail: `paused ${ms} ms` }),
  });
  let closed = false;

  function begin(opts: ReadOptions): PaginateCtx & { pages: { n: number } } {
    if (closed) throw new Error('@ochotona/broker: reader is closed');
    const limits = checkLimits(opts);
    throttle.setLimits(limits.maxRps, limits.concurrency);
    emit = safeEmitter(opts.onEvent);
    const debugCb = safeEmitter(opts.onDebug);
    const pages = { n: 0 };
    const ctx: FetchCtx = {
      transport,
      throttle,
      nowMs,
      sleep,
      random,
      signal: opts.signal,
      redact,
      emit: (e) => emit(e),
      debug: (line) => debugCb(redact(line)),
      counters,
    };
    return { ...ctx, root, clock, onPage: () => pages.n++, pages };
  }

  async function identify(
    plan: ReadPlan,
    opts: ReadOptions = {},
  ): Promise<IdentifyOutcome> {
    const ctx = begin(opts);
    try {
      const startedAt = clock();
      ctx.emit({ type: 'phase', phase: 'identify', at: startedAt });
      const reads = plan.identify.map((r) =>
        readEndpoint(ctx, r, r.segments, null),
      );
      const promise: Promise<RawResult<string>> =
        plan.prometheus && prom !== null
          ? fetchPrometheus(ctx, prom)
          : Promise.resolve({ status: 'not_attempted', reason: 'off' });
      const [outcomes, prometheus] = await Promise.all([
        Promise.all(reads),
        promise,
      ]);
      const byId = new Map<EndpointId, RawResult>();
      plan.identify.forEach((r, i) => byId.set(r.id, toRaw(outcomes[i])));
      const get = (id: EndpointId): RawResult =>
        byId.get(id) ?? { status: 'not_attempted' };
      const overview = get('overview');
      if (overview.status !== 'ok') {
        const failure = overview as RawFailure;
        return {
          status: 'failed',
          diag: diagOf(failure),
          detail: detailOf(failure),
        };
      }
      const versionText = versionStringOf(overview);
      const version = versionText === null ? null : parseVersion(versionText);
      const capability = version === null ? null : capabilitiesFor(version);
      if (capability?.status === 'unsupported') {
        return {
          status: 'failed',
          diag: 'CX8',
          detail: `RabbitMQ ${versionText}`,
        };
      }
      const raw = {
        overview,
        whoami: get('whoami'),
        featureFlags: get('featureFlags'),
        nodes: get('nodes'),
        prometheus,
      };
      const sources = detectSources(overview, prometheus);
      const totals = totalsOf(overview);
      const { maxRps } = checkLimits(opts);
      const estimate = estimateRead(plan, totals, maxRps, capability);
      ctx.emit({
        type: 'identified',
        version: versionText,
        nodes: nodeCountOf(raw.nodes),
        totals,
        sources,
      });
      ctx.emit({ type: 'estimate', ...estimate });
      return {
        status: 'ok',
        identified: {
          raw,
          sources,
          version,
          capability,
          totals,
          estimate,
          startedAt,
        },
      };
    } catch (e) {
      if (e instanceof AbortedError) return { status: 'aborted' };
      throw e;
    }
  }

  async function read(
    plan: ReadPlan,
    identified: Identified,
    opts: ReadOptions = {},
  ): Promise<ReadOutcome> {
    const ctx = begin(opts);
    try {
      ctx.emit({ type: 'phase', phase: 'inventory', at: clock() });
      const results = new Map<EndpointId, RawResult>();
      let vhostNames: string[] | null = null;

      for (const group of GROUPS) {
        const reads = plan.inventory.filter((r) => group.includes(r.id));
        const jobs = reads.map(async (r): Promise<RawResult> => {
          if (
            r.requiresCapability &&
            !capable(identified.capability, r.requiresCapability)
          ) {
            return { status: 'not_attempted', reason: 'capability' };
          }
          const total = (() => {
            const key = TOTAL_OF[r.id];
            return key && identified.totals ? identified.totals[key] : null;
          })();
          const split =
            r.splitByVhost &&
            plan.scope.vhosts === 'all' &&
            vhostNames !== null &&
            vhostNames.length > 0 &&
            vhostNames.length <= SPLIT_VHOST_LIMIT;
          if (!split)
            return toRaw(await readEndpoint(ctx, r, r.segments, total));
          const pages: Page[] = [];
          for (const v of vhostNames!) {
            const o = await readEndpoint(ctx, r, [...r.segments, v], total);
            if (!o.ok) return o.raw;
            pages.push(...o.pages);
          }
          return { status: 'ok', pages };
        });
        const outcomes = await Promise.all(jobs);
        // Nhiều lần đọc cùng một endpoint (theo vhost) ghép thành một kết quả;
        // một lần hỏng là cả endpoint hỏng.
        reads.forEach((r, i) => {
          const o = outcomes[i];
          const prev = results.get(r.id);
          if (prev === undefined) results.set(r.id, o);
          else if (prev.status === 'ok' && o.status === 'ok') {
            results.set(r.id, {
              status: 'ok',
              pages: [...prev.pages, ...o.pages],
            });
          } else if (prev.status === 'ok') results.set(r.id, o);
        });
        const vh = results.get('vhosts');
        if (vh?.status === 'ok') vhostNames = vhostNamesOf(vh.pages[0]?.body);
      }

      ctx.emit({ type: 'phase', phase: 'close', at: clock() });
      const closing = plan.totalsAtEnd ?? true;
      const overviewRead = plan.identify.find((r) => r.id === 'overview') ?? {
        id: 'overview' as const,
        segments: ['overview'],
        paginated: false,
        columns: null,
        query: {},
      };
      const end: RawResult = closing
        ? toRaw(
            await readEndpoint(
              ctx,
              { ...overviewRead, id: 'totalsAtEnd' },
              overviewRead.segments,
              null,
            ),
          )
        : { status: 'not_attempted' };
      const readFinishedAt = clock();

      const inv = (id: EndpointId): RawResult =>
        results.get(id) ?? { status: 'not_attempted' };
      const raw: RawResponses = {
        ...identified.raw,
        vhosts: inv('vhosts'),
        deprecatedUsed: inv('deprecatedUsed'),
        exchanges: inv('exchanges'),
        queues: inv('queues'),
        bindings: inv('bindings'),
        policies: inv('policies'),
        operatorPolicies: inv('operatorPolicies'),
        connections: inv('connections'),
        channels: inv('channels'),
        consumers: inv('consumers'),
        totalsAtEnd: end,
        // Chỉ có khi kế hoạch đọc /api/users (CLI chạy bằng user quản trị).
        ...(results.has('users') ? { users: inv('users') } : {}),
      };
      return {
        status: 'complete',
        raw,
        readStartedAt: identified.startedAt,
        readFinishedAt,
      };
    } catch (e) {
      if (e instanceof AbortedError) {
        return {
          status: 'aborted',
          pagesRead: ctx.pages.n,
          pagesTotal: identified.estimate.requests,
        };
      }
      throw e;
    }
  }

  return {
    ok: true,
    value: {
      identify,
      read,
      stats: () => ({ ...counters, rpsNow: throttle.rps }),
      async close() {
        if (closed) return;
        closed = true;
        await owned?.destroy();
      },
    },
  };
}
