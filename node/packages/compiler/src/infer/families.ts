import { createHash } from 'node:crypto';
import {
  type Policy,
  type TopoQueue,
  type Topology,
  compareStr,
  matchingPolicies,
  normalizeTopology,
  stableJson,
} from '@ochotona/model';

export interface FamilyProposal {
  /** Ổn định: băm của vhost, exchange, mẫu. */
  readonly id: string;
  readonly vhost: string;
  readonly exchange: string;
  /** `request_{p1}_q` */
  readonly queueTemplate: string;
  /** `request_{p1}` */
  readonly routingKeyTemplate: string;
  /** Giá trị tham số, đã sắp: `['clamav', 'pdf', 'yara']`. */
  readonly members: readonly string[];
  /** Tên queue thật, cùng thứ tự với `members`. */
  readonly evidence: readonly string[];
}

export const DEFAULT_PARAM = 'p1';
const MIN_MEMBERS = 3;
const SEPARATORS = /([._-])/;
/** H2: giá trị tham số không được chứa ký tự định tuyến. */
const RESERVED = /[.*#/+]/;
/** Ký tự làm hỏng mẫu nếu nằm ở phần cố định. */
const BRACES = /[{}]/;

/** Tên tách thành từ và dấu phân cách xen kẽ: `request_clamav_q` → từ `request clamav q`, dấu `_ _`. */
export function tokenize(name: string): { words: string[]; seps: string[] } {
  const parts = name.split(SEPARATORS);
  return {
    words: parts.filter((_, i) => i % 2 === 0),
    seps: parts.filter((_, i) => i % 2 === 1),
  };
}

/** Ghép lại, thay từ ở vị trí `i` bằng `{param}`. */
function template(
  words: readonly string[],
  seps: readonly string[],
  i: number,
  param: string,
): string {
  let out = '';
  words.forEach((w, k) => {
    out += k === i ? `{${param}}` : w;
    if (k < seps.length) out += seps[k];
  });
  return out;
}

export function proposalId(
  vhost: string,
  exchange: string,
  queueTemplate: string,
): string {
  return createHash('sha256')
    .update(stableJson([vhost, exchange, queueTemplate]))
    .digest('hex')
    .slice(0, 12);
}

interface Member {
  readonly queue: TopoQueue;
  readonly words: readonly string[];
  readonly seps: readonly string[];
}

interface Candidate {
  readonly vhost: string;
  readonly position: number;
  readonly members: readonly Member[];
}

/** Policy đang áp lên queue theo topology: tên policy thắng, `''` khi không có, `?` khi không kết luận được. */
function policyName(q: TopoQueue, policies: readonly Policy[]): string {
  const r = matchingPolicies(
    // Stryker disable next-line StringLiteral: matchingPolicies không đọc `kind`
    { ref: { kind: 'queue', vhost: q.vhost, name: q.name }, queueType: q.type },
    policies,
  );
  // Stryker disable next-line StringLiteral: mọi queue cùng vhost cùng nhận `?`, giá trị cụ thể không quan trọng
  if (!r.ok) return '?';
  const [a, b] = r.policies;
  // Stryker disable next-line StringLiteral: dấu "không có policy" chỉ cần khác tên policy và `?`
  if (!a) return '';
  return b && b.priority === a.priority ? '?' : a.ref.name;
}

/**
 * Tìm nhóm queue chỉ khác nhau ở đúng một đoạn tên, cùng cấu hình, cùng
 * exchange và mẫu routing key, rồi đề xuất thành family. Mọi bước tất định;
 * một queue thuộc tối đa một đề xuất.
 * @example inferFamilies(t)[0].queueTemplate // 'request_{p1}_q'
 */
export function inferFamilies(t: Topology): readonly FamilyProposal[] {
  const n = normalizeTopology(t);
  const policies: Policy[] = n.policies.map((p) => ({
    // Stryker disable next-line StringLiteral: matchingPolicies không đọc `kind`
    ref: { kind: 'policy', vhost: p.vhost, name: p.name },
    pattern: p.pattern,
    applyTo: p.applyTo,
    priority: p.priority,
    definition: p.definition,
  }));

  // Binding tới queue, theo (vhost, queue).
  const bindingsOf = new Map<string, { source: string; key: string }[]>();
  for (const b of n.bindings) {
    if (b.destinationType !== 'queue') continue;
    const k = JSON.stringify([b.vhost, b.destination]);
    const xs = bindingsOf.get(k) ?? [];
    xs.push({ source: b.source, key: b.routingKey });
    bindingsOf.set(k, xs);
  }
  const exchangeType = new Map(
    t.exchanges.map((e) => [JSON.stringify([e.vhost, e.name]), e.type]),
  );

  // 1–2. Tách tên, gom theo khung (vhost, số từ, chuỗi dấu phân cách).
  const frames = new Map<string, Member[]>();
  for (const q of n.queues) {
    const { words, seps } = tokenize(q.name);
    if (words.length < 2) continue;
    const k = JSON.stringify([q.vhost, seps]);
    const xs = frames.get(k) ?? [];
    xs.push({ queue: q, words, seps });
    frames.set(k, xs);
  }

  const candidates: Candidate[] = [];
  // Các kiểm `< MIN_MEMBERS` dưới đây chỉ để bớt việc: matchRoutingKeys kiểm
  // lại ≥ 3 sau khi lọc giá trị.
  for (const members of frames.values()) {
    // Stryker disable next-line all: tối ưu
    if (members.length < MIN_MEMBERS) continue;
    const width = members[0].words.length;
    // 3. Mỗi vị trí tham số: gom các queue giống nhau ở mọi từ trừ vị trí đó.
    // Stryker disable next-line EqualityOperator: vị trí thừa cho nhóm một queue
    for (let i = 0; i < width; i++) {
      const groups = new Map<string, Member[]>();
      for (const m of members) {
        const k = JSON.stringify(m.words.filter((_, j) => j !== i));
        const xs = groups.get(k) ?? [];
        xs.push(m);
        groups.set(k, xs);
      }
      for (const g of groups.values()) {
        // Stryker disable next-line all: tối ưu
        if (g.length < MIN_MEMBERS) continue;
        // 4. Tách theo chữ ký.
        const bySig = new Map<string, Member[]>();
        for (const m of g) {
          const q = m.queue;
          const sig = stableJson([
            q.type,
            q.durable,
            q.autoDelete,
            stableJson(q.arguments),
            policyName(q, policies),
          ]);
          const xs = bySig.get(sig) ?? [];
          xs.push(m);
          bySig.set(sig, xs);
        }
        for (const sub of bySig.values())
          // Stryker disable next-line all: tối ưu
          if (sub.length >= MIN_MEMBERS)
            candidates.push({
              vhost: sub[0].queue.vhost,
              position: i,
              members: sub,
            });
      }
    }
  }

  const proposals: (FamilyProposal & { position: number })[] = [];
  for (const c of candidates) {
    const p = matchRoutingKeys(c, bindingsOf, exchangeType);
    if (p) proposals.push(p);
  }

  // 7. Giải chồng lấn: nhiều thành viên hơn, rồi vị trí nhỏ hơn, rồi mẫu nhỏ hơn.
  proposals.sort(
    (a, b) =>
      b.members.length - a.members.length ||
      // Stryker disable next-line all: hai ứng viên chồng nhau cùng khung, nên đã sinh theo vị trí tăng dần
      a.position - b.position ||
      compareStr(a.queueTemplate, b.queueTemplate) ||
      compareStr(a.vhost, b.vhost) ||
      compareStr(a.exchange, b.exchange),
  );
  const taken = new Set<string>();
  const kept: FamilyProposal[] = [];
  for (const { position: _p, ...p } of proposals) {
    const keys = p.evidence.map((q) => JSON.stringify([p.vhost, q]));
    if (keys.some((k) => taken.has(k))) continue;
    keys.forEach((k) => taken.add(k));
    kept.push(p);
  }
  return kept.sort(
    (a, b) =>
      compareStr(a.vhost, b.vhost) ||
      compareStr(a.exchange, b.exchange) ||
      compareStr(a.queueTemplate, b.queueTemplate),
  );
}

/** 5–6. Khớp routing key với tên queue, lọc giá trị vi phạm H2. */
function matchRoutingKeys(
  c: Candidate,
  bindingsOf: ReadonlyMap<string, readonly { source: string; key: string }[]>,
  exchangeType: ReadonlyMap<string, string>,
): (FamilyProposal & { position: number }) | null {
  // Mỗi thành viên đúng một binding, mọi binding từ cùng một exchange.
  const bound = c.members.map((m) => ({
    m,
    bs: bindingsOf.get(JSON.stringify([c.vhost, m.queue.name])) ?? [],
  }));
  if (bound.some((x) => x.bs.length !== 1)) return null;
  const exchange = bound[0].bs[0].source;
  if (bound.some((x) => x.bs[0].source !== exchange)) return null;
  const keyed = bound.map(({ m, bs }) => ({ m, key: tokenize(bs[0].key) }));
  const type = exchangeType.get(JSON.stringify([c.vhost, exchange]));
  if (type !== undefined && type !== 'direct' && type !== 'topic') return null;

  // Các key cùng khung, khác nhau ở đúng một vị trí j.
  const first = keyed[0].key;
  if (
    keyed.some((k) => JSON.stringify(k.key.seps) !== JSON.stringify(first.seps))
  )
    return null;
  const diff: number[] = [];
  // Stryker disable next-line EqualityOperator: vị trí thừa không bao giờ khác nhau
  for (let j = 0; j < first.words.length; j++)
    if (keyed.some((k) => k.key.words[j] !== first.words[j])) diff.push(j);
  if (diff.length !== 1) return null;
  const j = diff[0];
  const i = c.position;
  if (keyed.some((k) => k.key.words[j] !== k.m.words[i])) return null;

  // 6. Lọc giá trị.
  const ok = keyed.filter(
    (k) => k.m.words[i] !== '' && !RESERVED.test(k.m.words[i]),
  );
  if (ok.length < MIN_MEMBERS) return null;
  const sample = ok[0];
  const fixedQueue = sample.m.words.filter((_, k) => k !== i);
  const fixedKey = sample.key.words.filter((_, k) => k !== j);
  if (
    [...fixedQueue, ...fixedKey, ...sample.m.seps, ...sample.key.seps].some(
      (w) => BRACES.test(w),
    )
  )
    return null;
  const queueTemplate = template(
    sample.m.words,
    sample.m.seps,
    i,
    DEFAULT_PARAM,
  );
  const routingKeyTemplate = template(
    sample.key.words,
    sample.key.seps,
    j,
    DEFAULT_PARAM,
  );
  const sorted = [...ok].sort((a, b) => compareStr(a.m.words[i], b.m.words[i]));
  return {
    id: proposalId(c.vhost, exchange, queueTemplate),
    vhost: c.vhost,
    exchange,
    queueTemplate,
    routingKeyTemplate,
    members: sorted.map((k) => k.m.words[i]),
    evidence: sorted.map((k) => k.m.queue.name),
    position: i,
  };
}
