import { type ObjectRef, compareStr, refKey } from '@ochotona/model';
import { rule } from '@ochotona/spec';
import { ruleOrder } from './engine';
import { type Action, type RuleResult, URGENCIES } from './types';

const sevRank = (s: string) => Number(s.slice(1));
const urgRank = (u: Action['urgency']) => URGENCIES.indexOf(u);

export const vhostOfRef = (ref: ObjectRef): string =>
  'vhost' in ref ? ref.vhost : '';

/**
 * Ba việc làm trước. Ứng viên là `fail` S1–S3 không miễn trừ, không
 * experimental; gom theo (luật, biến thể, loại sửa, vhost); sắp theo mức, độ
 * khẩn, số đối tượng giảm dần, thứ tự luật, vhost.
 */
export function planActions(results: readonly RuleResult[]): {
  actions: readonly Action[];
  uncheckedS1: number;
} {
  const groups = new Map<
    string,
    { a: Omit<Action, 'objects'>; objects: ObjectRef[] }
  >();
  for (const r of results) {
    if (r.result !== 'fail' || r.waiver || r.experimental) continue;
    if (sevRank(r.severity!) > 3) continue;
    const fixKind = r.fix?.kind ?? rule(r.rule).fix;
    const vhost = vhostOfRef(r.object);
    const key = JSON.stringify([r.rule, r.variant ?? '', fixKind, vhost]);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        a: {
          rule: r.rule,
          ...(r.variant ? { variant: r.variant } : {}),
          severity: r.severity!,
          urgency: r.urgency!,
          vhost,
          fixKind,
        },
        objects: [r.object],
      });
      continue;
    }
    g.objects.push(r.object);
    // Một nhóm mang mức và độ khẩn cao nhất của các phần tử.
    if (sevRank(r.severity!) < sevRank(g.a.severity))
      g.a = { ...g.a, severity: r.severity! };
    if (urgRank(r.urgency!) < urgRank(g.a.urgency))
      g.a = { ...g.a, urgency: r.urgency! };
  }
  const actions: Action[] = [...groups.values()].map(({ a, objects }) => ({
    ...a,
    objects: [...new Map(objects.map((o) => [refKey(o), o])).entries()]
      .sort((x, y) => compareStr(x[0], y[0]))
      .map(([, o]) => o),
  }));
  actions.sort(
    (x, y) =>
      sevRank(x.severity) - sevRank(y.severity) ||
      urgRank(x.urgency) - urgRank(y.urgency) ||
      y.objects.length - x.objects.length ||
      ruleOrder(x.rule) - ruleOrder(y.rule) ||
      compareStr(x.vhost, y.vhost) ||
      compareStr(x.variant ?? '', y.variant ?? '') ||
      compareStr(x.fixKind, y.fixKind),
  );
  const uncheckedS1 = results.filter(
    (r) =>
      r.result === 'not_checked' &&
      (rule(r.rule).severities as readonly string[]).includes('S1'),
  ).length;
  return { actions: actions.slice(0, 3), uncheckedS1 };
}
