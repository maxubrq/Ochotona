/** Mẫu tên có tham số `{tên}`, ví dụ `request_{engine_id}_q`. */
export interface Template {
  readonly raw: string;
  readonly parts: readonly (string | { readonly param: string })[];
  /** Theo thứ tự xuất hiện, không lặp. */
  readonly params: readonly string[];
}

const PARAM_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Parse mẫu. Lỗi khi ngoặc lệch, tên tham số sai, hoặc hai tham số đứng sát nhau
 * (không tách được giá trị).
 * @example parseTemplate('request_{engine}_q') // { ok: true, value: { params: ['engine'], ... } }
 */
export function parseTemplate(
  raw: string,
): { ok: true; value: Template } | { ok: false; reason: string } {
  const parts: (string | { param: string })[] = [];
  const params: string[] = [];
  let lit = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '}') return { ok: false, reason: `unmatched } at ${i}` };
    if (c !== '{') {
      lit += c;
      continue;
    }
    const end = raw.indexOf('}', i);
    if (end < 0) return { ok: false, reason: `unclosed { at ${i}` };
    const name = raw.slice(i + 1, end);
    if (!PARAM_RE.test(name))
      return { ok: false, reason: `invalid parameter name "${name}"` };
    if (lit !== '') parts.push(lit);
    else if (parts.length > 0 && typeof parts[parts.length - 1] !== 'string') {
      return { ok: false, reason: 'adjacent parameters' };
    }
    lit = '';
    parts.push({ param: name });
    if (!params.includes(name)) params.push(name);
    i = end;
  }
  if (lit !== '') parts.push(lit);
  return { ok: true, value: { raw, parts, params } };
}

/** Thay mọi tham số bằng giá trị tương ứng. */
export function renderTemplate(
  t: Template,
  values: Readonly<Record<string, string>>,
): string {
  return t.parts
    .map((p) => (typeof p === 'string' ? p : (values[p.param] ?? '')))
    .join('');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * Regex neo hai đầu; mỗi tham số thành `([^.*#/+]+)`. Một tham số xuất hiện
 * nhiều lần thì các lần sau phải trùng giá trị lần đầu.
 */
export function templateRegex(t: Template): RegExp {
  const seen = new Map<string, number>();
  let group = 0;
  const body = t.parts
    .map((p) => {
      if (typeof p === 'string') return escapeRe(p);
      const prev = seen.get(p.param);
      if (prev !== undefined) return `\\${prev}`;
      seen.set(p.param, ++group);
      return '([^.*#/+]+)';
    })
    .join('');
  return new RegExp(`^${body}$`);
}

/** Tách giá trị tham số từ một tên; không khớp thì `null`. */
export function matchTemplate(
  t: Template,
  s: string,
): Record<string, string> | null {
  const m = templateRegex(t).exec(s);
  if (!m) return null;
  const out: Record<string, string> = {};
  t.params.forEach((p, i) => (out[p] = m[i + 1]));
  return out;
}
