// Chữ giao diện riêng của CLI. Văn bản của luật, mã chẩn đoán và lý do
// `unknown` nằm ở @ochotona/spec; ở đây chỉ có nhãn, dòng tiến trình, trợ giúp.
//
// Khuôn câu: `{tên}`, và số nhiều `{n, plural, one {# queue} other {# queues}}`
// như @ochotona/spec. Số được định dạng theo ngôn ngữ (`1,240`, `1.240`).

import type { Lang } from '@ochotona/spec';
import en from './en.json';
import vi from './vi.json';

export type { Lang };

export const MESSAGES: Readonly<
  Record<Lang, Readonly<Record<string, string>>>
> = { en, vi };

export type Params = Readonly<Record<string, string | number>>;

const PLURAL = /\{(\w+), plural,(?: one \{([^{}]*)\})? other \{([^{}]*)\}\}/g;
const ARG = /\{(\w+)\}/g;
const numberFormats = new Map<Lang, Intl.NumberFormat>();
const pluralRules = new Map<Lang, Intl.PluralRules>();

/** `1240` → `1,240` (en) hoặc `1.240` (vi). */
export function fmtNumber(lang: Lang, n: number): string {
  let f = numberFormats.get(lang);
  if (!f) {
    f = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
    numberFormats.set(lang, f);
  }
  return f.format(n);
}

function plural(lang: Lang, n: number): string {
  let r = pluralRules.get(lang);
  if (!r) {
    r = new Intl.PluralRules(lang);
    pluralRules.set(lang, r);
  }
  return r.select(n);
}

/**
 * Điền khuôn câu `key`. Khoá vắng trong `lang` thì dùng tiếng Anh; vắng cả hai
 * hoặc thiếu tham số thì ném, vì đó là lỗi lập trình (test i18n bắt trước).
 * @example t('en', 'report.summary.rules', { count: 38 }) // '38 rules'
 */
export function t(lang: Lang, key: string, params: Params = {}): string {
  const template = MESSAGES[lang][key] ?? MESSAGES.en[key];
  if (template === undefined) throw new Error(`cli i18n: unknown key ${key}`);
  const value = (name: string): string | number => {
    const v = params[name];
    if (v === undefined)
      throw new Error(`cli i18n: ${key} needs parameter ${name}`);
    return v;
  };
  return template
    .replace(
      PLURAL,
      (_, name: string, one: string | undefined, other: string) => {
        const n = value(name);
        if (typeof n !== 'number')
          throw new Error(
            `cli i18n: ${key} parameter ${name} must be a number`,
          );
        const branch =
          one !== undefined && plural(lang, n) === 'one' ? one : other;
        return branch.replace(/#/g, fmtNumber(lang, n));
      },
    )
    .replace(ARG, (_, name: string) => {
      const v = value(name);
      return typeof v === 'number' ? fmtNumber(lang, v) : v;
    });
}

/**
 * Ngôn ngữ, theo thứ tự `--lang`, `OCHO_LANG`, `LC_ALL`, `LC_MESSAGES`, `LANG`.
 * Giá trị bắt đầu bằng `vi` là tiếng Việt, còn lại tiếng Anh.
 */
export function resolveLang(
  flag: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): Lang {
  const sources = [flag, env.OCHO_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG];
  const first = sources.find((s) => s !== undefined && s !== '');
  return first?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}
