import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { schemas } from '@ochotona/spec';
import '@ochotona/spec/i18n/en';
import '@ochotona/spec/i18n/vi';
import { runFixture } from '../fixtures/fixture';
import { unitFixtures } from '../fixtures/unit';
import { textKey, toFinding } from '../src/finding';

const ajv = new Ajv2020({
  strict: true,
  strictRequired: false,
  allErrors: true,
});
addFormats.default(ajv);
const validate = ajv.compile(schemas.finding1);

describe('toFinding', () => {
  it('passes finding:1 for every result of every fixture, in en and vi', () => {
    let n = 0;
    for (const f of unitFixtures) {
      for (const r of runFixture(f).results) {
        for (const lang of ['en', 'vi'] as const) {
          const finding = toFinding(r, lang);
          if (!validate(finding))
            throw new Error(
              `${f.rule} ${f.title} ${lang}: ${ajv.errorsText(validate.errors)}`,
            );
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(200);
  });

  it('uses the variant key when it exists, else the base key', () => {
    expect(textKey('T2', 'what', 'dropped_node')).toBe(
      'rule.T2.what.dropped_node',
    );
    expect(textKey('T2', 'what', 'dropped')).toBe('rule.T2.what');
    expect(textKey('T2', 'what')).toBe('rule.T2.what');
  });

  it('writes the text of a T2 drop and the reason of a not_checked', () => {
    const t2 = unitFixtures.find(
      (f) => f.rule === 'T2' && f.title.startsWith('cluster counter'),
    )!;
    const fail = toFinding(runFixture(t2).results[0], 'en');
    expect(fail.what).toBe(
      '7 unroutable messages were dropped since 2026-10-04T00:00:00.000Z.',
    );
    expect(fail.severity).toBe('S1');
    expect(fail.evidence?.some((e) => e.kind === 'observed' && e.since)).toBe(
      true,
    );

    const nc = unitFixtures.find(
      (f) => f.rule === 'T5' && f.title === 'policies cannot be read',
    )!;
    const f = toFinding(runFixture(nc).results[0], 'vi');
    expect(f.severity).toBe('S1');
    expect(f.notChecked).toEqual({
      reason: 'user không đọc được http:/api/policies (HTTP 403)',
      path: 'queue.effective',
      unlock: expect.any(String),
    });
  });
});
