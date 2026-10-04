export type SourceId = 'http.list' | 'http.stats' | 'prometheus' | 'snapshot';
export type Observed<T> = {
    state: 'known';
    value: T;
    source: SourceId;
    path: string;
    observedAt: string;
} | {
    state: 'unknown';
    reason: UnknownReason;
    source: SourceId;
    path: string;
};
export type UnknownReason = {
    kind: 'source_unavailable';
} | {
    kind: 'forbidden';
    status: 401 | 403;
} | {
    kind: 'endpoint_missing';
    status: 404;
} | {
    kind: 'field_absent';
} | {
    kind: 'model_mismatch';
} | {
    kind: 'tie';
} | {
    kind: 'regex_unsupported';
} | {
    kind: 'error';
    message: string;
};
