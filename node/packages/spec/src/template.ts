// Khuôn câu i18n: `{tên}` và đúng một cấu trúc ICU là số nhiều
// `{n, plural, one {...} other {...}}`, với `#` là số đã định dạng.
// Không `select`, không lồng, không `{` `}` theo nghĩa đen.
// File này không import gì để scripts/codegen.ts dùng lại được.

export type PluralCategory = 'one' | 'other';

export type BranchPart =
  { readonly t: 'text'; readonly v: string } | { readonly t: 'hash' };

export type Part =
  | { readonly t: 'text'; readonly v: string }
  | { readonly t: 'arg'; readonly name: string }
  | {
      readonly t: 'plural';
      readonly name: string;
      readonly branches: Readonly<
        Partial<Record<PluralCategory, readonly BranchPart[]>>
      >;
    };

export type ParseResult =
  | { readonly ok: true; readonly parts: readonly Part[] }
  | { readonly ok: false; readonly error: string };

const NAME_RE = /^[a-z][A-Za-z0-9]*$/;
const CATEGORIES: readonly string[] = ['one', 'other'];

/**
 * Tách khuôn câu thành các phần.
 * @example parseTemplate('{n, plural, one {# item} other {# items}} left')
 */
export function parseTemplate(s: string): ParseResult {
  const parts: Part[] = [];
  let text = '';
  let i = 0;
  const fail = (error: string): ParseResult => ({
    ok: false,
    error: `${error} at ${i}`,
  });
  const skipSpace = () => {
    while (s[i] === ' ') i++;
  };

  while (i < s.length) {
    const c = s[i];
    if (c === '}') return fail('literal "}"');
    if (c !== '{') {
      text += c;
      i++;
      continue;
    }
    if (text) parts.push({ t: 'text', v: text });
    text = '';
    i++;
    const end = s.slice(i).search(/[,}]/);
    if (end < 0) return fail('unclosed "{"');
    const name = s.slice(i, i + end).trim();
    if (!NAME_RE.test(name)) return fail(`invalid parameter name "${name}"`);
    i += end;
    if (s[i] === '}') {
      parts.push({ t: 'arg', name });
      i++;
      continue;
    }
    i++;
    skipSpace();
    if (!s.startsWith('plural', i)) return fail('only plural is supported');
    i += 'plural'.length;
    skipSpace();
    if (s[i] !== ',') return fail('expected "," after plural');
    i++;
    const branches: Partial<Record<PluralCategory, BranchPart[]>> = {};
    for (;;) {
      skipSpace();
      if (s[i] === '}') break;
      const m = /^[a-z]+/.exec(s.slice(i));
      if (!m || !CATEGORIES.includes(m[0]))
        return fail('expected plural category one or other');
      const cat = m[0] as PluralCategory;
      if (branches[cat]) return fail(`duplicate category ${cat}`);
      i += cat.length;
      skipSpace();
      if (s[i] !== '{') return fail('expected "{" after plural category');
      i++;
      const branch: BranchPart[] = [];
      let bt = '';
      while (i < s.length && s[i] !== '}') {
        if (s[i] === '{') return fail('nested "{" in plural branch');
        if (s[i] === '#') {
          if (bt) branch.push({ t: 'text', v: bt });
          bt = '';
          branch.push({ t: 'hash' });
        } else bt += s[i];
        i++;
      }
      if (i >= s.length) return fail('unclosed plural branch');
      if (bt) branch.push({ t: 'text', v: bt });
      branches[cat] = branch;
      i++;
    }
    if (!branches.other) return fail('plural without other');
    parts.push({ t: 'plural', name, branches });
    i++;
  }
  if (text) parts.push({ t: 'text', v: text });
  return { ok: true, parts };
}

/** Tên tham số mà khuôn câu dùng, kèm cờ "dùng trong plural". */
export function templateParams(
  parts: readonly Part[],
): ReadonlyMap<string, { plural: boolean }> {
  const out = new Map<string, { plural: boolean }>();
  for (const p of parts) {
    if (p.t === 'text') continue;
    const prev = out.get(p.name);
    out.set(p.name, { plural: (prev?.plural ?? false) || p.t === 'plural' });
  }
  return out;
}
