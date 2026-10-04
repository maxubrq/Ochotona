export type SourceId = 'http.list' | 'http.stats' | 'prometheus' | 'snapshot';

export type Observed<T> =
  | { state: 'known';   value: T; source: SourceId; path: string; observedAt: string }
  | { state: 'unknown'; reason: UnknownReason; source: SourceId; path: string };

export type UnknownReason =
  | { kind: 'source_unavailable' }               // thống kê tắt, Prometheus đóng
  | { kind: 'forbidden'; status: 401 | 403 }      // user thiếu quyền
  | { kind: 'endpoint_missing'; status: 404 }     // phiên bản không có endpoint
  | { kind: 'field_absent' }                      // endpoint có, trường không có
  | { kind: 'model_mismatch' }                    // CLI tính khác broker
  | { kind: 'tie' }                               // hai policy cùng priority
  | { kind: 'regex_unsupported' }
  | { kind: 'error'; message: string };
