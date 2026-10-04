// Sinh src/gen/*.ts từ data/. Chạy theo thứ tự, dừng ở bước lỗi đầu tiên:
//   1. kiểm từng file data/ với schema (Ajv strict)
//   2. kiểm chéo giữa các file
//   3. sinh src/gen/*.ts
//   4. định dạng bằng Prettier
// Chạy: node scripts/codegen.ts (Node ≥ 22.18, tự bỏ kiểu TypeScript).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import {
  type SpecData,
  crossCheck,
  fromRaw,
  loadContracts,
  loadRaw,
  validateSchemas,
} from './checks.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEN = join(ROOT, 'src', 'gen');
const HEADER = '// Sinh bởi scripts/codegen.ts từ data/. Không sửa tay.\n';

const lit = (v: unknown) => JSON.stringify(v);
const union = (xs: readonly string[]) =>
  xs.length ? xs.map(lit).join(' | ') : 'never';

export function generate(
  d: SpecData,
  contracts: Record<string, object>,
): Record<string, string> {
  const codesOf = (pred: (c: any) => boolean) =>
    d.codes.filter(pred).map((c) => c.code as string);
  const en = Object.keys(d.i18n.en);
  const files: Record<string, string> = {};

  files['spec.ts'] = `${HEADER}
import type { SeverityDef } from '../types';

export const SPEC_VERSION = ${lit(d.spec.spec)} as const;
export const CONTRACTS = ${lit(d.spec.contracts)} as const;
export const BROKER_SUPPORT = ${lit(d.spec.broker)} as const;

export type Severity = ${union(d.spec.severities.map((s: any) => s.level))};
export type Result = ${union(d.spec.results)};
export type Tolerance = ${union(d.spec.tolerances)};
export type ObjectKind = ${union(d.spec.objectKinds)};
export type ReasonKind = ${union(d.spec.reasonKinds)};
export type ExitCode = ${Object.keys(d.spec.exitCodes).join(' | ')};

export const SEVERITIES = ${lit(d.spec.severities)} as const satisfies readonly SeverityDef[];
export const RESULTS = ${lit(d.spec.results)} as const satisfies readonly Result[];
export const TOLERANCES = ${lit(d.spec.tolerances)} as const satisfies readonly Tolerance[];
export const OBJECT_KINDS = ${lit(d.spec.objectKinds)} as const satisfies readonly ObjectKind[];
export const REASON_KINDS = ${lit(d.spec.reasonKinds)} as const satisfies readonly ReasonKind[];
export const EXIT_CODES: Readonly<Record<ExitCode, string>> = ${lit(d.spec.exitCodes)};
export const DOCS_TEMPLATES = ${lit(d.spec.docs)} as const;
`;

  files['codes.ts'] = `${HEADER}
import type { CodeEntry } from '../types';

export type Code = ${union(codesOf(() => true))};
export type DiagCode = ${union(codesOf((c) => c.kind === 'diagnostic'))};
export type ExclusionCode = ${union(codesOf((c) => c.kind === 'exclusion'))};
export type AssumptionCode = ${union(codesOf((c) => c.kind === 'assumption' && c.owner === 'tool'))};
export type LessonErrorCode = ${union(codesOf((c) => c.kind === 'lesson-error'))};

export const CODES = ${lit(d.codes)} as const satisfies readonly CodeEntry[];
`;

  files['rules.ts'] = `${HEADER}
import type { RuleMeta } from '../types';

export type RuleCode = ${union(d.rules.map((r) => r.code))};

export const RULES = ${lit(d.rules)} as const satisfies readonly RuleMeta[];
`;

  files['capabilities.ts'] = `${HEADER}
import type { CapabilityRange } from '../types';

export const CAPABILITY_RANGES = ${lit(d.capabilities)} as const satisfies readonly CapabilityRange[];
`;

  files['keys.ts'] = `${HEADER}
import type { KeyDef } from '../types';

export type CanonicalKey = ${union(d.keys.map((k) => k.canonical))};

export const KEYS = ${lit(d.keys)} as const satisfies readonly KeyDef[];
`;

  files['exclusions.ts'] = `${HEADER}
import type { Exclusion } from '../types';

export const EXCLUSIONS = ${lit(d.exclusions)} as const satisfies readonly Exclusion[];
`;

  files['blind-spots.ts'] = `${HEADER}
import type { BlindSpot } from '../types';

export const BLIND_SPOTS = ${lit(d.blindSpots)} as const satisfies readonly BlindSpot[];
`;

  files['i18n-keys.ts'] = `${HEADER}
export type I18nKey = ${union(en)};
`;

  for (const lang of ['en', 'vi'] as const) {
    files[`messages-${lang}.ts`] = `${HEADER}
import type { I18nKey } from './i18n-keys';

export const messages: Readonly<Record<I18nKey, string>> = ${lit(d.i18n[lang])};
`;
  }

  const names = Object.keys(contracts);
  files['schemas.ts'] = `${HEADER}
export const SCHEMAS: { readonly ${names.map((n) => `${n}: object`).join('; readonly ')} } = ${lit(contracts)};
`;
  return files;
}

async function main() {
  const fail = (step: string, errors: string[]) => {
    console.error(`codegen: ${step} failed (${errors.length})`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  };

  const raw = loadRaw(ROOT);
  const schemaErrors = validateSchemas(ROOT, raw);
  if (schemaErrors.length) fail('schema validation', schemaErrors);

  const data = fromRaw(raw);
  const crossErrors = crossCheck(data);
  if (crossErrors.length) fail('cross-check', crossErrors);

  const files = generate(data, loadContracts(ROOT));
  const options = (await prettier.resolveConfig(join(GEN, 'x.ts'))) ?? {};
  mkdirSync(GEN, { recursive: true });
  for (const f of readdirSync(GEN)) if (!(f in files)) rmSync(join(GEN, f));
  for (const [f, src] of Object.entries(files)) {
    const out = await prettier.format(src, {
      ...options,
      parser: 'typescript',
    });
    writeFileSync(join(GEN, f), out);
  }
  console.log(`codegen: ${Object.keys(files).length} files in src/gen`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
