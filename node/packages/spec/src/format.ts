// Điền khuôn câu i18n. Bảng văn bản không nằm trong entry chính: mỗi ngôn ngữ
// tự đăng ký khi import '@ochotona/spec/i18n/<lang>', để trình duyệt chỉ tải
// ngôn ngữ đang dùng.
import type { I18nKey } from './gen/i18n-keys';
import { type Part, parseTemplate } from './template';
import type { Lang } from './types';

// Gói chạy cả trong trình duyệt nên không dùng kiểu của Node hay DOM.
declare const console: { warn(message: string): void };

export type Messages = Readonly<Record<I18nKey, string>>;

const tables: Partial<Record<Lang, Messages>> = {};
const parsed = new Map<string, readonly Part[]>();
const pluralRules = new Map<Lang, Intl.PluralRules>();

/** Đăng ký bảng văn bản của một ngôn ngữ. Entry `i18n/<lang>` tự gọi hàm này. */
export function registerMessages(lang: Lang, messages: Messages): void {
  tables[lang] = messages;
  for (const k of [...parsed.keys()])
    if (k.startsWith(`${lang}\0`)) parsed.delete(k);
}

function partsOf(lang: Lang, key: string, template: string): readonly Part[] {
  const cacheKey = `${lang}\0${key}`;
  let parts = parsed.get(cacheKey);
  if (!parts) {
    const p = parseTemplate(template);
    if (!p.ok) throw new Error(`@ochotona/spec: ${lang} ${key}: ${p.error}`);
    parts = p.parts;
    parsed.set(cacheKey, parts);
  }
  return parts;
}

function pluralOf(lang: Lang, n: number): string {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(lang);
    pluralRules.set(lang, rules);
  }
  return rules.select(n);
}

/**
 * Khoá có trong bảng tiếng Anh, bảng gốc của mọi ngôn ngữ. Dùng để chọn khoá
 * theo biến thể (`rule.T2.what.dropped_node`) trước khi lùi về khoá gốc.
 */
export function hasMessage(key: string): key is I18nKey {
  return tables.en?.[key as I18nKey] !== undefined;
}

/**
 * Điền khuôn câu `key` của `lang` bằng `params`. Khoá vắng trong ngôn ngữ đã
 * chọn thì dùng tiếng Anh. Tham số thiếu thì ném lỗi; tham số thừa bị bỏ qua.
 * `fmtNumber` định dạng `#` trong cấu trúc số nhiều.
 * @example format('en', 'rule.T2.title', {}) // 'Unroutable messages are being dropped'
 */
export function format(
  lang: Lang,
  key: I18nKey,
  params: Readonly<Record<string, string | number>>,
  fmtNumber?: (n: number) => string,
): string {
  let used = lang;
  let template = tables[lang]?.[key];
  if (template === undefined) {
    template = tables.en?.[key];
    if (template === undefined) {
      const missing = tables[lang] ? 'key' : 'messages';
      throw new Error(
        missing === 'key'
          ? `@ochotona/spec: unknown i18n key ${key}`
          : `@ochotona/spec: messages for "${lang}" are not loaded; import '@ochotona/spec/i18n/${lang}'`,
      );
    }
    if (lang !== 'en')
      console.warn(`@ochotona/spec: ${key} missing in ${lang}, using en`);
    used = 'en';
  }

  let out = '';
  for (const p of partsOf(used, key, template)) {
    if (p.t === 'text') {
      out += p.v;
      continue;
    }
    const v = params[p.name];
    if (v === undefined)
      throw new Error(`@ochotona/spec: ${key} needs parameter ${p.name}`);
    if (p.t === 'arg') {
      out += String(v);
      continue;
    }
    if (typeof v !== 'number')
      throw new Error(
        `@ochotona/spec: ${key} parameter ${p.name} must be a number`,
      );
    const cat = pluralOf(used, v);
    const branch = (cat === 'one' && p.branches.one) || p.branches.other!;
    for (const b of branch)
      out += b.t === 'hash' ? (fmtNumber ? fmtNumber(v) : String(v)) : b.v;
  }
  return out;
}
