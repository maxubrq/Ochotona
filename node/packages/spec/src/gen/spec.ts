// Sinh bởi scripts/codegen.ts từ data/. Không sửa tay.

import type { SeverityDef } from '../types';

export const SPEC_VERSION = '0.4.0' as const;
export const CONTRACTS = {
  finding: 1,
  report: 1,
  snapshot: 1,
  ochoYaml: '0.1',
} as const;
export const BROKER_SUPPORT = {
  minSupported: '3.13.0',
  tested: ['3.13', '4.2', '4.3'],
} as const;

export type Severity = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
export type Result = 'fail' | 'pass' | 'not_checked' | 'not_applicable';
export type Tolerance = 'strict' | 'loose' | 'undeclared';
export type ObjectKind =
  | 'broker'
  | 'node'
  | 'vhost'
  | 'exchange'
  | 'queue'
  | 'binding'
  | 'policy'
  | 'operator_policy'
  | 'connection'
  | 'channel'
  | 'consumer'
  | 'flow'
  | 'family';
export type ReasonKind =
  | 'source_unavailable'
  | 'forbidden'
  | 'endpoint_missing'
  | 'field_absent'
  | 'model_mismatch'
  | 'tie'
  | 'regex_unsupported'
  | 'inconsistent_read'
  | 'depends_on'
  | 'error';
export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5 | 130;

export const SEVERITIES = [
  { level: 'S1', tier: 1, label: { en: 'DATA SAFETY', vi: 'AN TOÀN DỮ LIỆU' } },
  { level: 'S2', tier: 2, label: { en: 'SEMANTICS', vi: 'ĐÚNG NGỮ NGHĨA' } },
  { level: 'S3', tier: 3, label: { en: 'OPERABILITY', vi: 'VẬN HÀNH ĐƯỢC' } },
  { level: 'S4', tier: 4, label: { en: 'PERFORMANCE', vi: 'HIỆU NĂNG' } },
  { level: 'S5', tier: 5, label: { en: 'COST', vi: 'CHI PHÍ' } },
] as const satisfies readonly SeverityDef[];
export const RESULTS = [
  'fail',
  'pass',
  'not_checked',
  'not_applicable',
] as const satisfies readonly Result[];
export const TOLERANCES = [
  'strict',
  'loose',
  'undeclared',
] as const satisfies readonly Tolerance[];
export const OBJECT_KINDS = [
  'broker',
  'node',
  'vhost',
  'exchange',
  'queue',
  'binding',
  'policy',
  'operator_policy',
  'connection',
  'channel',
  'consumer',
  'flow',
  'family',
] as const satisfies readonly ObjectKind[];
export const REASON_KINDS = [
  'source_unavailable',
  'forbidden',
  'endpoint_missing',
  'field_absent',
  'model_mismatch',
  'tie',
  'regex_unsupported',
  'inconsistent_read',
  'depends_on',
  'error',
] as const satisfies readonly ReasonKind[];
export const EXIT_CODES: Readonly<Record<ExitCode, string>> = {
  '0': 'No fail and no not_checked at or above the --fail-on level',
  '1': 'At least one fail at or above the --fail-on level',
  '2': 'No fail, but a rule at or above the --fail-on level could not be checked',
  '3': 'Cannot connect to the broker, missing read permission, or unsupported broker version',
  '4': 'Invalid arguments',
  '5': 'Internal error in Ocho',
  '130': 'Interrupted with Ctrl-C',
};
export const DOCS_TEMPLATES = {
  spec: 'https://github.com/<org>/ochotona/blob/v{toolVersion}/docs/spec/{specVersion}.md#{anchor}',
  lesson:
    'https://github.com/<org>/ochotona/blob/v{toolVersion}/docs/lesson.md#{anchor}',
} as const;
