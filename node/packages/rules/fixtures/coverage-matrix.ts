// Ma trận phủ: với mỗi luật, đủ ca cho từng ô. Ô của tầng đơn vị thiếu là CI
// hỏng; ô của tầng tích hợp được báo riêng (`integration`), vì phụ thuộc
// definitions của SUT.
import { rules } from '@ochotona/spec';
import { catalog } from '../src/catalog';
import type { Expect, Fixture } from './fixture';
import { recordedCases } from './integration/recorded';
import { unitFixtures } from './unit';

export interface Gap {
  readonly rule: string;
  readonly tier: 'unit' | 'integration';
  readonly cell: string;
}

export function coverageMatrix(
  unit: readonly Fixture[] = unitFixtures,
  integration = recordedCases,
): Gap[] {
  const gaps: Gap[] = [];
  for (const meta of rules) {
    const code = meta.code;
    const defs = catalog.filter((d) => d.code === code);
    const fixtures = unit.filter((f) => f.rule === code);
    const expects: Expect[] = fixtures.flatMap((f) => [...f.expect]);
    const miss = (cell: string, tier: Gap['tier'] = 'unit') =>
      gaps.push({ rule: code, tier, cell });
    const fails = expects.filter((e) => e.result === 'fail');

    for (const s of meta.severities)
      if (!fails.some((e) => e.severity === s)) miss(`severity ${s}`);
    const variants = new Set(defs.flatMap((d) => d.variants ?? []));
    for (const v of variants)
      if (!fails.some((e) => e.variant === v)) miss(`variant ${v}`);
    // Ngược lại: biến thể luật trả mà không khai thì ma trận không đòi ca cho nó.
    for (const e of expects)
      if (e.variant !== undefined && !variants.has(e.variant))
        miss(`undeclared variant ${e.variant}`);
    for (const p of new Set(defs.flatMap((d) => d.needs ?? [])))
      if (!expects.some((e) => e.result === 'not_checked' && e.path === p))
        miss(`needs ${p}`);
    const requires = new Set<string>(
      defs.flatMap((d) => [...d.requires, d.appliesTo]),
    );
    if (
      !expects.some(
        (e) => e.result === 'not_checked' && requires.has(e.path ?? ''),
      )
    )
      miss('not_checked from requires');
    if (
      meta.dependsOnTolerance &&
      !expects.some((e) => e.note === 'loose_by_declaration')
    )
      miss('pass loose_by_declaration');
    for (const k of ['near', 'anti'] as const)
      if (!fixtures.some((f) => f.kind === k)) miss(`${k} sample`);
    if ((meta.severities as readonly string[]).includes('S1'))
      for (const k of ['fail', 'near'] as const)
        if (!integration.some((c) => c.rule === code && c.kind === k))
          miss(`${k} case`, 'integration');
  }
  return gaps;
}
