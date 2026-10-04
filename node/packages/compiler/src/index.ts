// @ochotona/compiler: mọi thứ nằm giữa file ocho.yaml và model. Đọc, ghi YAML
// tất định; suy luồng và họ topology; phiên import; tự kiểm vòng tròn.

// YAML
export { readOchoYaml } from './yaml/read';
export { writeOchoYaml, HEADER_NOTE } from './yaml/write';
export type { WriteOptions, WriteHeader } from './yaml/write';
export { loadOchoYaml } from './yaml/load';
export { needsQuotes, formatString, MAX_BYTES } from './yaml/scalar';

// Suy luận
export { inferFlows } from './infer/flows';
export type { FlowCandidate, Unmanaged, UnmanagedReason } from './infer/flows';
export { inferFamilies, tokenize, DEFAULT_PARAM } from './infer/families';
export type { FamilyProposal } from './infer/families';

// Import
export { createImportSession } from './import/session';
export type {
  Answer,
  AnswerError,
  ExistingFile,
  ImportError,
  ImportInput,
  ImportResult,
  ImportSession,
  ImportSummary,
  ImportWarning,
  Question,
} from './import/session';
export { roundTrip, defaultSchemaUrl } from './import/roundtrip';
export type { RoundTripError, RoundTripStep } from './import/roundtrip';
export { formatChange } from './import/merge';

// Chẩn đoán
export { locate, formatGnu, formatJson, messageOf, severityOf } from './locate';

export type {
  AnyDiag,
  DiagSeverity,
  LocatedDiag,
  OchoComment,
  Path,
  Position,
  PositionMap,
  YamlCode,
  YamlDiag,
} from './types';
