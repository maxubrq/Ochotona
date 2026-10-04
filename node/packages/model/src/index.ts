// Đơn vị, giá trị, phiên bản
export * from './units';
export type { Diag } from './diag';

// Observed: known, unknown, isKnown, map, all, firstKnown, derive, rootReason, displayOr
export * from './observed';

// Định danh
export {
  refKey,
  refLabel,
  parseObjectSelector,
  stableJson,
  argsKey,
  compareStr,
} from './ref';
export type { ObjectRef, RefKind } from './ref';

// Kiểu dữ liệu
export * from './actual';
export * from './caps';
export type { RawResult, RawResponses } from './ingest/raw';

// Dựng
export { buildActual } from './build-actual';
export type { BuildContext } from './build-actual';
export * from './desired';
export { parseTemplate, renderTemplate, matchTemplate } from './template';
export type { Template } from './template';
export { buildFlowMap, combineTolerance } from './flow';
export type { FlowMap, FlowMembers } from './flow';
export { buildIndexes } from './indexes';
export type { Indexes } from './indexes';

// Giá trị hiệu lực
export {
  resolveEffective,
  EFFECTIVE_KEYS,
  canonicalArgKey,
  hasUnsupportedPcre,
} from './effective';
export type { EffectiveResolution, EffectiveTarget } from './effective';

// Topology
export * from './topology';

// Ảnh chụp
export { saveSnapshot, loadSnapshot, SNAPSHOT_SCHEMA } from './snapshot';
export type { SnapshotOptions, SnapshotError } from './snapshot';

// Bất biến
export { checkInvariants } from './invariants';
export type { Violation } from './invariants';
