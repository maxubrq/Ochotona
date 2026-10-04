import '@ochotona/spec/i18n/en';
import '@ochotona/spec/i18n/vi';
import { describe, expect, it } from 'vitest';
import { type LocatedDiag, formatGnu, formatJson, loadOchoYaml } from '../src';
import { T0 } from './fixtures';

const text = [
  'spec: "0.4"',
  'broker: { min_version: "4.2" }',
  'flows:',
  '  billing.invoice.created:',
  '    family: billing',
  '    exchange: billing',
  '    tolerance: maybe',
  'topology:',
  '  queues:',
  '    - { name: q, durable: yes }',
  'waivers:',
  '  - { rule: T1, object: queue q, reason: x, by: max, until: "2026-01-01" }',
  '',
].join('\n');

function diags(t: string): readonly LocatedDiag[] {
  const r = loadOchoYaml(t, T0);
  if (r.ok) throw new Error('expected errors');
  return r.error;
}

describe('locate', () => {
  const ds = diags(text);

  it('gắn dòng, cột cho Y và YW, sắp theo dòng, cột, mã', () => {
    expect(ds.map((d) => [d.line, d.column, d.code, d.severity])).toEqual([
      [5, 5, 'Y4', 'error'],
      [7, 16, 'Y2', 'error'],
      [10, 27, 'Y2', 'error'],
      [10, 27, 'YW2', 'warning'],
      [12, 5, 'Y10', 'warning'],
    ]);
  });

  it('dạng GNU, tiếng Anh', () => {
    expect(ds.map((d) => formatGnu(d, 'en'))).toMatchInlineSnapshot(`
      [
        "ocho.yaml:5:5: error Y4 Flow billing.invoice.created does not have exactly one target: family, queue, or exchange.",
        "ocho.yaml:7:16: error Y2 Wrong type: expected strict | loose | undeclared.",
        "ocho.yaml:10:27: error Y2 Wrong type: expected boolean.",
        "ocho.yaml:10:27: warning YW2 YAML 1.2 reads yes as a string, not a boolean.",
        "ocho.yaml:12:5: warning Y10 The waiver for T1 expired on 2026-01-01 and no longer applies.",
      ]
    `);
  });

  it('dạng GNU, tiếng Việt', () => {
    expect(ds.map((d) => formatGnu(d, 'vi'))).toMatchInlineSnapshot(`
      [
        "ocho.yaml:5:5: error Y4 Luồng billing.invoice.created không có đúng một dạng đích: family, queue hoặc exchange.",
        "ocho.yaml:7:16: error Y2 Sai kiểu: cần strict | loose | undeclared.",
        "ocho.yaml:10:27: error Y2 Sai kiểu: cần boolean.",
        "ocho.yaml:10:27: warning YW2 YAML 1.2 đọc yes là chuỗi, không phải boolean.",
        "ocho.yaml:12:5: warning Y10 Waiver cho T1 đã hết hạn ngày 2026-01-01 và không còn hiệu lực.",
      ]
    `);
  });

  it('dạng JSON', () => {
    expect(formatJson(ds[0], 'en')).toEqual({
      file: 'ocho.yaml',
      line: 5,
      column: 5,
      endLine: 7,
      endColumn: 21,
      code: 'Y4',
      severity: 'error',
      message:
        'Flow billing.invoice.created does not have exactly one target: family, queue, or exchange.',
      path: ['flows', 'billing.invoice.created'],
    });
  });

  it('khoá bắt buộc bị thiếu trỏ về map cha', () => {
    const [y3, y1] = diags('spec: "0.4"\nbroker:\n  other: 1\n');
    expect(y3).toMatchObject({
      code: 'Y3',
      line: 3,
      column: 3,
      endLine: 3,
      endColumn: 11,
    });
    expect(y1).toMatchObject({ code: 'Y1', line: 3, column: 10 });
    const missing = diags('spec: "0.4"\nbroker: {}\n');
    expect(missing[0]).toMatchObject({
      code: 'Y3',
      line: 2,
      column: 9,
      path: ['broker', 'min_version'],
    });
  });

  it('mọi mã YP, YW, IM có văn bản hai thứ tiếng', () => {
    const cases: [string, Record<string, string | number>][] = [
      ['YP1', { reason: 'x' }],
      ['YP2', { key: 'a' }],
      ['YP3', {}],
      ['YP4', { feature: 'alias *x' }],
      ['YP5', { value: '9007199254740993' }],
      ['YP6', { size: 6, limit: 5 }],
      ['YW1', { value: '017', decimal: '17' }],
      ['YW2', { value: 'yes' }],
      ['IM1', { step: 5, count: 2 }],
      ['IM2', { reason: 'x' }],
    ];
    for (const [code, params] of cases)
      for (const lang of ['en', 'vi'] as const) {
        const d = {
          file: 'f',
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 1,
          code,
          severity: 'error' as const,
          path: [],
          params,
        };
        expect(formatGnu(d, lang)).toMatch(
          new RegExp(`^f:1:1: error ${code} \\S`),
        );
      }
  });

  it('chẩn đoán cú pháp đi qua loadOchoYaml', () => {
    expect(diags('a: 1\na: 2\n').map((d) => formatGnu(d, 'en'))).toEqual([
      'ocho.yaml:2:1: error YP2 Key a appears twice in the same map.',
    ]);
  });
});
