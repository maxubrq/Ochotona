import type { RuleCode } from '@ochotona/spec';
import { rule } from '@ochotona/spec';
import { catalog } from './catalog';
import type { FieldPath } from './paths';
import type { AnyRuleDef } from './types';

/**
 * Chọn luật cho một lần chạy. Luật `targetVersionOnly` bị bỏ hẳn khi không có
 * `--target-version`; luật `experimental` chỉ chạy khi được bật.
 */
export function selectRules(opts: {
  readonly targetVersion: boolean;
  readonly includeExperimental: boolean;
  readonly only?: readonly RuleCode[];
}): readonly AnyRuleDef[] {
  return catalog.filter((d) => {
    const meta = rule(d.code);
    if (meta.targetVersionOnly && !opts.targetVersion) return false;
    if (meta.status === 'experimental' && !opts.includeExperimental)
      return false;
    if (opts.only && !opts.only.includes(d.code)) return false;
    return true;
  });
}

/** Hợp của `requires` và `optional` của các luật, sắp tăng dần; đầu vào cho `model.planRead`. */
export function requiredPaths(
  defs: readonly AnyRuleDef[],
): readonly FieldPath[] {
  const set = new Set<FieldPath>();
  for (const d of defs)
    for (const p of [...d.requires, ...d.optional]) set.add(p);
  return [...set].sort();
}
