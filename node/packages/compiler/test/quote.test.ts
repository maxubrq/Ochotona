import fc from 'fast-check';
import jsyaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { formatString, needsQuotes } from '../src';
import { formatNumber } from '../src/yaml/scalar';

/** Đọc lại bằng `yaml` (YAML 1.2) và `js-yaml` (đại diện YAML 1.1, GC29). */
function readBack(s: string): unknown[] {
  const f = formatString(s);
  const docs: [string, (o: Record<string, unknown>) => unknown][] = [
    [`v: ${f}\n`, (o) => o.v],
    [`${f}: v\n`, (o) => Object.keys(o)[0]],
    [`m: { a: ${f}, b: 1 }\n`, (o) => (o.m as { a: unknown }).a],
    [`l: [ ${f}, x ]\n`, (o) => (o.l as unknown[])[0]],
  ];
  return docs.flatMap(([d, pick]) => [
    pick(parse(d, { version: '1.2', schema: 'core' })),
    pick(jsyaml.load(d) as Record<string, unknown>),
  ]);
}

const AMBIGUOUS_WORDS = [
  'true',
  'false',
  'yes',
  'no',
  'on',
  'off',
  'y',
  'n',
  'null',
  '~',
];

/** Mọi kiểu hoa thường của một từ. */
const cases = (w: string): string[] =>
  [...Array(2 ** w.length).keys()].map((m) =>
    [...w].map((c, i) => (m & (1 << i) ? c.toUpperCase() : c)).join(''),
  );

describe('quy tắc trích dẫn', () => {
  it.each([
    ...AMBIGUOUS_WORDS.flatMap(cases),
    '',
    ' a',
    'a ',
    '017',
    '0x1F',
    '0o17',
    '0b101',
    '1_000',
    '1.5',
    '.5',
    '1.',
    '1e3',
    '-1',
    '+1',
    '1:20',
    '1:20.5',
    '.inf',
    '-.Inf',
    '.NaN',
    '2026-10-04',
    '2026-10-04T01:30:00Z',
    '2026-1-4 1:30:00',
    '-',
    '- a',
    '?',
    ':',
    ',a',
    '[a',
    ']',
    '{a',
    '}',
    '#a',
    '&a',
    '*a',
    '!a',
    '|',
    '>',
    "'a",
    '"a',
    '%a',
    '@a',
    '`a',
    'a: b',
    'a #b',
    'a:',
    'a,b',
    'a[b]',
    'a{b}',
    'request_{p1}_q',
    '<<',
    '=',
    'a\tb',
    'a\nb',
    '\u0000',
    '\u007f',
    '\u0085',
    '\u2028',
    '\ufeff',
    '\ufffe',
    '\uffff',
    '\ud800',
  ])('%j cần nháy và đọc lại đúng', (s) => {
    expect(needsQuotes(s)).toBe(true);
    for (const v of readBack(s)) expect(v).toBe(s);
  });

  it.each([
    'orders',
    'billing.invoice.created',
    'request_clamav_q',
    'a-b',
    '/',
    'direct:orders',
    'a#b',
    'x-queue-type',
    'hàng',
    '注文',
    '🐇',
    'yes2',
    'a:b',
    '3rd',
  ])('%j viết trơn', (s) => {
    expect(needsQuotes(s)).toBe(false);
    expect(formatString(s)).toBe(s);
    for (const v of readBack(s)) expect(v).toBe(s);
  });

  // Mỗi dạng mơ hồ một ca riêng, để bỏ hay nới một regex là có test đỏ.
  it.each([
    '+12',
    '1_000',
    '+1.5',
    '1.',
    '1e3',
    '1e+3',
    '1E-10',
    '1.5e10',
    '.5',
    '+.5',
    '-.5e3',
    '.5E10',
    '.5e+3',
    '.1_0',
    '0x1F',
    '+0x1F',
    '0o17',
    '+0o17',
    '0b101',
    '+0b101',
    '1:20',
    '+1:20',
    '1_0:20',
    '12:30',
    '1:5',
    '1:20:30',
    '1:20.55',
    '.inf',
    '+.inf',
    '.NaN',
    '2026-10-04',
    '2026-1-4',
    '2026-10-04T01:30:00Z',
    '2026-10-04t1',
    '2026-10-04 1:30',
    '<<',
    '=',
    'null',
    'NULL',
    '~',
  ])('%j là dạng không phải chuỗi ở YAML 1.2 hoặc 1.1', (s) => {
    expect(needsQuotes(s)).toBe(true);
  });

  it.each([
    'a0x1F',
    '0x1Fz',
    'a0o17',
    '0o17z',
    'a0b101',
    '0b101z',
    '0b2',
    'a1:20',
    '1:20b',
    '1:60',
    'x.inf',
    '.infx',
    'x.nan',
    '.nanx',
    'x2026-10-04',
    '2026-10-04x',
    '2026-10',
    'a<<',
    '<<a',
    'a=',
    '=a',
    'nullx',
    'xnull',
    'a~',
    'onx',
    'xon',
    '.5e',
    '.5x3',
    '.x',
    '1e',
    '1x',
    'e3',
    '1.5.5',
  ])('%j giống số, ngày, từ khoá nhưng vẫn viết trơn', (s) => {
    expect(needsQuotes(s)).toBe(false);
    for (const v of readBack(s)) expect(v).toBe(s);
  });

  it('formatNumber: -0 giữ dấu, số nguyên không an toàn ghi dạng mũ', () => {
    expect(formatNumber(-0)).toBe('-0');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(2 ** 53)).toBe('9.007199254740992e+15');
    expect(formatNumber(2 ** 53 - 1)).toBe('9007199254740991');
  });

  it('nháy kép dùng \\uXXXX cho ký tự điều khiển, giữ nguyên Unicode', () => {
    expect(formatString('a\nb')).toBe('"a\\u000ab"');
    expect(formatString('"x" \\')).toBe('"\\"x\\" \\\\"');
    expect(formatString(' hàng 🐇')).toBe('" hàng 🐇"');
  });

  it('property: mọi chuỗi ghi rồi đọc lại bằng hai thư viện đều ra chuỗi gốc', () => {
    const special = fc.constantFrom(
      ...AMBIGUOUS_WORDS.flatMap(cases),
      '-',
      '?',
      ':',
      ',',
      '[',
      ']',
      '{',
      '}',
      '#',
      '&',
      '*',
      '!',
      '|',
      '>',
      "'",
      '"',
      '%',
      '@',
      '`',
      ' ',
      '\t',
      '\n',
      '\r',
      '\u0000',
      '\u007f',
      '\u0085',
      '\u00a0',
      '\u2028',
      '\ufeff',
      '\ufffe',
      '\\',
      '0',
      '1',
      '.',
      '_',
      'e',
      'x',
      'o',
      'b',
      '+',
      '<<',
      '=',
      ': ',
      ' #',
      'T',
      'Z',
      '2026-10-04',
      'é',
      '注',
      '🐇',
    );
    const str = fc.oneof(
      fc.string({ unit: 'grapheme' }),
      fc.string({ unit: 'binary' }),
      fc.array(special, { maxLength: 6 }).map((xs) => xs.join('')),
      fc
        .tuple(fc.integer(), fc.constantFrom('', '.5', 'e3', ':30', '_0'))
        .map(([n, s]) => `${n}${s}`),
      fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
    );
    fc.assert(
      fc.property(str, (s) => {
        for (const v of readBack(s)) expect(v).toBe(s);
      }),
      { numRuns: 5000 },
    );
  });
});
