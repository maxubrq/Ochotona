import { readFileSync, writeFileSync } from 'node:fs';
import { refKey, refLabel } from '@ochotona/model';
import { rules } from '@ochotona/spec';
import { describe, expect, it } from 'vitest';
import { runFixture } from '../fixtures/fixture';
import { unitFixtures } from '../fixtures/unit';
import type { RuleExample } from '../src/examples';
import { ruleExamples } from '../src';

const FILE = new URL('../src/gen/examples.ts', import.meta.url);

/** Ca `fail`, `near` đầu tiên của mỗi luật, chạy thật để lấy nhãn đối tượng. */
function generate(): Record<string, RuleExample[]> {
  const out: Record<string, RuleExample[]> = {};
  for (const { code } of rules) {
    out[code] = [];
    for (const kind of ['fail', 'near'] as const) {
      const f = unitFixtures.find((x) => x.rule === code && x.kind === kind);
      if (!f) continue;
      const e = f.expect[0];
      const { results } = runFixture(f, 'test');
      const hit = results.find(
        (r) => e.object === '*' || refKey(r.object) === e.object,
      );
      out[code].push({
        kind,
        title: f.title,
        object: hit ? refLabel(hit.object) : e.object,
        result: e.result,
        ...(e.severity ? { severity: e.severity } : {}),
        ...(e.variant ? { variant: e.variant } : {}),
      });
    }
  }
  return out;
}

function render(data: Record<string, RuleExample[]>): string {
  return [
    '// Sinh bởi `pnpm examples` từ fixtures/unit; đừng sửa tay.',
    "import type { RuleCode } from '@ochotona/spec';",
    "import type { RuleExample } from '../examples';",
    '',
    'export const EXAMPLES: Readonly<',
    '  Partial<Record<RuleCode, readonly RuleExample[]>>',
    `> = ${JSON.stringify(data, null, 2)};`,
    '',
  ].join('\n');
}

describe('ruleExamples', () => {
  it('src/gen/examples.ts khớp fixture (pnpm examples để sinh lại)', async () => {
    const data = generate();
    const prettier = await import('prettier');
    const options = await prettier.resolveConfig(FILE);
    const text = await prettier.format(render(data), {
      ...options,
      parser: 'typescript',
    });
    if (process.env.UPDATE_EXAMPLES) writeFileSync(FILE, text);
    expect(readFileSync(FILE, 'utf8')).toBe(text);
  });

  it('mỗi luật có một ca fail và một ca near', () => {
    for (const { code } of rules) {
      expect(ruleExamples(code).map((x) => x.kind)).toEqual(['fail', 'near']);
    }
    expect(ruleExamples('T2')[0]).toMatchObject({
      kind: 'fail',
      object: 'exchange orders',
      result: 'fail',
      severity: 'S3',
      variant: 'at_risk',
    });
  });
});
