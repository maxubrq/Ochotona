import {
  type Connection,
  type Observed,
  type ObjectKind,
  type ObjectRef,
  type Unknown,
  type UnknownReason,
  type Waiver,
  compareStr,
  known,
  refKey,
  stableJson,
} from '@ochotona/model';
import {
  type Exclusion,
  type RuleCode,
  type RuleMeta,
  exclusionsFor,
  rule,
  rules as ruleMetas,
} from '@ochotona/spec';
import { mergePolicyFixes } from './fix';
import {
  COLLECTION,
  type FieldPath,
  type Resolver,
  resolvePath,
} from './paths';
import { URGENCIES } from './types';
import type {
  AnyRuleDef,
  Ctx,
  Fail,
  InternalIssue,
  Params,
  RuleResult,
  Verdict,
} from './types';

export interface RunOptions {
  readonly waivers: readonly Waiver[];
  readonly scope: {
    readonly vhosts: readonly string[] | 'all';
    readonly flow: string | null;
  };
  /** `test`: vi phạm hợp đồng và ngoại lệ của luật thì ném. */
  readonly mode: 'test' | 'production';
}

export interface RunOutput {
  readonly results: readonly RuleResult[];
  readonly internal: readonly InternalIssue[];
}

/** Thứ tự luật trong `rules.json`, dùng để sắp kết quả và hành động. */
export const RULE_ORDER: ReadonlyMap<string, number> = new Map(
  ruleMetas.map((r, i) => [r.code, i]),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = any;

/** Bóc `depends_on` để lấy nguyên nhân thật và đường dẫn nguồn của nó. */
export function rootOf(u: Unknown): { reason: UnknownReason; source: string } {
  let reason = u.reason;
  let source = u.path;
  while (reason.kind === 'depends_on') {
    source = reason.path;
    reason = reason.reason;
  }
  return { reason, source };
}

function vhostOf(kind: ObjectKind, item: Item): string | null {
  switch (kind) {
    case 'exchange':
    case 'queue':
      return item.ref.vhost;
    case 'channel':
    case 'connection':
      return item.vhost;
    case 'consumer':
      return item.queue.vhost;
    default:
      return null;
  }
}

function excluded(x: Exclusion, item: Item, r: Resolver): boolean {
  const m = x.match;
  const name: string | undefined = item.ref?.name;
  if (m.nameEquals !== undefined && name !== m.nameEquals) return false;
  if (m.namePrefix !== undefined && !(name ?? '').startsWith(m.namePrefix))
    return false;
  if (m.exclusive === true && item.exclusive !== true) return false;
  if (m.sourceEquals !== undefined && item.ref?.source !== m.sourceEquals)
    return false;
  if (m.queueEquals !== undefined && item.queue?.name !== m.queueEquals)
    return false;
  if (m.hasOutgoingBindings === false) {
    // Không biết binding thì không loại trừ: luật sẽ tự ra not_checked.
    if (r.actual.bindings.state !== 'known') return false;
    if (r.index.bindingsBySource(item.ref).length > 0) return false;
  }
  return true;
}

class ContractError extends Error {}

function checkParams(meta: RuleMeta, params: Params): string | null {
  for (const [k, v] of Object.entries(params)) {
    const t = meta.params[k];
    if (t === undefined) return `param ${k} is not declared in rules.json`;
    const ok =
      t === 'number'
        ? typeof v === 'number' && Number.isFinite(v)
        : t === 'list'
          ? Array.isArray(v)
          : typeof v === 'string';
    if (!ok) return `param ${k} must be ${t}`;
  }
  return null;
}

/**
 * Chạy mọi luật đã chọn trên mọi đối tượng hợp lệ. Không bao giờ ném ở chế độ
 * `production`: lỗi của luật thành `not_checked: error` và một dòng `internal`.
 */
export function runRules(
  ctx: Ctx,
  defs: readonly AnyRuleDef[],
  opts: RunOptions,
): RunOutput {
  const results: RuleResult[] = [];
  const internal: InternalIssue[] = [];
  const conns = new Map<string, Connection>(
    ctx.actual.connections.state === 'known'
      ? ctx.actual.connections.value.map((c) => [c.ref.name, c])
      : [],
  );
  const resolver: Resolver = {
    actual: ctx.actual,
    index: ctx.index,
    connection: (n) => conns.get(n),
  };
  const today = ctx.now.slice(0, 10);
  const flowKeys =
    opts.scope.flow === null
      ? null
      : (() => {
          const m = ctx.flows.membersOf(opts.scope.flow!);
          return new Set([...m.exchanges, ...m.queues].map(refKey));
        })();

  for (const def of defs) {
    const meta = rule(def.code);
    const declared = new Set<string>([...def.requires, ...def.optional]);
    const experimental = meta.status === 'experimental';
    const kind = def.appliesTo as ObjectKind;
    const issue = (
      k: InternalIssue['kind'],
      object: ObjectRef,
      detail: string,
    ) => {
      internal.push({ kind: k, rule: def.code, object, detail });
      if (opts.mode === 'test' && k !== 'cl4_downgrade')
        throw new ContractError(`${def.code} ${refKey(object)}: ${detail}`);
    };
    const base = (object: ObjectRef) => ({
      rule: def.code,
      object,
      evidence: [],
      params: {},
      experimental,
      tolerance: ctx.flows.toleranceOf(object),
    });
    const notChecked = (
      object: ObjectRef,
      path: string,
      u: Unknown,
    ): RuleResult => {
      const { reason, source } = rootOf(u);
      return {
        ...base(object),
        result: 'not_checked',
        notChecked: { path, reason, source },
      };
    };

    // 1. Bộ sưu tập của appliesTo không biết: một not_checked cấp broker.
    const collOf = COLLECTION[kind];
    const coll: Observed<readonly Item[]> = collOf
      ? collOf(ctx.actual)
      : known([{ ref: { kind: 'broker' } }], {
          source: 'derived',
          path: 'derived:broker',
          observedAt: ctx.actual.meta.readFinishedAt,
        });
    if (coll.state === 'unknown') {
      results.push(notChecked({ kind: 'broker' }, kind, coll));
      continue;
    }

    const exclusions =
      kind === 'exchange' ||
      kind === 'queue' ||
      kind === 'binding' ||
      kind === 'consumer'
        ? exclusionsFor(kind, 'rules')
        : [];

    for (const item of coll.value) {
      const ref: ObjectRef = item.ref;
      // 2. Phạm vi và loại trừ hệ thống.
      const vh = vhostOf(kind, item);
      if (
        vh !== null &&
        opts.scope.vhosts !== 'all' &&
        !opts.scope.vhosts.includes(vh)
      )
        continue;
      if (flowKeys !== null && vh !== null) {
        const inFlow =
          kind === 'exchange' || kind === 'queue'
            ? flowKeys.has(refKey(ref))
            : ctx.flows.flowsOf(ref).includes(opts.scope.flow!);
        if (!inFlow) continue;
      }
      const x = exclusions.find((e) => excluded(e, item, resolver));
      if (x) {
        if (x.rulesOutcome === 'not_applicable_with_note')
          results.push({
            ...base(ref),
            result: 'not_applicable',
            note: `exclusion.${x.id}`,
          });
        continue;
      }

      // 3. requires: đường dẫn unknown đầu tiên thắng.
      const values = new Map<FieldPath, Observed<unknown>>();
      let missing: { path: FieldPath; u: Unknown } | null = null;
      for (const p of def.requires) {
        const v = resolvePath(p, kind, item, resolver);
        if (v.state === 'unknown') {
          missing = { path: p, u: v };
          break;
        }
        values.set(p, v);
      }
      if (missing) {
        results.push(notChecked(ref, missing.path, missing.u));
        continue;
      }
      for (const p of def.optional)
        values.set(p, resolvePath(p, kind, item, resolver));

      const view: Record<string, unknown> = {
        ref,
        prov: (p: FieldPath) => {
          const v = values.get(p);
          return v?.state === 'known' ? v.prov : undefined;
        },
      };
      for (const p of def.requires)
        view[p] = (values.get(p) as { value: unknown }).value;
      for (const p of def.optional) view[p] = values.get(p);

      // 4. evaluate.
      let verdicts: readonly Verdict[];
      try {
        const v = def.evaluate(view as never, ctx);
        verdicts = Array.isArray(v) ? v : [v as Verdict];
      } catch (e) {
        if (e instanceof ContractError || opts.mode === 'test') throw e;
        const message = e instanceof Error ? e.message : String(e);
        internal.push({
          kind: 'exception',
          rule: def.code,
          object: ref,
          detail: message,
        });
        results.push({
          ...base(ref),
          result: 'not_checked',
          notChecked: {
            path: def.code,
            reason: { kind: 'error', message },
            source: 'rule',
          },
        });
        continue;
      }

      for (const v of verdicts) {
        switch (v.result) {
          case 'pass':
            results.push({
              ...base(ref),
              result: 'pass',
              ...(v.note ? { note: v.note } : {}),
            });
            break;
          case 'not_applicable':
            results.push({
              ...base(ref),
              result: 'not_applicable',
              ...(v.note ? { note: v.note } : {}),
            });
            break;
          case 'not_checked':
            results.push({
              ...base(ref),
              result: 'not_checked',
              notChecked: { path: v.path, reason: v.reason, source: v.source },
            });
            break;
          case 'needs': {
            const o = values.get(v.path);
            if (
              !def.optional.includes(v.path) ||
              o === undefined ||
              o.state === 'known'
            ) {
              issue(
                'contract',
                ref,
                `needs ${v.path}, which is not an unknown optional field`,
              );
              results.push(
                notChecked(ref, v.path, {
                  state: 'unknown',
                  reason: { kind: 'error', message: `needs ${v.path}` },
                  source: 'derived',
                  path: v.path,
                }),
              );
              break;
            }
            results.push(notChecked(ref, v.path, o));
            break;
          }
          case 'fail':
            results.push(finishFail(v, ref));
            break;
          default:
            issue('contract', ref, `unknown verdict ${JSON.stringify(v)}`);
        }
      }
    }

    // 5, 6. Miễn trừ và hợp đồng của kết quả fail.
    function finishFail(v: Fail, ref: ObjectRef): RuleResult {
      let severity = v.severity;
      if (!meta.severities.includes(severity))
        issue('contract', ref, `severity ${severity} is not in rules.json`);
      const bad = checkParams(meta, v.params);
      if (bad) issue('contract', ref, bad);
      if (!URGENCIES.includes(v.urgency))
        issue('contract', ref, `urgency ${String(v.urgency)} is not known`);
      // Bằng chứng chỉ được trỏ tới trường luật đã khai: đó là thứ được đọc.
      for (const e of v.evidence)
        if (!declared.has(e.path))
          issue('contract', ref, `evidence path ${e.path} is not declared`);
      const tolerance = ctx.flows.toleranceOf(ref);
      if (
        severity === 'S1' &&
        tolerance !== 'strict' &&
        !v.evidence.some((e) => e.kind === 'observed')
      ) {
        if (opts.mode === 'test')
          throw new ContractError(
            `${def.code} ${refKey(ref)}: CL4: S1 without observed evidence on a ${tolerance} object`,
          );
        issue(
          'cl4_downgrade',
          ref,
          'S1 without observed evidence; downgraded to S3',
        );
        severity = 'S3';
      }
      const key = refKey(ref);
      const waiver = opts.waivers.find(
        (w) =>
          w.rule === def.code && refKey(w.object) === key && w.until >= today,
      );
      return {
        ...base(ref),
        result: 'fail',
        severity,
        urgency: v.urgency,
        ...(v.variant ? { variant: v.variant } : {}),
        evidence: v.evidence,
        params: v.params,
        ...(v.fix ? { fix: v.fix } : {}),
        ...(waiver ? { waiver } : {}),
      };
    }
  }

  return { results: mergePolicyFixes(sortResults(results)), internal };
}

const RESULT_RANK = {
  fail: 0,
  not_checked: 1,
  pass: 2,
  not_applicable: 3,
} as const;

/** Fail trước theo S1 đến S5, rồi thứ tự luật trong `rules.json`, rồi `refKey`, rồi params. */
export function sortResults(rs: readonly RuleResult[]): RuleResult[] {
  const keyed = rs.map((r) => ({
    r,
    sev: r.result === 'fail' ? Number(r.severity!.slice(1)) : 9,
    order: RULE_ORDER.get(r.rule) ?? 999,
    ref: refKey(r.object),
    params: stableJson(r.params as never),
  }));
  keyed.sort(
    (a, b) =>
      a.sev - b.sev ||
      a.order - b.order ||
      compareStr(a.ref, b.ref) ||
      RESULT_RANK[a.r.result] - RESULT_RANK[b.r.result] ||
      compareStr(a.r.variant ?? '', b.r.variant ?? '') ||
      compareStr(a.params, b.params),
  );
  return keyed.map((k) => k.r);
}

export function ruleOrder(code: RuleCode): number {
  return RULE_ORDER.get(code) ?? 999;
}
