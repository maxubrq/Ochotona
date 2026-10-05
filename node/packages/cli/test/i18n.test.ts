import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { textProblems } from '../../spec/scripts/checks.ts';
import { MESSAGES, fmtNumber, resolveLang, t } from '../src/i18n';

const glossary = JSON.parse(
  readFileSync(
    new URL('../../spec/data/i18n/glossary.json', import.meta.url),
    'utf8',
  ),
).terms;

// Tên tham số, bỏ chữ trong nhánh số nhiều (`one {broker}` không phải tham số).
const params = (s: string) =>
  [...s.replace(/ (one|other) \{[^{}]*\}/g, '').matchAll(/\{(\w+)/g)]
    .map((m) => m[1])
    .sort();

describe('CLI messages', () => {
  it('en and vi have the same keys', () => {
    expect(Object.keys(MESSAGES.vi).sort()).toEqual(
      Object.keys(MESSAGES.en).sort(),
    );
  });

  it('en and vi use the same parameters in every key', () => {
    for (const k of Object.keys(MESSAGES.en))
      expect([k, params(MESSAGES.vi[k])]).toEqual([k, params(MESSAGES.en[k])]);
  });

  it('writing rules of the spec package: plural forms, wording, glossary', () => {
    const problems: string[] = [];
    for (const lang of ['en', 'vi'] as const)
      for (const [k, v] of Object.entries(MESSAGES[lang]))
        for (const p of textProblems(lang, v, glossary))
          problems.push(`${lang} ${k}: ${p}`);
    expect(problems).toEqual([]);
    // Bộ kiểm thật sự bắt lỗi, để test không xanh giả.
    expect(textProblems('vi', 'Có {n} hàng đợi', glossary)).toHaveLength(1);
    expect(
      textProblems('vi', '{n, plural, one {# x} other {# x}}', glossary),
    ).toHaveLength(1);
  });

  it('every key formats with dummy parameters', () => {
    for (const lang of ['en', 'vi'] as const)
      for (const [k, v] of Object.entries(MESSAGES[lang])) {
        const p = Object.fromEntries(params(v).map((n) => [n, 2]));
        expect(() => t(lang, k, p)).not.toThrow();
      }
  });
});

describe('t', () => {
  it('fills parameters, numbers by language', () => {
    expect(t('en', 'report.summary.rules', { count: 1 })).toBe('1 rule');
    expect(t('en', 'report.summary.rules', { count: 38 })).toBe('38 rules');
    expect(t('vi', 'report.summary.rules', { count: 38 })).toBe('38 luật');
    expect(t('en', 'report.summary.fail', { count: 1240 })).toBe('1,240 fail');
    expect(t('vi', 'report.summary.fail', { count: 1240 })).toBe('1.240 fail');
  });

  it('throws on unknown keys and missing parameters', () => {
    expect(() => t('en', 'no.such.key')).toThrow(/unknown key/);
    expect(() => t('en', 'report.summary.fail')).toThrow(
      /needs parameter count/,
    );
    expect(() => t('en', 'report.summary.rules', { count: 'x' })).toThrow(
      /must be a number/,
    );
  });

  it('fmtNumber', () => {
    expect(fmtNumber('en', 1240)).toBe('1,240');
    expect(fmtNumber('vi', 1240)).toBe('1.240');
  });
});

describe('resolveLang', () => {
  it('--lang, OCHO_LANG, LC_ALL, LC_MESSAGES, LANG in that order', () => {
    expect(resolveLang('vi', { OCHO_LANG: 'en' })).toBe('vi');
    expect(resolveLang(undefined, { OCHO_LANG: 'vi_VN', LANG: 'en_US' })).toBe(
      'vi',
    );
    expect(resolveLang(undefined, { LC_ALL: 'en_US', LANG: 'vi_VN' })).toBe(
      'en',
    );
    expect(resolveLang(undefined, { LC_MESSAGES: 'vi', LANG: 'en' })).toBe(
      'vi',
    );
    expect(resolveLang(undefined, { LANG: 'vi_VN.UTF-8' })).toBe('vi');
    expect(resolveLang(undefined, { OCHO_LANG: '', LANG: 'vi' })).toBe('vi');
    expect(resolveLang(undefined, {})).toBe('en');
    expect(resolveLang('fr', {})).toBe('en');
  });
});
