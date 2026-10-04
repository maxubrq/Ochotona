// @ochotona/spec: bản máy đọc được của spec lõi. Chỉ dữ liệu, kiểu sinh từ
// dữ liệu, và hàm tra cứu thuần. Văn bản i18n nạp riêng qua
// '@ochotona/spec/i18n/en' và '@ochotona/spec/i18n/vi'.

export { SPEC_VERSION, CONTRACTS, BROKER_SUPPORT } from './gen/spec';
export type {
  Severity,
  Result,
  Tolerance,
  ObjectKind,
  ReasonKind,
  ExitCode,
} from './gen/spec';
export type { RuleCode } from './gen/rules';
export type {
  Code,
  DiagCode,
  ExclusionCode,
  AssumptionCode,
  LessonErrorCode,
} from './gen/codes';
export type { CanonicalKey } from './gen/keys';
export type { I18nKey } from './gen/i18n-keys';
export type * from './types';

export { parseVersion, compareVersion, compatKey } from './version';
export {
  rules,
  rule,
  capabilityRanges,
  capabilitiesFor,
  defaultsFor,
  keys,
  keyByArgument,
  keyByPolicy,
  keyByCanonical,
  exclusions,
  exclusionsFor,
  fixTemplates,
  fixTemplate,
  codes,
  codeEntry,
  blindSpots,
  severities,
  exitCodes,
  schemas,
  docsUrl,
} from './lookup';
export { format, hasMessage, registerMessages } from './format';
export type { Messages } from './format';
