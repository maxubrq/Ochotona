import type { ObjectKind } from '@ochotona/model';
import { rule } from '@ochotona/spec';
import { type FieldPath, modeOf } from './paths';
import type { RuleDef } from './types';

/**
 * Khai một luật. Kiểu của `view` sinh từ `requires` và `optional`, nên đọc
 * trường không khai là lỗi biên dịch. Lúc nạp, kiểm mã có trong `rules.json`,
 * `appliesTo` khớp metadata, và mọi đường dẫn đi được từ loại đối tượng.
 */
export function defineRule<
  const K extends ObjectKind,
  const R extends readonly FieldPath[],
  const O extends readonly FieldPath[] = readonly [],
>(def: RuleDef<K, R, O>): RuleDef<K, R, O> {
  const meta = rule(def.code);
  if (!(meta.appliesTo as readonly string[]).includes(def.appliesTo))
    throw new Error(
      `${def.code}: appliesTo ${def.appliesTo} is not in rules.json (${meta.appliesTo.join(', ')})`,
    );
  for (const p of [...def.requires, ...def.optional]) {
    if (modeOf(def.appliesTo, p) === null)
      throw new Error(
        `${def.code}: ${p} is not reachable from ${def.appliesTo}`,
      );
  }
  for (const p of def.needs ?? [])
    if (!def.optional.includes(p))
      throw new Error(`${def.code}: needs ${p} is not declared optional`);
  return def;
}
