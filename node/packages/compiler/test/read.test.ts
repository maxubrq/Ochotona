import { describe, expect, it } from 'vitest';
import { MAX_BYTES, readOchoYaml } from '../src';

const codes = (t: string) => readOchoYaml(t).diagnostics.map((d) => d.code);

describe('readOchoYaml: chẩn đoán cú pháp', () => {
  it('YP1 lỗi cú pháp, có dòng và cột', () => {
    const r = readOchoYaml('spec: "0.4"\nflows: [\n');
    expect(r.value).toBeNull();
    expect(r.diagnostics[0].code).toBe('YP1');
    expect(r.diagnostics[0].pos.line).toBeGreaterThanOrEqual(2);
  });

  it('YP2 khoá trùng, kèm tên khoá', () => {
    const r = readOchoYaml('flows:\n  a: {}\n  "a": {}\n');
    expect(r.value).toBeNull();
    expect(r.diagnostics).toMatchObject([
      { code: 'YP2', params: { key: 'a' }, pos: { line: 3, column: 3 } },
    ]);
  });

  it('YP3 nhiều document', () => {
    expect(codes('spec: "0.4"\n---\nspec: "0.4"\n')).toEqual(['YP3']);
  });

  it.each([
    ['anchor', 'a: &x 1\n', 'anchor &x'],
    ['alias', 'a: &x 1\nb: *x\n', 'alias *x'],
    ['tag', 'a: !!str 1\n', 'tag tag:yaml.org,2002:str'],
    ['merge key', 'a:\n  <<: { b: 1 }\n', 'merge key <<'],
  ])('YP4 %s', (_, text, feature) => {
    const r = readOchoYaml(text);
    expect(r.value).toBeNull();
    expect(r.diagnostics.map((d) => d.params.feature)).toContain(feature);
  });

  it('YP4 chặn "billion laughs" trước khi mở rộng alias', () => {
    const lines = [
      'a: &a ["lol","lol","lol","lol","lol","lol","lol","lol","lol"]',
    ];
    for (let i = 1; i < 10; i++) {
      const p = String.fromCharCode(96 + i);
      const n = String.fromCharCode(97 + i);
      lines.push(`${n}: &${n} [${Array(9).fill(`*${p}`).join(',')}]`);
    }
    const start = Date.now();
    const r = readOchoYaml(lines.join('\n') + '\n');
    expect(Date.now() - start).toBeLessThan(1000);
    expect(r.value).toBeNull();
    expect(new Set(r.diagnostics.map((d) => d.code))).toEqual(new Set(['YP4']));
  });

  it('"<<" trong nháy là khoá thường', () => {
    expect(readOchoYaml('a:\n  "<<": 1\n').value).toEqual({ a: { '<<': 1 } });
  });

  it('YP5 số nguyên vượt MAX_SAFE_INTEGER', () => {
    const r = readOchoYaml('a: 9007199254740993\n');
    expect(r.diagnostics).toMatchObject([
      { code: 'YP5', params: { value: '9007199254740993' }, path: ['a'] },
    ]);
    expect(codes('a: "9007199254740993"\n')).toEqual([]);
    expect(codes('a: 9007199254740991\n')).toEqual([]);
  });

  it('YP6 file lớn hơn 5 MB, kể cả đúng ngưỡng', () => {
    const big = `a: "${'x'.repeat(MAX_BYTES)}"\n`;
    expect(codes(big)).toEqual(['YP6']);
    const exact = `a: "${'x'.repeat(MAX_BYTES - 6)}"\n`;
    expect(new TextEncoder().encode(exact).length).toBe(MAX_BYTES);
    expect(codes(exact)).toEqual([]);
  });

  it('YW1 số 0 ở đầu: cảnh báo, giá trị vẫn đọc', () => {
    const r = readOchoYaml('a: 017\nb: "017"\nc: 0\n');
    expect(r.value).toEqual({ a: 17, b: '017', c: 0 });
    expect(r.diagnostics).toMatchObject([
      {
        code: 'YW1',
        severity: 'warning',
        params: { value: '017', decimal: '17' },
      },
    ]);
  });

  it('YW2 chỉ ở chỗ schema đòi boolean, chỉ với chuỗi trơn', () => {
    const r = readOchoYaml(
      [
        'flows:',
        '  on: { tolerance: strict, queue: yes }',
        'topology:',
        '  queues:',
        '    - { name: q, durable: yes, auto_delete: "no" }',
        '  exchanges:',
        '    - { name: e, type: direct, internal: Off }',
        '',
      ].join('\n'),
    );
    expect(r.diagnostics.map((d) => [d.code, d.path])).toEqual([
      ['YW2', ['topology', 'queues', 0, 'durable']],
      ['YW2', ['topology', 'exchanges', 0, 'internal']],
    ]);
    expect(r.diagnostics[0].pos).toMatchObject({ line: 5, column: 27 });
  });

  it('file rỗng hoặc chỉ có chú thích: value null, không chẩn đoán', () => {
    expect(readOchoYaml('')).toMatchObject({ value: null, diagnostics: [] });
    expect(readOchoYaml('# x\n')).toMatchObject({
      value: null,
      diagnostics: [],
    });
  });
});

describe('readOchoYaml: bảng vị trí', () => {
  const text = [
    'spec: "0.4"',
    'flows:',
    '  billing.invoice.created:',
    '    exchange: billing',
    '    groups:',
    '      - email',
    '      - ledger',
    '    tolerance:',
    '',
  ].join('\n');
  const r = readOchoYaml(text);

  it('vị trí của giá trị ở đường dẫn lồng sâu', () => {
    expect(
      r.positions.get(['flows', 'billing.invoice.created', 'groups', 1]),
    ).toEqual({
      line: 7,
      column: 9,
      endLine: 7,
      endColumn: 15,
    });
    expect(
      r.positions.get(['flows', 'billing.invoice.created', 'exchange']),
    ).toMatchObject({
      line: 4,
      column: 15,
    });
  });

  it('giá trị vắng thì trỏ về khoá', () => {
    expect(
      r.positions.get(['flows', 'billing.invoice.created', 'tolerance']),
    ).toMatchObject({
      line: 8,
      column: 5,
    });
  });

  it('đường dẫn không có trong file trỏ về map cha', () => {
    expect(
      r.positions.nearest(['flows', 'billing.invoice.created', 'routing_key']),
    ).toEqual(r.positions.get(['flows', 'billing.invoice.created']));
    expect(r.positions.nearest(['broker', 'min_version'])).toEqual(
      r.positions.get([]),
    );
  });
});
