import type {
  ApplyTo,
  Effective,
  EffectiveCheck,
  EffectiveEntry,
  Layer,
  Overridden,
  Policy,
  QueueType,
  ReadAnomaly,
} from './actual';
import {
  type KeyDef,
  keyByArgument,
  keyByCanonical,
  keyByPolicy,
  keys,
} from '@ochotona/spec';
import type { Capabilities } from './caps';
import { type Observed, type UnknownReason, known, unknown } from './observed';
import { compareStr, stableJson } from './ref';
import {
  type ArgMap,
  type ArgValue,
  type Instant,
  latestInstant,
} from './units';

// Bảng khoá (giả định GC10) là `keys.json` của @ochotona/spec; model không viết
// cứng tên khoá nào. Khoá ngoài bảng được coi là `argument_wins`.

/** Bảng khoá argument và policy, xuất lại từ `@ochotona/spec`. */
export const EFFECTIVE_KEYS: readonly KeyDef[] = keys;

/** Tên argument → khoá chuẩn. Ngoài bảng thì bỏ tiền tố `x-`. */
export function canonicalArgKey(arg: string): string {
  return (
    keyByArgument(arg)?.canonical ?? (arg.startsWith('x-') ? arg.slice(2) : arg)
  );
}

/** Khoá policy → khoá chuẩn. Ngoài bảng thì giữ nguyên. */
function canonicalPolicyKey(key: string): string {
  return keyByPolicy(key)?.canonical ?? key;
}

function ruleOf(key: string): KeyDef['resolution'] {
  return keyByCanonical(key)?.resolution ?? 'argument_wins';
}

export type PolicyTarget = 'exchange' | QueueType;

const APPLIES: Readonly<Record<ApplyTo, readonly PolicyTarget[]>> = {
  all: ['exchange', 'classic', 'quorum', 'stream'],
  exchanges: ['exchange'],
  queues: ['classic', 'quorum', 'stream'],
  classic_queues: ['classic'],
  quorum_queues: ['quorum'],
  streams: ['stream'],
};

export function applyToMatches(
  applyTo: ApplyTo,
  target: PolicyTarget,
): boolean {
  return APPLIES[applyTo].includes(target);
}

const UNSUPPORTED_ESCAPES = new Set([
  'A',
  'Z',
  'z',
  'G',
  'Q',
  'E',
  'K',
  'R',
  'h',
  'v',
  'p',
]);
const UNSUPPORTED_GROUPS = new Set([
  '>',
  '|',
  '#',
  '(',
  'R',
  'P',
  '+',
  '-',
  '&',
]);

/**
 * Pattern PCRE có cấu trúc mà JavaScript không có hoặc hiểu khác: nhóm đặc biệt,
 * cờ nội tuyến, lượng từ chiếm hữu, một số escape. Không dịch gần đúng.
 */
export function hasUnsupportedPcre(pattern: string): boolean {
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    const next = pattern[i + 1];
    if (c === '\\') {
      if (next !== undefined && UNSUPPORTED_ESCAPES.has(next)) return true;
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      if (pattern[i + 1] === ']') i++; // ']' đầu lớp là ký tự thường trong PCRE
      continue;
    }
    if (c === '(' && next === '?') {
      const g = pattern[i + 2];
      if (g === undefined) return true;
      if (UNSUPPORTED_GROUPS.has(g) || /[0-9]/.test(g)) return true;
      if (/[a-zA-Z^]/.test(g)) return true; // cờ nội tuyến (?i) (?i:...) (?^)
      i += 1; // bỏ qua '?' để không coi là lượng từ
      continue;
    }
    if ((c === '*' || c === '+' || c === '?' || c === '}') && next === '+')
      return true;
  }
  return false;
}

const regexCache = new Map<string, RegExp | null>();

/** Biên dịch một lần mỗi pattern; `null` nếu ngoài tập hỗ trợ. */
export function compilePolicyPattern(pattern: string): RegExp | null {
  let re = regexCache.get(pattern);
  if (re !== undefined) return re;
  re = null;
  if (!hasUnsupportedPcre(pattern)) {
    try {
      re = new RegExp(pattern);
    } catch {
      re = null;
    }
  }
  regexCache.set(pattern, re);
  return re;
}

const byVhostCache = new WeakMap<readonly Policy[], Map<string, Policy[]>>();

function policiesInVhost(
  policies: readonly Policy[],
  vhost: string,
): readonly Policy[] {
  let m = byVhostCache.get(policies);
  if (!m) {
    m = new Map();
    for (const p of policies) {
      const list = m.get(p.ref.vhost) ?? [];
      list.push(p);
      m.set(p.ref.vhost, list);
    }
    byVhostCache.set(policies, m);
  }
  return m.get(vhost) ?? [];
}

type Choice =
  | { ok: true; policy: Policy | null }
  | {
      ok: false;
      reason:
        | { kind: 'tie'; policies: string[] }
        | { kind: 'regex_unsupported'; policy: string; pattern: string };
    };

/** Chọn policy áp cho đối tượng: cùng vhost, applyTo khớp, pattern khớp, priority cao nhất. */
export function choosePolicy(
  policies: readonly Policy[],
  vhost: string,
  name: string,
  target: PolicyTarget,
): Choice {
  const candidates = policiesInVhost(policies, vhost)
    .filter((p) => applyToMatches(p.applyTo, target))
    .sort((a, b) => compareStr(a.ref.name, b.ref.name));
  const matching: Policy[] = [];
  for (const p of candidates) {
    const re = compilePolicyPattern(p.pattern);
    if (re === null) {
      return {
        ok: false,
        reason: {
          kind: 'regex_unsupported',
          policy: p.ref.name,
          pattern: p.pattern,
        },
      };
    }
    if (re.test(name)) matching.push(p);
  }
  if (matching.length === 0) return { ok: true, policy: null };
  const top = Math.max(...matching.map((p) => p.priority));
  const best = matching.filter((p) => p.priority === top);
  if (best.length > 1) {
    return {
      ok: false,
      reason: { kind: 'tie', policies: best.map((p) => p.ref.name) },
    };
  }
  return { ok: true, policy: best[0] };
}

/**
 * Mọi policy khớp đối tượng (cùng vhost, applyTo, pattern), sắp theo priority
 * giảm dần rồi tên. Phần tử đầu là policy broker áp, trừ khi hoà priority.
 * Một ứng viên có pattern ngoài tập hỗ trợ thì không kết luận được.
 * @example matchingPolicies({ ref: q.ref, queueType: 'quorum' }, policies)
 */
export function matchingPolicies(
  obj: Pick<EffectiveTarget, 'ref' | 'queueType'>,
  policies: readonly Policy[],
):
  | { readonly ok: true; readonly policies: readonly Policy[] }
  | {
      readonly ok: false;
      readonly reason: Extract<UnknownReason, { kind: 'regex_unsupported' }>;
    } {
  const target: PolicyTarget = obj.queueType ?? 'exchange';
  const out: Policy[] = [];
  for (const p of policiesInVhost(policies, obj.ref.vhost)) {
    if (!applyToMatches(p.applyTo, target)) continue;
    const re = compilePolicyPattern(p.pattern);
    if (re === null)
      return {
        ok: false,
        reason: {
          kind: 'regex_unsupported',
          policy: p.ref.name,
          pattern: p.pattern,
        },
      };
    if (re.test(obj.ref.name)) out.push(p);
  }
  out.sort(
    (a, b) => b.priority - a.priority || compareStr(a.ref.name, b.ref.name),
  );
  return { ok: true, policies: out };
}

export interface EffectiveResolution {
  readonly effective: Observed<Effective>;
  readonly chosen: {
    readonly policy: string | null;
    readonly operator: string | null;
  };
  /** Định nghĩa policy đã gộp với operator policy, khoá theo tên khoá policy. */
  readonly mergedPolicyDefinition: ArgMap;
  readonly anomalies: readonly ReadAnomaly[];
}

export interface EffectiveTarget {
  readonly ref: {
    readonly kind: 'exchange' | 'queue';
    readonly vhost: string;
    readonly name: string;
  };
  /** Có thì là queue; không có thì là exchange. */
  readonly queueType?: QueueType;
  readonly arguments: ArgMap;
  /** Mặc định của vhost: chuỗi nếu có, `null` nếu biết là không có, vắng nếu không biết. */
  readonly vhostDefaultQueueType?: QueueType | null;
  readonly observedAt?: Instant;
}

interface Slot {
  value: ArgValue;
  layer: Layer;
  by: string | null;
  overridden: Overridden[];
}

const PATH = 'derived:effective';
const isNum = (v: ArgValue): v is number => typeof v === 'number';

/**
 * Giá trị hiệu lực của từng khoá trên queue hoặc exchange, dùng cho cả Actual và Desired.
 * `unknown` khi danh sách policy `unknown` (`depends_on`), khi hai policy cùng priority
 * cao nhất (`tie`), hoặc khi một ứng viên có pattern ngoài tập hỗ trợ (`regex_unsupported`).
 * @example resolveEffective({ ref, queueType: 'quorum', arguments: { 'x-max-length': 10 } }, pols, ops, caps)
 */
export function resolveEffective(
  obj: EffectiveTarget,
  policies: Observed<readonly Policy[]>,
  operatorPolicies: Observed<readonly Policy[]>,
  caps: Capabilities,
): EffectiveResolution {
  const fail = (effective: Observed<Effective>): EffectiveResolution => ({
    effective,
    chosen: { policy: null, operator: null },
    mergedPolicyDefinition: {},
    anomalies: [],
  });
  for (const ps of [policies, operatorPolicies]) {
    if (ps.state === 'unknown') {
      return fail(
        unknown(
          { kind: 'depends_on', path: ps.path, reason: ps.reason },
          'derived',
          PATH,
        ),
      );
    }
  }
  if (policies.state !== 'known' || operatorPolicies.state !== 'known')
    throw new Error('unreachable');

  const target: PolicyTarget = obj.queueType ?? 'exchange';
  const { vhost, name } = obj.ref;
  const pc = choosePolicy(policies.value, vhost, name, target);
  if (!pc.ok) return fail(unknown(pc.reason, 'derived', PATH));
  const oc = choosePolicy(operatorPolicies.value, vhost, name, target);
  if (!oc.ok) return fail(unknown(oc.reason, 'derived', PATH));

  const anomalies: ReadAnomaly[] = [];
  const slots = new Map<string, Slot>();

  // Bước 4: policy rồi operator policy.
  if (pc.policy) {
    for (const [pk, v] of Object.entries(pc.policy.definition)) {
      slots.set(canonicalPolicyKey(pk), {
        value: v,
        layer: 'policy',
        by: pc.policy.ref.name,
        overridden: [],
      });
    }
  }
  if (oc.policy) {
    const by = oc.policy.ref.name;
    for (const [pk, v] of Object.entries(oc.policy.definition)) {
      const k = canonicalPolicyKey(pk);
      const cur = slots.get(k);
      const allowed = keyByPolicy(pk)?.operatorPolicyAllowed;
      if (allowed === false || !isNum(v)) {
        anomalies.push({
          kind: 'unexpected_operator_key',
          collection: 'operatorPolicies',
          ref: oc.policy.ref,
          detail:
            allowed === false
              ? `key ${pk} is not allowed in operator policies`
              : `key ${pk} is not numeric`,
        });
      }
      if (!cur) {
        slots.set(k, {
          value: v,
          layer: 'operator_policy',
          by,
          overridden: [],
        });
      } else if (isNum(v) && isNum(cur.value)) {
        if (v < cur.value) {
          slots.set(k, {
            value: v,
            layer: 'operator_policy',
            by,
            overridden: [
              {
                layer: cur.layer,
                by: cur.by,
                value: cur.value,
                why: 'lower_wins',
              },
            ],
          });
        } else {
          cur.overridden.push({
            layer: 'operator_policy',
            by,
            value: v,
            why: 'lower_wins',
          });
        }
      } else {
        slots.set(k, {
          value: v,
          layer: 'operator_policy',
          by,
          overridden: [
            {
              layer: cur.layer,
              by: cur.by,
              value: cur.value,
              why: 'lower_wins',
            },
          ],
        });
      }
    }
  }
  const merged: Record<string, ArgValue> = {};
  for (const k of [...slots.keys()].sort(compareStr))
    merged[k] = slots.get(k)!.value;

  // Bước 5: gộp với argument.
  for (const [arg, v] of Object.entries(obj.arguments)) {
    const k = canonicalArgKey(arg);
    const cur = slots.get(k);
    const mine: Slot = {
      value: v,
      layer: 'argument',
      by: null,
      overridden: [],
    };
    if (!cur) {
      slots.set(k, mine);
      continue;
    }
    const loser = (s: Slot, why: Overridden['why']): Overridden[] => [
      { layer: s.layer, by: s.by, value: s.value, why },
      ...s.overridden,
    ];
    if (ruleOf(k) === 'lower_wins' && isNum(v) && isNum(cur.value)) {
      if (v <= cur.value) {
        slots.set(k, { ...mine, overridden: loser(cur, 'lower_wins') });
      } else {
        cur.overridden.push({
          layer: 'argument',
          by: null,
          value: v,
          why: 'lower_wins',
        });
      }
    } else {
      slots.set(k, { ...mine, overridden: loser(cur, 'argument_wins') });
    }
  }

  // Bước 6: mặc định dựng sẵn.
  if (obj.queueType) {
    for (const [k, v] of Object.entries(caps.defaults[obj.queueType])) {
      if (!slots.has(k))
        slots.set(k, {
          value: v,
          layer: 'builtin_default',
          by: null,
          overridden: [],
        });
    }
    if (!slots.has('queue-type')) {
      const vd = obj.vhostDefaultQueueType;
      if (typeof vd === 'string') {
        slots.set('queue-type', {
          value: vd,
          layer: 'vhost_default',
          by: null,
          overridden: [],
        });
      } else if (vd === null) {
        slots.set('queue-type', {
          value: 'classic',
          layer: 'builtin_default',
          by: null,
          overridden: [],
        });
      }
      // vd === undefined: không biết mặc định của vhost, để vắng thay vì đoán.
    }
  }

  const effective: Record<string, EffectiveEntry> = {};
  for (const k of [...slots.keys()].sort(compareStr)) {
    const s = slots.get(k)!;
    effective[k] = {
      value: s.value,
      layer: s.layer,
      by: s.by,
      overridden: s.overridden,
    };
  }
  const times = [policies.prov.observedAt, operatorPolicies.prov.observedAt];
  if (obj.observedAt) times.push(obj.observedAt);
  return {
    effective: known(effective, {
      source: 'derived',
      path: PATH,
      observedAt: latestInstant(times)!,
    }),
    chosen: {
      policy: pc.policy?.ref.name ?? null,
      operator: oc.policy?.ref.name ?? null,
    },
    mergedPolicyDefinition: merged,
    anomalies,
  };
}

export interface BrokerView {
  readonly appliedPolicy: Observed<string | null>;
  readonly appliedOperatorPolicy?: Observed<string | null>;
  readonly brokerEffectivePolicy?: Observed<ArgMap>;
}

/**
 * Đối chiếu kết quả model với những gì broker tự tính. Lệch ở bất kỳ trường nào
 * thì `effective` thành `unknown: model_mismatch`.
 */
export function selfCheck(
  r: EffectiveResolution,
  broker: BrokerView,
): { effective: Observed<Effective>; effectiveCheck: EffectiveCheck } {
  if (r.effective.state === 'unknown')
    return { effective: r.effective, effectiveCheck: 'unverified' };
  const show = (s: string | null) => (s === null ? 'none' : s);
  const checks: [string, Observed<string> | undefined, string][] = [];
  const asStr = (
    o: Observed<string | null> | undefined,
  ): Observed<string> | undefined =>
    o && (o.state === 'known' ? { ...o, value: show(o.value) } : o);
  checks.push(['policy', asStr(broker.appliedPolicy), show(r.chosen.policy)]);
  if ('appliedOperatorPolicy' in broker) {
    checks.push([
      'operator_policy',
      asStr(broker.appliedOperatorPolicy),
      show(r.chosen.operator),
    ]);
  }
  if (broker.brokerEffectivePolicy) {
    const b = broker.brokerEffectivePolicy;
    checks.push([
      'definition',
      b.state === 'known' ? { ...b, value: stableJson(b.value) } : b,
      stableJson(r.mergedPolicyDefinition),
    ]);
  }
  const mismatches: string[] = [];
  let allKnown = true;
  for (const [label, b, model] of checks) {
    if (!b || b.state === 'unknown') {
      allKnown = false;
      continue;
    }
    if (b.value !== model)
      mismatches.push(`${label}: model=${model} broker=${b.value}`);
  }
  if (mismatches.length > 0) {
    return {
      effective: unknown(
        { kind: 'model_mismatch', detail: mismatches.join('; ') },
        'derived',
        PATH,
      ),
      effectiveCheck: 'unverified',
    };
  }
  return {
    effective: r.effective,
    effectiveCheck: allKnown ? 'verified' : 'unverified',
  };
}
