import { refKey } from '@ochotona/model';
import type { Expect } from '../fixtures/fixture';
import type { RuleResult } from '../src/types';

/** Khớp kết quả với kỳ vọng; trả danh sách sai lệch, rỗng là khớp. */
export function mismatches(
  results: readonly RuleResult[],
  expect: readonly Expect[],
): string[] {
  const errors: string[] = [];
  const used = new Set<RuleResult>();
  for (const e of expect) {
    // `*`: đối tượng bất kỳ (tên connection, channel trong bản ghi bị che).
    const forObject = results.filter(
      (r) => e.object === '*' || refKey(r.object) === e.object,
    );
    if (e.result === 'none') {
      if (forObject.length > 0)
        errors.push(
          `${e.object}: expected no result, got ${forObject.map((r) => r.result).join(', ')}`,
        );
      continue;
    }
    const r =
      forObject.find(
        (x) =>
          !used.has(x) &&
          (e.variant === undefined || x.variant === e.variant) &&
          (e.severity === undefined || x.severity === e.severity) &&
          x.result === e.result,
      ) ?? forObject.find((x) => !used.has(x));
    if (!r) {
      errors.push(`${e.object}: no result`);
      continue;
    }
    used.add(r);
    const got = {
      result: r.result,
      severity: r.severity,
      variant: r.variant,
      note: r.note,
      path: r.notChecked?.path,
      waived: r.waiver !== undefined,
    };
    const { object: _, urgency, params, fixSet, evidence, ...plain } = e;
    if (urgency !== undefined && r.urgency !== urgency)
      errors.push(`${e.object}: urgency expected ${urgency}, got ${r.urgency}`);
    for (const [k, v] of Object.entries(params ?? {}))
      if (JSON.stringify(r.params[k]) !== JSON.stringify(v))
        errors.push(
          `${e.object}: params.${k} expected ${JSON.stringify(v)}, got ${JSON.stringify(r.params[k])}`,
        );
    if (
      fixSet !== undefined &&
      JSON.stringify(r.fix?.set) !== JSON.stringify(fixSet)
    )
      errors.push(
        `${e.object}: fix.set expected ${JSON.stringify(fixSet)}, got ${JSON.stringify(r.fix?.set)}`,
      );
    if (evidence !== undefined) {
      const gotEv = r.evidence.map((x) =>
        [x.kind, x.path, ...(x.note ? [x.note] : [])].join(' '),
      );
      if (JSON.stringify(gotEv) !== JSON.stringify(evidence))
        errors.push(
          `${e.object}: evidence expected ${JSON.stringify(evidence)}, got ${JSON.stringify(gotEv)}`,
        );
    }
    const want = { ...got, ...plain };
    for (const k of Object.keys(want) as (keyof typeof got)[])
      if (want[k] !== got[k])
        errors.push(
          `${e.object}: ${k} expected ${String(want[k])}, got ${String(got[k])}`,
        );
  }
  return errors;
}
