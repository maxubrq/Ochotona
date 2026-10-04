// Tầng tích hợp trên bản ghi thật. Không có bản ghi thì bỏ qua.
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  DEFAULT_CAPABILITY_TABLE,
  buildActual,
  parseVersion,
} from '@ochotona/model';
import { schemas } from '@ochotona/spec';
import '@ochotona/spec/i18n/en';
import { recordedCases } from '../fixtures/integration/recorded';
import { makeCtx } from '../src/ctx';
import { runRules } from '../src/engine';
import { toFinding } from '../src/finding';
import { selectRules } from '../src/select';
import { mismatches } from './match';
import { loadRecording, recordings } from './recorded-helpers';

const recs = recordings();
const ajv = new Ajv2020({ strict: true, strictRequired: false });
addFormats.default(ajv);
const validate = ajv.compile(schemas.finding1);

function runOn(rec: string, targetVersion: string | null) {
  const { raw, start, end } = loadRecording(rec);
  const actual = buildActual(raw, {
    contextName: 'recorded',
    readStartedAt: start,
    readFinishedAt: end,
    scope: { vhosts: 'all' },
    caps: DEFAULT_CAPABILITY_TABLE,
  });
  const ctx = makeCtx({
    actual,
    targetVersion: targetVersion ? parseVersion(targetVersion) : null,
    now: end,
  });
  return runRules(
    ctx,
    selectRules({
      targetVersion: targetVersion !== null,
      includeExperimental: true,
    }),
    {
      waivers: [],
      scope: { vhosts: 'all', flow: null },
      mode: 'production',
    },
  );
}

describe.skipIf(recs.length === 0)('mọi luật trên bản ghi thật', () => {
  for (const rec of recs) {
    it(`${rec}: no internal issue, every finding valid`, () => {
      for (const tv of [null, '4.2.0']) {
        const out = runOn(rec, tv);
        expect(out.internal).toEqual([]);
        for (const r of out.results)
          if (!validate(toFinding(r, 'en')))
            throw new Error(ajv.errorsText(validate.errors));
      }
    });
    for (const c of recordedCases.filter((c) => c.recordings(rec))) {
      it(`${rec}: ${c.rule} ${c.kind}: ${c.title}`, () => {
        const out = runOn(rec, c.targetVersion ?? null);
        const results = out.results.filter((r) => r.rule === c.rule);
        expect(mismatches(results, c.expect)).toEqual([]);
      });
    }
  }
});
