// `ocho explain <đích>`: mã luật, mã điểm mù, mã chẩn đoán (không cần mạng);
// `queue|exchange|flow <tên>` hoặc tên trơn (đọc broker). Đích phân giải theo
// thứ tự, dừng ở dạng đầu tiên khớp.

import {
  type Actual,
  type Desired,
  type EndpointId,
  type Exchange,
  type Instant,
  type ObjectRef,
  type Policy,
  type Queue,
  type RawResponses,
  type RawResult,
  type ReadPlan,
  type ReadScope,
  type Unknown,
  matchingPolicies,
  planRead,
  refKey,
  refLabel,
  rootReason,
  stableJson,
} from '@ochotona/model';
import {
  type RuleResult,
  makeCtx,
  ruleExamples,
  runRules,
  selectRules,
  toFinding,
} from '@ochotona/rules';
import {
  type I18nKey,
  type RuleCode,
  blindSpots,
  codeEntry,
  docsUrl,
  format,
  hasMessage,
  rule,
  rules as ruleMetas,
} from '@ochotona/spec';
import { str } from '../args';
import {
  type RawRead,
  actualOf,
  identify,
  limitsOf,
  openReader,
  readOptions,
  readRaw,
} from '../connect';
import { readContexts } from '../contexts';
import { type ExitCode, usage } from '../errors';
import { fmtNumber } from '../i18n';
import { findOchoFile, loadDesired } from '../ocho-yaml';
import { SPEC_MAJOR_MINOR, writeJson } from '../render/json';
import { ascii, labelBlock, labelWidth, table } from '../render/layout';
import { displayResult } from '../report';
import type { Session } from '../session';
import { resolveTarget } from '../target';
import { TOOL_VERSION } from '../version';

const OBJECT_KINDS = ['queue', 'exchange', 'flow'] as const;
type ObjectKind = (typeof OBJECT_KINDS)[number];

function print(s: Session, lines: readonly string[]): void {
  s.io.stdout.write(lines.map((l) => `${l}\n`).join(''));
}

/**
 * Khuôn câu của spec với tham số thay bằng `<tên>`, để in ví dụ không cần dữ
 * liệu. Khuôn có số nhiều (cần số) thì trả `null`.
 */
function templateText(
  s: Session,
  key: string,
  known: Readonly<Record<string, string>> = {},
): string | null {
  if (!hasMessage(key)) return null;
  const params = new Proxy({} as Record<string, string>, {
    get: (_, k) => known[String(k)] ?? `<${String(k)}>`,
  });
  try {
    return format(s.lang, key as I18nKey, params);
  } catch {
    return null;
  }
}

function labelled(
  s: Session,
  rows: readonly (readonly [string, string | null | undefined])[],
): string[] {
  const kept = rows.filter((r): r is readonly [string, string] => !!r[1]);
  const labels = kept.map(([k]) => s.t(`explain.label.${k}`));
  return labelBlock(
    kept.map(([, v], i) => [labels[i], v.split('\n')] as const),
    { indent: 0, labelWidth: labelWidth(labels), width: s.width },
  );
}

// ------------------------------------------------------------- mã (không mạng)

function explainRule(s: Session, code: RuleCode): ExitCode {
  const meta = rule(code);
  const title = format(s.lang, `rule.${code}.title` as I18nKey, {});
  // Vị từ nhận ngưỡng của luật (`rules.json`), in theo số của ngôn ngữ.
  const thresholds = Object.fromEntries(
    Object.entries(meta.thresholds ?? {}).map(([k, v]) => [
      k,
      fmtNumber(s.lang, v),
    ]),
  );
  const predicate = templateText(s, `rule.${code}.predicate`, thresholds);
  const examples = ruleExamples(code);
  const mechanism = templateText(s, `rule.${code}.mechanism`) ?? '';
  const next = templateText(s, `rule.${code}.next`);
  const specUrl = docsUrl('spec', code, {
    toolVersion: TOOL_VERSION,
    specVersion: SPEC_MAJOR_MINOR,
  });
  if (s.json) {
    writeJson(s, {
      schema: 'ocho.explain/1',
      kind: 'rule',
      id: code,
      rule: {
        code,
        title,
        severities: [...meta.severities],
        ...(predicate ? { predicate } : {}),
        mechanism,
        ...(next ? { next } : {}),
        fix: meta.fix,
        specRef: meta.specRef,
        lessonRefs: [...meta.lessonRefs],
        status: meta.status,
        ...(examples.length ? { examples } : {}),
      },
    });
    return 0;
  }
  // `fail  exchange orders → fail S3 at_risk  (no alternate exchange, …)`
  const exampleText = examples
    .map((e) => {
      const outcome = [e.result, e.severity, e.variant]
        .filter(Boolean)
        .join(' ');
      return `${e.kind.padEnd(4)}  ${ascii(e.object)} → ${outcome}  (${e.title})`;
    })
    .join('\n');
  print(s, [
    `${code}  ${title}`,
    '',
    ...labelled(s, [
      ['severities', meta.severities.join(', ')],
      ['predicate', predicate],
      ['mechanism', mechanism],
      ['next', next],
      ['fix', meta.fix],
      ['spec', `${meta.specRef}\n${specUrl}`],
      ['lesson', meta.lessonRefs.join(', ') || null],
      [
        'status',
        `${meta.status}${meta.targetVersionOnly ? ' (--target-version)' : ''}`,
      ],
      ['examples', exampleText || null],
    ]),
  ]);
  return 0;
}

function explainBlindSpot(
  s: Session,
  b: (typeof blindSpots)[number],
): ExitCode {
  if (s.json) {
    writeJson(s, {
      schema: 'ocho.explain/1',
      kind: 'blind_spot',
      id: b.id,
      blindSpot: {
        id: b.id,
        name: b.name,
        caughtBy: b.caughtBy,
        rules: [...b.rules],
        ...(b.plannedIn ? { plannedIn: b.plannedIn } : {}),
      },
    });
    return 0;
  }
  print(s, [
    `${b.id}  ${b.name}`,
    '',
    ...labelled(s, [
      ['caught_by', s.t(`explain.caught_by.${b.caughtBy}`)],
      ['rules', b.rules.join(', ') || null],
      ['planned_in', b.plannedIn ?? null],
    ]),
  ]);
  return 0;
}

function explainCode(
  s: Session,
  e: NonNullable<ReturnType<typeof codeEntry>>,
): ExitCode {
  const message = templateText(s, `diag.${e.code}.message`);
  const next = templateText(s, `diag.${e.code}.next`);
  if (s.json) {
    writeJson(s, {
      schema: 'ocho.explain/1',
      kind: 'code',
      id: e.code,
      code: {
        code: e.code,
        kind: e.kind,
        meaning: e.meaning,
        status: e.status,
        ...(message ? { message } : {}),
        ...(next ? { next } : {}),
      },
    });
    return 0;
  }
  print(s, [
    `${e.code}  ${e.meaning}`,
    '',
    ...labelled(s, [
      ['kind', e.kind],
      ['message', message],
      ['next', next],
      ['status', e.status],
    ]),
  ]);
  return 0;
}

// ------------------------------------------------------------- đối tượng (broker)

interface Loaded {
  readonly actual: Actual;
  readonly desired: Desired | null;
  readonly results: readonly RuleResult[];
}

/** Điều cần đọc: một đối tượng (`either`: tên trơn, queue hoặc exchange), hay cả vhost của một luồng. */
type Want =
  | { readonly kind: 'queue' | 'exchange' | 'either'; readonly name: string }
  | { readonly kind: 'vhost' };

const items = (r: RawResult): unknown[] =>
  r.status === 'ok' ? r.pages.flatMap((p) => p.body as unknown[]) : [];

/** Ghép thêm trang của `extra` vào các endpoint `ids` của `base`. */
function mergeRaw(base: RawRead, extra: RawRead, ids: EndpointId[]): RawRead {
  const raw = { ...base.raw } as Record<string, RawResult>;
  for (const id of ids) {
    const a = raw[id];
    const b = extra.raw[id] as RawResult | undefined;
    if (a.status === 'ok' && b?.status === 'ok')
      raw[id] = { status: 'ok', pages: [...a.pages, ...b.pages] };
  }
  return {
    raw: raw as unknown as RawResponses,
    readStartedAt: base.readStartedAt,
    readFinishedAt: extra.readFinishedAt,
  };
}

/** `alternate-exchange` của exchange vừa đọc, theo tham số rồi policy. */
function alternateOf(actual: Actual, name: string): string | null {
  const x = known<Exchange>(actual.exchanges).find((e) => e.ref.name === name);
  if (!x || x.effective.state !== 'known') return null;
  const ae = x.effective.value['alternate-exchange'];
  return ae && typeof ae.value === 'string' && ae.value !== name
    ? ae.value
    : null;
}

async function load(
  s: Session,
  vhostOf: string | ((d: Desired) => string),
  want: Want,
): Promise<Loaded & { readonly kind?: 'queue' | 'exchange' }> {
  const now = new Date(s.io.clock()).toISOString() as Instant;
  const file = await findOchoFile(s);
  if (want.kind === 'vhost' && !file) throw usage('explain.flow_needs_file');
  const desired = file ? await loadDesired(s, file, now) : null;
  const vhost =
    typeof vhostOf === 'string' ? vhostOf : vhostOf(desired as Desired);
  const contexts = await readContexts(s.io, (e) => s.warn(e));
  const target = await resolveTarget(s, contexts.data);
  const reader = openReader(s, target);
  const limits = limitsOf(s);
  const objectPlan = (kind: 'queue' | 'exchange', name: string) =>
    planRead({ scope: { vhosts: [vhost], object: { kind, name } } });
  let kind: 'queue' | 'exchange' | undefined;
  let read: RawRead;
  let scope: ReadScope;
  try {
    const opts = readOptions(s, limits);
    if (want.kind === 'vhost') {
      // Luồng gồm nhiều đối tượng: cả vhost, không Prometheus.
      const plan = planRead({
        requires: new Set([
          'vhosts',
          'policies',
          'operatorPolicies',
          'exchanges',
          'queues',
          'bindings',
        ] as const),
        prometheus: false,
        scope: { vhosts: [vhost] },
      });
      const identified = await identify(s, reader, plan, target, opts);
      read = await readRaw(reader, plan, identified, opts);
      scope = plan.scope;
    } else {
      // Một đối tượng: policy, operator policy, đối tượng, binding (K5).
      // Tên trơn đọc thêm exchange cùng tên để biết tên có mơ hồ không.
      const first = want.kind === 'exchange' ? 'exchange' : 'queue';
      const base = objectPlan(first, want.name);
      const plan: ReadPlan =
        want.kind === 'either'
          ? {
              ...base,
              inventory: [
                ...base.inventory,
                objectPlan('exchange', want.name).inventory.find(
                  (r) => r.id === 'exchanges',
                )!,
              ],
            }
          : base;
      const identified = await identify(s, reader, plan, target, opts);
      read = await readRaw(reader, plan, identified, opts);
      scope = plan.scope;
      kind = first;
      if (want.kind === 'either') {
        const q = items(read.raw.queues).length > 0;
        const x = items(read.raw.exchanges).length > 0;
        if (q && x)
          throw usage('explain.ambiguous', { name: want.name, vhost });
        if (!q && !x)
          throw usage('explain.not_found_any', { name: want.name, vhost });
        if (!q) {
          const xp = objectPlan('exchange', want.name);
          read = await readRaw(reader, xp, identified, opts);
          scope = xp.scope;
          kind = 'exchange';
        }
      }
      // T2 cần alternate exchange và binding đi ra của nó: đọc thêm hai request.
      const ae =
        kind === 'exchange'
          ? alternateOf(actualOf(read, target.name, scope), want.name)
          : null;
      if (ae !== null) {
        const ap = objectPlan('exchange', ae);
        const extra = await readRaw(
          reader,
          {
            ...ap,
            inventory: ap.inventory.filter(
              (r) => r.id === 'exchanges' || r.id === 'bindings',
            ),
          },
          identified,
          opts,
        );
        read = mergeRaw(read, extra, ['exchanges', 'bindings']);
      }
    }
    s.debug(`requests: ${reader.stats().requests}`);
  } finally {
    await reader.close();
  }
  const actual = actualOf(read, target.name, scope);
  const rules = selectRules({
    targetVersion: false,
    includeExperimental: false,
  });
  const ctx = makeCtx({ actual, desired, now });
  const { results } = runRules(ctx, rules, {
    waivers: desired?.waivers ?? [],
    scope: { vhosts: [vhost], flow: null },
    mode: 'production',
  });
  return { actual, desired, results, ...(kind ? { kind } : {}) };
}

const known = <T>(o: { state: string; value?: readonly T[] }): readonly T[] =>
  o.state === 'known' ? (o.value as readonly T[]) : [];

function show(v: unknown): string {
  if (typeof v === 'string') return v;
  return stableJson(v as never);
}

function reasonText(s: Session, u: Unknown): string {
  const r = rootReason(u);
  const params: Record<string, string | number> = {
    path: u.path,
    source: u.path,
  };
  for (const [k, v] of Object.entries(r))
    if (k !== 'kind')
      params[k] = Array.isArray(v)
        ? v.join(', ')
        : typeof v === 'object'
          ? JSON.stringify(v)
          : (v as string | number);
  return format(s.lang, `reason.${r.kind}` as I18nKey, params);
}

function resultsFor(results: readonly RuleResult[], ref: ObjectRef) {
  const k = refKey(ref);
  return results.filter((r) => refKey(r.object) === k).map(displayResult);
}

function explainObject(
  s: Session,
  o: Queue | Exchange,
  loaded: Loaded,
): ExitCode {
  const { actual } = loaded;
  const isQueue = o.ref.kind === 'queue';
  const flows = makeCtx({
    actual,
    desired: loaded.desired,
    now: actual.meta.readFinishedAt,
  }).flows;
  const flowNames = flows.flowsOf(o.ref);
  const tolerance = flows.toleranceOf(o.ref);
  const results = resultsFor(loaded.results, o.ref);
  const fails = results.filter((r) => r.result === 'fail');

  const rows: {
    key: string;
    value: unknown;
    layer: string;
    by: string | null;
    runtime: boolean;
    overridden: unknown[];
    rules: string[];
  }[] = [];
  if (o.effective.state === 'known') {
    for (const key of Object.keys(o.effective.value).sort()) {
      const e = o.effective.value[key];
      const rules = fails
        .filter((r) => r.fix?.set && key in r.fix.set)
        .map((r) => `${r.rule} ${r.severity}`);
      rows.push({
        key,
        value: e.value,
        layer: e.layer,
        by: e.by,
        runtime: e.layer !== 'argument',
        overridden: [...e.overridden],
        rules,
      });
    }
  }

  const policyList = (ps: readonly Policy[], applied: string | null) => {
    const m = matchingPolicies(
      { ref: o.ref, ...(isQueue ? { queueType: (o as Queue).type } : {}) },
      ps,
    );
    return m.ok
      ? m.policies.map((p) => ({
          name: p.ref.name,
          kind: p.ref.kind,
          priority: p.priority,
          applied: p.ref.name === applied,
        }))
      : [];
  };
  const appliedOf = (x: { state: string; value?: string | null }) =>
    x.state === 'known' ? (x.value ?? null) : null;
  const policies = [
    ...policyList(known<Policy>(actual.policies), appliedOf(o.appliedPolicy)),
    ...(isQueue
      ? policyList(
          known<Policy>(actual.operatorPolicies),
          appliedOf((o as Queue).appliedOperatorPolicy),
        )
      : []),
  ];
  const mismatch =
    o.effective.state === 'unknown' &&
    rootReason(o.effective).kind === 'model_mismatch';
  const brokerCheck = mismatch
    ? 'disagrees'
    : o.effectiveCheck === 'verified'
      ? 'agrees'
      : 'unverified';

  if (s.json) {
    writeJson(s, {
      schema: 'ocho.explain/1',
      kind: o.ref.kind,
      id: refKey(o.ref),
      object: {
        id: refKey(o.ref),
        label: refLabel(o.ref),
        type: o.type,
        vhost: o.ref.vhost,
        flows: [...flowNames],
        tolerance,
        keys: rows,
        policies,
        brokerCheck,
      },
      findings: results.map((r) =>
        toFinding(r, s.lang, { fmtNumber: (n) => fmtNumber(s.lang, n) }),
      ),
    });
    return 0;
  }

  const head = [
    ascii(refLabel({ ...o.ref, vhost: '/' })),
    o.type,
    `vhost ${o.ref.vhost}`,
    ...(flowNames.length
      ? [`flow ${flowNames.join(', ')} (${tolerance})`]
      : []),
  ].join(' · ');
  const lines = [head, ''];
  if (o.effective.state === 'known') {
    const layerText = (l: string) => s.t(`explain.layer.${l}`);
    lines.push(
      ...table(
        ['key', 'value', 'layer', 'set_by', 'runtime', 'note'].map((k) =>
          s.t(`explain.col.${k}`),
        ),
        rows.map((r) => {
          const by = [
            r.by ?? '-',
            ...(
              r.overridden as {
                layer: string;
                by: string | null;
                value: unknown;
                why: string;
              }[]
            ).map((x) =>
              s.t(`explain.overridden.${x.why}`, {
                layer: layerText(x.layer),
                by: x.by ?? '-',
                value: show(x.value),
              }),
            ),
          ].join('\n');
          return [
            r.key,
            show(r.value),
            layerText(r.layer),
            by,
            s.t(r.runtime ? 'explain.yes' : 'explain.no'),
            r.rules.join(', '),
          ];
        }),
      ),
    );
  } else {
    lines.push(
      s.t('explain.effective_unknown', { reason: reasonText(s, o.effective) }),
    );
  }
  lines.push('');
  const pol = policies.length
    ? policies
        .map((p) =>
          s.t(p.applied ? 'explain.policy_applied' : 'explain.policy_ignored', {
            name: p.name,
            priority: p.priority,
          }),
        )
        .join(' · ')
    : '-';
  const ruleLine = results.length
    ? results
        .map((r) =>
          r.result === 'fail'
            ? `${r.rule} fail ${r.severity}`
            : `${r.rule} ${r.result.replace('_', ' ')}`,
        )
        .join(' · ')
    : '-';
  lines.push(
    ...labelled(s, [
      ['policies', pol],
      ['rules', ruleLine],
      ['broker', s.t(`explain.broker.${brokerCheck}`)],
    ]),
  );
  print(s, lines);
  return 0;
}

function explainFlow(s: Session, name: string, loaded: Loaded): ExitCode {
  const flow = loaded.desired!.flows[name];
  if (!flow)
    throw usage('explain.not_found', { kind: 'flow', name, vhost: '-' });
  const flows = makeCtx({
    actual: loaded.actual,
    desired: loaded.desired,
    now: loaded.actual.meta.readFinishedAt,
  }).flows;
  const m = flows.membersOf(name);
  const labels = (refs: readonly ObjectRef[]) => refs.map((r) => refLabel(r));
  const members = [...m.exchanges, ...m.queues, ...m.bindings];
  const results = members.flatMap((r) => resultsFor(loaded.results, r));
  if (s.json) {
    writeJson(s, {
      schema: 'ocho.explain/1',
      kind: 'flow',
      id: name,
      flow: {
        name,
        tolerance: flow.tolerance,
        members: {
          exchanges: labels(m.exchanges),
          queues: labels(m.queues),
          bindings: labels(m.bindings),
        },
      },
      findings: results.map((r) =>
        toFinding(r, s.lang, { fmtNumber: (n) => fmtNumber(s.lang, n) }),
      ),
    });
    return 0;
  }
  const fails = results.filter((r) => r.result === 'fail');
  print(s, [
    `flow ${name} · vhost ${flow.vhost} · ${flow.tolerance}`,
    '',
    ...labelled(s, [
      ['exchanges', labels(m.exchanges).map(ascii).join('\n') || '-'],
      ['queues', labels(m.queues).map(ascii).join('\n') || '-'],
      ['bindings', labels(m.bindings).map(ascii).join('\n') || '-'],
      [
        'rules',
        fails.length
          ? fails
              .map(
                (r) => `${r.rule} ${r.severity} ${ascii(refLabel(r.object))}`,
              )
              .join('\n')
          : s.t('explain.no_fail', { count: results.length }),
      ],
    ]),
  ]);
  return 0;
}

function findObject(
  actual: Actual,
  kind: 'queue' | 'exchange',
  vhost: string,
  name: string,
): Queue | Exchange | undefined {
  const list: readonly (Queue | Exchange)[] =
    kind === 'queue'
      ? known<Queue>(actual.queues)
      : known<Exchange>(actual.exchanges);
  return list.find((x) => x.ref.vhost === vhost && x.ref.name === name);
}

export async function explain(s: Session): Promise<ExitCode> {
  const pos = s.args.positionals;
  if (pos.length === 0) throw usage('explain.missing_target');
  const vhost = str(s.args, 'vhost') ?? '/';

  if (pos.length === 1) {
    const id = pos[0];
    const upper = id.toUpperCase();
    const meta = ruleMetas.find((r) => r.code === upper);
    if (meta) return explainRule(s, meta.code);
    const b = blindSpots.find((x) => x.id === upper);
    if (b) return explainBlindSpot(s, b);
    const c = /^[A-Z]+[0-9]+$/.test(upper) ? codeEntry(upper) : undefined;
    if (c) return explainCode(s, c);
    // Tên trơn: queue rồi exchange cùng tên trong vhost được chọn.
    const loaded = await load(s, vhost, { kind: 'either', name: id });
    const o = findObject(loaded.actual, loaded.kind!, vhost, id);
    if (!o) throw usage('explain.not_found_any', { name: id, vhost });
    return explainObject(s, o, loaded);
  }

  const kind = pos[0] as ObjectKind;
  if (!OBJECT_KINDS.includes(kind))
    throw usage('explain.unknown_kind', { kind: pos[0] });
  const name = pos.slice(1).join(' ');
  if (kind === 'flow') {
    const loaded = await load(
      s,
      (d) => {
        if (!d.flows[name])
          throw usage('explain.not_found', { kind, name, vhost: '-' });
        return d.flows[name].vhost;
      },
      { kind: 'vhost' },
    );
    return explainFlow(s, name, loaded);
  }
  const loaded = await load(s, vhost, { kind, name });
  const o = findObject(loaded.actual, kind, vhost, name);
  if (!o) throw usage('explain.not_found', { kind, name, vhost });
  return explainObject(s, o, loaded);
}
