// @ochotona/broker: gói duy nhất của Ocho nói chuyện với broker qua mạng.
// Chỉ GET; mọi lỗi mạng và HTTP thành dữ liệu (`RawResult`) hoặc mã CX.

export {
  createReader,
  estimateRead,
  DEFAULT_MAX_RPS,
  DEFAULT_CONCURRENCY,
} from './reader';
export type {
  BrokerReader,
  ReaderDeps,
  ReadOptions,
  IdentifyOutcome,
  IdentifyDiag,
  Identified,
  ReadOutcome,
} from './reader';
export { normalizeUrl, apiUrl, prometheusUrl } from './target';
export type { BrokerTarget, TargetError, NormalizedUrl } from './target';
export type { ReadEvent, Sources } from './events';
export { parseRetryAfter, backoffMs } from './retry';
export { pageCap, PAGE_SIZE } from './paginate';

// Kiểu kế hoạch đọc thuộc model; xuất lại để code gọi chỉ cần một import.
export { planRead } from '@ochotona/model';
export type {
  ReadPlan,
  EndpointRead,
  EndpointId,
  RawResponses,
  RawResult,
} from '@ochotona/model';
