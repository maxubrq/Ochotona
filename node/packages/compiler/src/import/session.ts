import {
  type Actual,
  type Change,
  type Desired,
  type Family,
  type Flow,
  type Instant,
  type Rate,
  type Result,
  type Tolerance,
  type TopoQueue,
  type Topology,
  type Version,
  compareStr,
  compareVersion,
  diffTopology,
  err,
  matchTemplate,
  normalizeTopology,
  ok,
  parseTemplate,
  parseVersion,
  refKey,
} from '@ochotona/model';
import { BROKER_SUPPORT, type I18nKey, SPEC_VERSION } from '@ochotona/spec';
import {
  type FamilyProposal,
  DEFAULT_PARAM,
  inferFamilies,
} from '../infer/families';
import {
  type FlowCandidate,
  type UnmanagedReason,
  inferFlows,
  maxRate,
  queueRates,
} from '../infer/flows';
import { setOwn } from '../own';
import type { LocatedDiag, OchoComment } from '../types';
import { loadOchoYaml } from '../yaml/load';
import type { WriteOptions } from '../yaml/write';
import {
  familyTuples,
  formatChange,
  missingMembers,
  targetExchange,
  targetTuples,
  uncovered,
  vanishedFlows,
} from './merge';
import { type RoundTripError, defaultSchemaUrl, roundTrip } from './roundtrip';

export interface ExistingFile {
  /** Nội dung `ocho.yaml` đang có. */
  readonly text: string;
  /** Tên file trong chẩn đoán; mặc định `ocho.yaml`. */
  readonly file?: string;
}

export interface ImportInput {
  /** `topologyFromActual(actual)`; compiler tự chuẩn hoá. */
  readonly topology: Topology;
  /** Cho tốc độ, phiên bản broker, và tự kiểm vòng tròn. */
  readonly actual: Actual;
  readonly existing: ExistingFile | null;
  readonly context: {
    readonly name: string;
    readonly toolVersion: string;
    readonly now: Instant;
    readonly schemaUrl?: string;
  };
}

export type Question =
  | {
      readonly id: string;
      readonly kind: 'family';
      readonly proposal: FamilyProposal;
    }
  | {
      readonly id: string;
      readonly kind: 'family_members';
      readonly family: string;
      readonly queue: string;
      readonly member: string;
    }
  | {
      readonly id: string;
      readonly kind: 'tolerance';
      readonly flow: FlowCandidate;
      readonly rate: Rate | null;
      readonly queues: number;
      readonly consequence: I18nKey;
    };

export type Answer =
  | { readonly kind: 'family'; readonly action: 'accept' | 'skip' }
  | {
      readonly kind: 'family';
      readonly action: 'rename';
      readonly param: string;
    }
  | { readonly kind: 'family_members'; readonly action: 'add' | 'skip' }
  | {
      readonly kind: 'tolerance';
      readonly value: Tolerance;
      readonly scope: 'flow' | 'exchange';
    };

export interface AnswerError {
  readonly code:
    'unknown_question' | 'wrong_kind' | 'invalid_param' | 'invalid_value';
  readonly id: string;
  readonly detail: string;
}

export type ImportError =
  | RoundTripError
  | {
      readonly code: 'IM2';
      readonly reason: 'invalid_file';
      readonly diagnostics: readonly LocatedDiag[];
    }
  | { readonly code: 'incomplete'; readonly remaining: number };

export type ImportWarning = {
  readonly kind: 'broker_below_min_version';
  readonly actual: string;
  readonly min: string;
};

export interface ImportSummary {
  readonly flows: number;
  readonly families: number;
  readonly newFlows: number;
  readonly newFamilies: number;
  readonly membersAdded: number;
  readonly vanishedFlows: number;
  readonly unmanaged: Readonly<Partial<Record<UnmanagedReason, number>>>;
  /** Câu hỏi đóng bằng `answer()`, kể cả câu đóng theo `scope: 'exchange'`. */
  readonly answered: number;
  /** Câu hỏi đóng bằng `answerDefaults()`. */
  readonly defaulted: number;
}

export interface ImportResult {
  readonly desired: Desired;
  /** Chuỗi để CLI ghi ra đĩa; đã qua tự kiểm vòng tròn. */
  readonly yaml: string;
  readonly summary: ImportSummary;
  readonly roundTrip: 'ok';
  /** Chỉ khi import lại: thay đổi lớp topology so với file cũ. */
  readonly changes: {
    readonly topology: readonly Change[];
    readonly lines: readonly string[];
  } | null;
  readonly warnings: readonly ImportWarning[];
}

export interface ImportSession {
  /** Câu hỏi của pha hiện tại, đã xếp thứ tự. */
  questions(): readonly Question[];
  answer(id: string, a: Answer): Result<void, AnswerError>;
  /** `--non-interactive`: trả lời mặc định mọi câu còn lại. */
  answerDefaults(): void;
  result(): Result<ImportResult, ImportError>;
  readonly phase: 'families' | 'tolerance' | 'done';
}

const PARAM_NAME = /^[a-z][a-z0-9_]*$/;
const RESERVED = /[.*#/+]/;

const familyQid = (p: FamilyProposal) => `family:${p.id}`;
const memberQid = (family: string, queue: string) =>
  `family_members:${JSON.stringify([family, queue])}`;
const toleranceQid = (flow: string) => `tolerance:${flow}`;

const majorMinor = (v: Version) => `${v.major}.${v.minor}`;

/** Tên duy nhất: thêm `~2`, `~3`… khi đã có. */
function unique(name: string, taken: Set<string>): string {
  let n = name;
  for (let k = 2; taken.has(n); k++) n = `${name}~${k}`;
  taken.add(n);
  return n;
}

interface PlannedFlow {
  readonly candidate: FlowCandidate;
  /** Exchange để áp `scope: 'exchange'`. */
  readonly exchangeKey: string;
}

/**
 * Phiên import: máy trạng thái thuần ba pha `families` → `tolerance` → `done`.
 * CLI lặp `questions()`, hỏi, gọi `answer()`, tới khi hết câu hỏi, rồi gọi
 * `result()`. Không biết terminal, không đọc đĩa.
 */
export function createImportSession(input: ImportInput): ImportSession {
  const { actual, context } = input;
  const now = context.now;
  const topology = normalizeTopology(input.topology);
  const queues: readonly TopoQueue[] = topology.queues;
  const rates = queueRates(actual);
  const inferred = inferFlows(input.topology, actual);

  // File cũ: có lỗi thì dừng (IM2), không hợp nhất, không ghi đè.
  let fatal: ImportError | null = null;
  let existing: Desired | null = null;
  if (input.existing) {
    const loaded = loadOchoYaml(input.existing.text, now, input.existing.file);
    if (loaded.ok) existing = loaded.value.desired;
    else
      fatal = {
        code: 'IM2',
        reason: 'invalid_file',
        diagnostics: loaded.error,
      };
  }
  const oldFamilies: Readonly<Record<string, Family>> =
    existing?.families ?? {};
  const oldFlows: Readonly<Record<string, Flow>> = existing?.flows ?? {};

  // Đề xuất không chồng lên family đã có.
  const claimed = new Set<string>();
  for (const f of Object.values(oldFamilies))
    for (const t of familyTuples(f, queues))
      claimed.add(JSON.stringify([f.vhost, t.queue]));
  const proposals = inferFamilies(input.topology).filter(
    (p) => !p.evidence.some((q) => claimed.has(JSON.stringify([p.vhost, q]))),
  );

  // Queue mới khớp mẫu của family tĩnh.
  const memberQuestions: Extract<Question, { kind: 'family_members' }>[] = [];
  for (const f of Object.values(oldFamilies).sort((a, b) =>
    compareStr(a.name, b.name),
  )) {
    if (f.members === 'registry' || f.queue.params.length !== 1) continue;
    const have = new Set(f.members);
    for (const q of queues) {
      if (q.vhost !== f.vhost) continue;
      const m = matchTemplate(f.queue, q.name)?.[f.queue.params[0]];
      if (m === undefined || have.has(m) || RESERVED.test(m)) continue;
      memberQuestions.push({
        id: memberQid(f.name, q.name),
        kind: 'family_members',
        family: f.name,
        queue: q.name,
        member: m,
      });
    }
  }

  let phase: ImportSession['phase'] = 'families';
  const familyAnswers = new Map<string, Answer & { kind: 'family' }>();
  const memberAnswers = new Map<string, 'add' | 'skip'>();
  const defaultedProposals = new Set<string>();
  const defaultedMembers = new Set<string>();
  const tolerances = new Map<string, Tolerance>();
  let answered = 0;
  let defaulted = 0;

  // Dựng sau pha families.
  let families: Record<string, Family> = {};
  let newFamilyNames: string[] = [];
  let planned: PlannedFlow[] = [];
  let membersAdded = 0;

  const familyQuestions = (): Question[] => [
    ...proposals
      .filter((p) => !familyAnswers.has(familyQid(p)))
      .map((p): Question => ({
        id: familyQid(p),
        kind: 'family',
        proposal: p,
      })),
    ...memberQuestions.filter((q) => !memberAnswers.has(q.id)),
  ];

  const toleranceQuestions = (): Question[] =>
    planned
      .filter((p) => !tolerances.has(p.candidate.name))
      .map((p): Question => ({
        id: toleranceQid(p.candidate.name),
        kind: 'tolerance',
        flow: p.candidate,
        rate: p.candidate.rate,
        queues: p.candidate.queues,
        consequence: `import.consequence.${p.candidate.target.kind}` as I18nKey,
      }));

  /** Hết câu hỏi families: tính family và tập luồng mới, sang pha tolerance. */
  function planFlows(): void {
    families = {};
    for (const f of Object.values(oldFamilies)) {
      if (f.members === 'registry') {
        setOwn(families, f.name, f);
        continue;
      }
      const added = memberQuestions
        .filter((q) => q.family === f.name && memberAnswers.get(q.id) === 'add')
        .map((q) => q.member);
      const members = [...f.members, ...[...new Set(added)].sort(compareStr)];
      membersAdded += members.length - f.members.length;
      setOwn(families, f.name, { ...f, members });
    }

    const flowNames = new Set(Object.keys(oldFlows));
    const familyNames = new Set(Object.keys(families));
    const familyFlows: FlowCandidate[] = [];
    newFamilyNames = [];
    for (const p of proposals) {
      const a = familyAnswers.get(familyQid(p));
      if (!a || a.action === 'skip') continue;
      const param = a.action === 'rename' ? a.param : DEFAULT_PARAM;
      const tpl = (raw: string) =>
        parseTemplate(raw.split(`{${DEFAULT_PARAM}}`).join(`{${param}}`));
      const queue = tpl(p.queueTemplate);
      const routingKey = tpl(p.routingKeyTemplate);
      if (!queue.ok || !routingKey.ok) continue;
      const base = `${p.exchange}/${routingKey.value.raw}${p.vhost === '/' ? '' : `@${p.vhost}`}`;
      const name = unique(unique(base, familyNames), flowNames);
      familyNames.add(name);
      setOwn(families, name, {
        name,
        vhost: p.vhost,
        exchange: p.exchange,
        routingKey: routingKey.value,
        queue: queue.value,
        members: [...p.members],
      });
      newFamilyNames.push(name);
      familyFlows.push({
        name,
        vhost: p.vhost,
        target: { kind: 'family', family: name },
        queues: p.members.length,
        rate: maxRate(p.vhost, p.evidence, rates),
      });
    }

    // Bộ đã được phủ: luồng cũ (với family đã cập nhật) và luồng family mới.
    const covered = new Set<string>();
    for (const f of Object.values(oldFlows))
      for (const t of targetTuples(f.vhost, f.target, families, queues))
        covered.add(t.tuple);
    for (const c of familyFlows)
      for (const t of targetTuples(c.vhost, c.target, families, queues))
        covered.add(t.tuple);

    const fresh: FlowCandidate[] = [...familyFlows];
    for (const c of inferred.candidates) {
      const target = uncovered(c.vhost, c.target, covered);
      if (!target) continue;
      const groups = targetTuples(c.vhost, target, families, queues).map(
        (t) => t.queue,
      );
      fresh.push({
        ...c,
        name: unique(c.name, flowNames),
        target,
        queues: groups.length,
        rate: maxRate(c.vhost, groups, rates),
      });
    }
    planned = fresh
      .map((candidate) => ({
        candidate,
        exchangeKey: JSON.stringify([
          candidate.vhost,
          targetExchange(candidate.target, families),
        ]),
      }))
      .sort(
        (a, b) =>
          (b.candidate.rate?.perSecond ?? -1) -
            (a.candidate.rate?.perSecond ?? -1) ||
          b.candidate.queues - a.candidate.queues ||
          compareStr(a.candidate.name, b.candidate.name),
      );
    phase = 'tolerance';
    advance();
  }

  function advance(): void {
    if (phase === 'families' && familyQuestions().length === 0) planFlows();
    if (phase === 'tolerance' && toleranceQuestions().length === 0)
      phase = 'done';
  }

  const questions = (): readonly Question[] => {
    if (fatal) return [];
    if (phase === 'families') return familyQuestions();
    if (phase === 'tolerance') return toleranceQuestions();
    return [];
  };

  function answer(id: string, a: Answer): Result<void, AnswerError> {
    const q = questions().find((x) => x.id === id);
    const fail = (code: AnswerError['code'], detail: string) =>
      err<AnswerError>({ code, id, detail });
    if (!q) return fail('unknown_question', 'no open question with this id');
    if (q.kind !== a.kind) return fail('wrong_kind', `question is ${q.kind}`);
    if (a.kind === 'family') {
      if (a.action === 'rename' && !PARAM_NAME.test(a.param))
        return fail('invalid_param', 'parameter must match ^[a-z][a-z0-9_]*$');
      familyAnswers.set(id, a);
      answered++;
    } else if (a.kind === 'family_members') {
      memberAnswers.set(id, a.action);
      answered++;
    } else {
      if (!['strict', 'loose', 'undeclared'].includes(a.value))
        return fail(
          'invalid_value',
          'tolerance must be strict, loose or undeclared',
        );
      const flow = (q as Extract<Question, { kind: 'tolerance' }>).flow.name;
      const p = planned.find((x) => x.candidate.name === flow)!;
      const targets =
        a.scope === 'exchange'
          ? planned.filter(
              (x) =>
                x.exchangeKey === p.exchangeKey &&
                !tolerances.has(x.candidate.name),
            )
          : [p];
      for (const t of targets) tolerances.set(t.candidate.name, a.value);
      answered += targets.length;
    }
    advance();
    return ok(undefined);
  }

  function answerDefaults(): void {
    if (fatal) return;
    for (const q of familyQuestions()) {
      if (q.kind === 'family') {
        familyAnswers.set(q.id, { kind: 'family', action: 'skip' });
        defaultedProposals.add(q.id);
      } else if (q.kind === 'family_members') {
        memberAnswers.set(q.id, 'skip');
        defaultedMembers.add(q.id);
      }
      defaulted++;
    }
    advance();
    for (const q of toleranceQuestions()) {
      if (q.kind === 'tolerance') tolerances.set(q.flow.name, 'undeclared');
      defaulted++;
    }
    advance();
  }

  let cached: Result<ImportResult, ImportError> | null = null;
  function result(): Result<ImportResult, ImportError> {
    if (fatal) return err(fatal);
    if (phase !== 'done')
      return err({ code: 'incomplete', remaining: questions().length });
    cached ??= finish();
    return cached;
  }

  function finish(): Result<ImportResult, ImportError> {
    const warnings: ImportWarning[] = [];
    const brokerVersion =
      actual.broker.version.state === 'known'
        ? actual.broker.version.value
        : null;
    let minVersion: Version;
    if (existing) {
      minVersion = existing.broker.minVersion;
      if (brokerVersion && compareVersion(brokerVersion, minVersion) < 0)
        warnings.push({
          kind: 'broker_below_min_version',
          actual: brokerVersion.raw,
          min: minVersion.raw,
        });
    } else {
      const v = brokerVersion ?? parseVersion(BROKER_SUPPORT.minSupported)!;
      minVersion = parseVersion(majorMinor(v))!;
    }

    const flows: Record<string, Flow> = {};
    for (const f of Object.values(oldFlows)) setOwn(flows, f.name, f);
    for (const p of planned) {
      const c = p.candidate;
      setOwn(flows, c.name, {
        name: c.name,
        vhost: c.vhost,
        tolerance: tolerances.get(c.name) ?? 'undeclared',
        target: c.target,
      });
    }

    const desired: Desired = {
      spec: existing?.spec ?? majorMinor(parseVersion(SPEC_VERSION)!),
      broker: { minVersion },
      families,
      flows,
      services: existing?.services ?? {},
      waivers: existing?.waivers ?? [],
      topology: annotate(topology, flows, families),
    };

    const comments = ochoComments(desired);
    const opts: WriteOptions = {
      header: {
        context: context.name,
        toolVersion: context.toolVersion,
        at: now,
        schemaUrl: context.schemaUrl ?? defaultSchemaUrl(context.toolVersion),
      },
      ochoComments: comments.list,
      ...(input.existing
        ? {
            base: { text: input.existing.text },
            keep: ['services', 'waivers'] as const,
          }
        : {}),
    };
    const rt = roundTrip(desired, actual, now, opts);
    if (!rt.ok) return err(rt.error);

    const unmanaged: Partial<Record<UnmanagedReason, number>> = {};
    for (const u of inferred.unmanaged)
      unmanaged[u.reason] = (unmanaged[u.reason] ?? 0) + 1;

    let changes: ImportResult['changes'] = null;
    if (existing) {
      const topo = diffTopology(
        normalizeTopology(existing.topology),
        normalizeTopology(desired.topology),
      );
      changes = { topology: topo, lines: topo.map(formatChange) };
    }

    return ok({
      desired,
      yaml: rt.value.text,
      summary: {
        flows: Object.keys(flows).length,
        families: Object.keys(families).length,
        newFlows: planned.length,
        newFamilies: newFamilyNames.length,
        membersAdded,
        vanishedFlows: comments.vanished,
        unmanaged,
        answered,
        defaulted,
      },
      roundTrip: 'ok',
      changes,
      warnings,
    });
  }

  function ochoComments(desired: Desired): {
    list: OchoComment[];
    vanished: number;
  } {
    const list: OchoComment[] = [];
    for (const p of proposals) {
      if (!defaultedProposals.has(familyQid(p))) continue;
      const where = p.vhost === '/' ? '' : ` in vhost ${p.vhost}`;
      list.push({
        path: ['families'],
        placement: 'inside',
        lines: [
          `proposal: ${p.queueTemplate} via ${p.exchange}${where}, key ${p.routingKeyTemplate}, members [${p.members.join(', ')}]`,
          '  run `ocho import` interactively, or add the family by hand',
        ],
      });
    }
    for (const f of Object.values(desired.families).sort((a, b) =>
      compareStr(a.name, b.name),
    )) {
      const lost = missingMembers(f, queues);
      if (lost.length > 0)
        list.push({
          path: ['families', f.name, 'members'],
          placement: 'before',
          lines: [`not found in broker at ${now}: ${lost.join(', ')}`],
        });
      const waiting = memberQuestions.filter(
        (q) => q.family === f.name && defaultedMembers.has(q.id),
      );
      if (waiting.length > 0)
        list.push({
          path: ['families', f.name, 'members'],
          placement: 'before',
          lines: [
            `new queues match this family: ${waiting.map((q) => q.queue).join(', ')}`,
          ],
        });
    }
    let vanished = 0;
    if (existing) {
      const gone = vanishedFlows(
        { ...desired, flows: { ...oldFlows } },
        actual,
      );
      vanished = gone.length;
      for (const name of gone)
        list.push({
          path: ['flows', name],
          placement: 'before',
          lines: [`not found in broker at ${now}`],
        });
    }
    return { list, vanished };
  }

  advance();
  return {
    questions,
    answer,
    answerDefaults,
    result,
    get phase() {
      return phase;
    },
  };
}

/**
 * Gắn `flow` cho queue và exchange thuộc đúng một luồng. Chỉ để người đọc file;
 * `normalizeTopology` bỏ trường này trước khi so.
 */
function annotate(
  t: Topology,
  flows: Readonly<Record<string, Flow>>,
  families: Readonly<Record<string, Family>>,
): Topology {
  const byQueue = new Map<string, Set<string>>();
  const byExchange = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, flow: string) => {
    const s = m.get(k) ?? new Set();
    s.add(flow);
    m.set(k, s);
  };
  for (const f of Object.values(flows)) {
    const vhost =
      f.target.kind === 'family'
        ? (families[f.target.family]?.vhost ?? f.vhost)
        : f.vhost;
    for (const x of targetTuples(f.vhost, f.target, families, t.queues))
      add(byQueue, refKey({ kind: 'queue', vhost, name: x.queue }), f.name);
    const ex = targetExchange(f.target, families);
    if (ex !== '')
      add(byExchange, refKey({ kind: 'exchange', vhost, name: ex }), f.name);
  }
  const only = (s: Set<string> | undefined) =>
    s && s.size === 1 ? [...s][0] : undefined;
  return {
    ...t,
    exchanges: t.exchanges.map((e) => {
      const flow = only(
        byExchange.get(
          refKey({ kind: 'exchange', vhost: e.vhost, name: e.name }),
        ),
      );
      return flow === undefined ? e : { ...e, flow };
    }),
    queues: t.queues.map((q) => {
      const flow = only(
        byQueue.get(refKey({ kind: 'queue', vhost: q.vhost, name: q.name })),
      );
      return flow === undefined ? q : { ...q, flow };
    }),
  };
}
