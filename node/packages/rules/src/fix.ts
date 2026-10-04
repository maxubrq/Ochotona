// Lệnh sửa dựng từ khuôn trong `fix-templates.json` của gói spec.
import {
  type ArgMap,
  type Observed,
  type Policy,
  stableJson,
} from '@ochotona/model';
import { fixTemplate } from '@ochotona/spec';
import type { Ctx, FixSpec } from './types';

/**
 * Đặt giá trị trong nháy đơn POSIX; nháy đơn bên trong thành `'\''`.
 * @example shellQuote("it's") // "'it'\\''s'"
 */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Điền khuôn `id`; mọi giá trị được đặt trong nháy đơn. */
export function renderTemplate(
  id: string,
  params: Readonly<Record<string, string | number>>,
): string {
  const t = fixTemplate(id);
  return t.command.replace(/\{([a-zA-Z0-9]+)\}/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined) throw new Error(`fix template ${id} needs ${name}`);
    return shellQuote(String(v));
  });
}

/** Escape cho PCRE: mọi ký tự đặc biệt thành ký tự thường. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface PolicyFixTarget {
  readonly ref: {
    readonly kind: 'exchange' | 'queue';
    readonly vhost: string;
    readonly name: string;
  };
  readonly appliedPolicy: Observed<string | null>;
}

/** Policy mà lệnh sửa khai: policy đang áp, hoặc policy mới neo đúng tên đối tượng. */
export interface PolicyTarget {
  readonly vhost: string;
  readonly name: string;
  readonly pattern: string;
  readonly applyTo: string;
  readonly priority: number;
  /** Định nghĩa hiện có; rỗng với policy mới. */
  readonly base: ArgMap;
}

function render(t: PolicyTarget, set: ArgMap): string {
  return renderTemplate('policy.declare', {
    vhost: t.vhost,
    name: t.name,
    pattern: t.pattern,
    applyTo: t.applyTo,
    priority: t.priority,
    definition: stableJson({ ...t.base, ...set }),
  });
}

/**
 * Sửa qua policy mà không phá L3: chỉ một policy áp cho một đối tượng, nên
 * nếu đã có policy P thì khai lại P với mọi khoá cũ cộng khoá mới; chưa có thì
 * tạo policy mới neo đúng tên (`ocho-ae-<tên>` cho exchange, `ocho-q-<tên>` cho
 * queue), dùng chung cho mọi luật. Không biết policy đang áp thì chỉ trả `set`.
 * `mergePolicyFixes` sau đó gộp mọi khoá nhắm cùng một policy vào mỗi lệnh.
 */
export function policyFix(
  ctx: Ctx,
  target: PolicyFixTarget,
  set: ArgMap,
): FixSpec {
  const base: FixSpec = { kind: 'policy', set };
  const applied = target.appliedPolicy;
  if (applied.state === 'unknown') return base;
  const { vhost, name, kind } = target.ref;
  let policy: PolicyTarget;
  if (applied.value === null) {
    policy = {
      vhost,
      name: `ocho-${kind === 'exchange' ? 'ae' : 'q'}-${name}`,
      pattern: `^${escapeRegex(name)}$`,
      applyTo: kind === 'exchange' ? 'exchanges' : 'queues',
      priority: 0,
      base: {},
    };
  } else {
    const policies = ctx.actual.policies;
    const p: Policy | undefined =
      policies.state === 'known'
        ? policies.value.find(
            (x) => x.ref.vhost === vhost && x.ref.name === applied.value,
          )
        : undefined;
    if (!p) return base;
    policy = {
      vhost,
      name: p.ref.name,
      pattern: p.pattern,
      applyTo: p.applyTo,
      priority: p.priority,
      base: p.definition,
    };
  }
  return { ...base, policy, rabbitmqadmin: render(policy, set) };
}

/**
 * Mọi lệnh nhắm cùng một policy mang hợp các khoá đề xuất cho policy đó, để
 * áp lệnh nào sau cũng không xoá khoá của lệnh trước. Khoá trùng mà khác giá
 * trị: kết quả đứng trước (mức cao hơn, rồi thứ tự luật) thắng.
 */
export function mergePolicyFixes<T extends { readonly fix?: FixSpec }>(
  results: readonly T[],
): T[] {
  const union = new Map<string, Record<string, ArgMap[string]>>();
  const keyOf = (t: PolicyTarget) => `${t.vhost}\0${t.name}`;
  for (const r of results) {
    const t = r.fix?.policy;
    if (!t || !r.fix?.set) continue;
    const u = union.get(keyOf(t)) ?? {};
    for (const [k, v] of Object.entries(r.fix.set)) if (!(k in u)) u[k] = v;
    union.set(keyOf(t), u);
  }
  return results.map((r) => {
    const t = r.fix?.policy;
    if (!t) return r;
    return {
      ...r,
      fix: { ...r.fix!, rabbitmqadmin: render(t, union.get(keyOf(t))!) },
    };
  });
}
