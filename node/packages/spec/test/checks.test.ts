import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import {
  type SpecData,
  compareCode,
  crossCheck,
  fromRaw,
  loadContracts,
  loadRaw,
  validateSchemas,
} from '../scripts/checks.ts';
import { generate } from '../scripts/codegen.ts';

const ROOT = join(import.meta.dirname, '..');
const raw = loadRaw(ROOT);
const data = fromRaw(raw);
const clone = (): SpecData => structuredClone(data);

describe('data/', () => {
  it('passes every schema', () => {
    expect(validateSchemas(ROOT, raw)).toEqual([]);
  });

  it('passes every cross-check', () => {
    expect(crossCheck(data)).toEqual([]);
  });

  it('has the v0.1 counts', () => {
    expect(data.rules).toHaveLength(22);
    expect(data.keys).toHaveLength(11);
    expect(data.capabilities).toHaveLength(4);
    expect(data.exclusions).toHaveLength(9);
    expect(data.blindSpots).toHaveLength(20);
  });

  it('src/gen matches data/ (no hand edits, codegen was run)', async () => {
    const files = generate(data, loadContracts(ROOT));
    const options =
      (await prettier.resolveConfig(join(ROOT, 'src/gen/x.ts'))) ?? {};
    for (const [f, src] of Object.entries(files)) {
      const expected = await prettier.format(src, {
        ...options,
        parser: 'typescript',
      });
      expect(readFileSync(join(ROOT, 'src/gen', f), 'utf8'), f).toBe(expected);
    }
  });
});

describe('compareCode', () => {
  it('sorts by prefix, then numerically', () => {
    const xs = ['CL10', 'C2', 'CL2', 'CT-01', 'C1', 'CX1'];
    expect([...xs].sort(compareCode)).toEqual([
      'C1',
      'C2',
      'CL2',
      'CL10',
      'CT-01',
      'CX1',
    ]);
  });
});

// Mỗi ca làm hỏng dữ liệu theo đúng một cách và đòi đúng loại lỗi.
const broken: [string, (d: SpecData) => void, RegExp][] = [
  [
    'duplicate code',
    (d) => d.codes.splice(1, 0, { ...d.codes[0] }),
    /duplicate code A1/,
  ],
  ['codes not sorted', (d) => d.codes.reverse(), /codes\.json: not sorted/],
  [
    'tool prefix with spec-core owner',
    (d) => (d.codes.find((c) => c.code === 'VT1')!.owner = 'spec-core'),
    /VT1 must have owner tool/,
  ],
  [
    'unknown prefix',
    (d) =>
      d.codes.push({
        code: 'ZZ1',
        owner: 'tool',
        kind: 'diagnostic',
        meaning: 'x',
        status: 'active',
      }),
    /unknown prefix ZZ/,
  ],
  [
    'enforces a tool code',
    (d) => (d.codes.find((c) => c.code === 'VT2')!.enforces = 'DX1'),
    /enforces DX1/,
  ],
  [
    'rule not registered',
    (d) => (d.codes = d.codes.filter((c) => c.code !== 'T2')),
    /T2 is not registered/,
  ],
  [
    'assumption not registered',
    (d) => (d.keys[0].assumption = 'GC99'),
    /GC99 is not registered/,
  ],
  [
    'blind spot rule missing',
    (d) => (d.blindSpots[0].rules = ['T99']),
    /rule T99 does not exist/,
  ],
  ['blind spot gap', (d) => d.blindSpots.splice(3, 1), /expected LE4/],
  [
    'tier not highest severity',
    (d) => (d.rules.find((r) => r.code === 'T2')!.tier = 3),
    /tier 3 differs/,
  ],
  [
    'specRef wrong version',
    (d) => (d.rules.find((r) => r.code === 'T2')!.specRef = 'spec/0.3#T2'),
    /must point to spec\/0\.4/,
  ],
  [
    'family differs from prefix',
    (d) => (d.rules.find((r) => r.code === 'T2')!.family = 'R'),
    /family R differs/,
  ],
  [
    'missing vi text',
    (d) => delete d.i18n.vi['rule.T2.next'],
    /vi\.json: missing rule\.T2\.next/,
  ],
  [
    'missing diag text',
    (d) => delete d.i18n.en['diag.CX3.next'],
    /en\.json: missing diag\.CX3\.next/,
  ],
  [
    'variant text in one language only',
    (d) => (d.i18n.en['rule.T2.what.extra'] = 'Dropped {count} since {since}.'),
    /vi\.json: missing variant rule\.T2\.what\.extra/,
  ],
  [
    'variant uses an undeclared param',
    (d) => {
      d.i18n.en['rule.T4.what.loop'] = 'No limit {nope}.';
      d.i18n.vi['rule.T4.what.loop'] = 'Không giới hạn {nope}.';
    },
    /differ from rules\.json params/,
  ],
  [
    'fix template placeholder not declared',
    (d) => (d.fixTemplates[0].command = d.fixTemplates[0].command + ' {extra}'),
    /placeholders .* differ from params/,
  ],
  [
    'orphan text key',
    (d) => (d.i18n.en['rule.ZZ9.title'] = 'x'),
    /does not belong/,
  ],
  [
    'param differs between en and vi',
    (d) => (d.i18n.vi['rule.T5.what'] = 'Dead-letter strategy là {strategy}.'),
    /parameters differ between en/,
  ],
  [
    'param differs from rules.json',
    (d) => (d.rules.find((r) => r.code === 'T5')!.params.extra = 'string'),
    /differ from rules\.json params/,
  ],
  [
    'action without objects',
    (d) => (d.i18n.en['rule.T2.action'] = 'Add an alternate exchange'),
    /must contain \{objects\}/,
  ],
  [
    'plural param not a number',
    (d) => (d.rules.find((r) => r.code === 'T2')!.params.count = 'string'),
    /plural parameter count must be declared number/,
  ],
  [
    'title too long',
    (d) => (d.i18n.en['rule.T2.title'] = 'x'.repeat(61)),
    /title has 61 characters/,
  ],
  [
    'mechanism too long',
    (d) => (d.i18n.vi['rule.T2.mechanism'] = 'x'.repeat(201)),
    /mechanism has 201 characters/,
  ],
  [
    'dataSafety without answer',
    (d) =>
      (d.i18n.en['rule.T2.dataSafety'] =
        'Those messages are gone, and {exchanges} can drop more.'),
    /must start with/,
  ],
  [
    'en and vi answer differently',
    (d) => (d.i18n.vi['rule.T2.dataSafety'] = 'Có. {exchanges}.'),
    /different answers/,
  ],
  [
    'literal brace',
    (d) => (d.i18n.en['diag.Y1.message'] = 'Unknown key {key} }.'),
    /literal "\}"/,
  ],
  [
    'select is not supported',
    (d) => (d.i18n.en['diag.Y1.message'] = '{key, select, a {x} other {y}}'),
    /only plural/,
  ],
  [
    'vi plural with one',
    (d) =>
      (d.i18n.vi['rule.DX1.what'] =
        'Queue giữ {ready, plural, one {# a} other {# b}}.'),
    /must use exactly other/,
  ],
  [
    'en plural without one',
    (d) =>
      (d.i18n.en['rule.DX1.what'] =
        'Queue holds {ready, plural, other {# b}}.'),
    /must use exactly one, other/,
  ],
  [
    'degree adjective',
    (d) => (d.i18n.en['rule.T3.next'] = 'Fix this critical overflow.'),
    /degree adjective "critical"/,
  ],
  [
    'blaming wording',
    (d) => (d.i18n.en['rule.T3.next'] = 'You forgot to set overflow.'),
    /blaming/,
  ],
  [
    'markdown',
    (d) => (d.i18n.en['rule.T3.next'] = 'Set `overflow` to reject-publish.'),
    /Markdown/,
  ],
  [
    'glossary term translated',
    (d) => (d.i18n.vi['rule.T3.title'] = 'Hàng đợi đầy sẽ bỏ message cũ nhất'),
    /translates the glossary term "queue"/,
  ],
  ['empty text', (d) => (d.i18n.en['rule.T3.next'] = ''), /is empty/],
  [
    'ranges overlap',
    (d) => (d.capabilities[1].from = '3.14.0'),
    /overlap or leave a gap/,
  ],
  [
    'first range not minSupported',
    (d) => (d.capabilities[0].from = '3.12.0'),
    /not broker\.minSupported/,
  ],
  ['last range closed', (d) => (d.capabilities[3].to = '5.0.0'), /open-ended/],
  [
    'duplicate argument',
    (d) => (d.keys[1].argument = d.keys[0].argument),
    /duplicate argument/,
  ],
  [
    'usedBy unknown rule',
    (d) => (d.keys[0].usedBy = ['T99']),
    /usedBy T99 is not a rule/,
  ],
  [
    'match key on wrong kind',
    (d) => (d.exclusions[0].match = { queueEquals: 'x' }),
    /does not apply to exchange/,
  ],
];

describe('cross-checks catch broken data', () => {
  it.each(broken)('%s', (_name, mutate, expected) => {
    const d = clone();
    mutate(d);
    const errors = crossCheck(d);
    expect(errors.join('\n')).toMatch(expected);
  });
});
