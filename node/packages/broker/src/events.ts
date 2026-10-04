import type {
  EndpointId,
  Instant,
  ReadSource,
  SourceState,
  Totals,
} from '@ochotona/model';

export type Sources = Readonly<Record<ReadSource, SourceState>>;

export type ReadEvent =
  | { type: 'phase'; phase: 'identify' | 'inventory' | 'close'; at: Instant }
  | {
      type: 'identified';
      version: string | null;
      nodes: number | null;
      totals: Totals | null;
      sources: Sources;
    }
  | { type: 'estimate'; requests: number; seconds: number }
  | { type: 'page'; endpoint: EndpointId; page: number; pageCount: number }
  | { type: 'throttle'; rps: number }
  | { type: 'retry'; endpoint: EndpointId; attempt: number; reason: string }
  | {
      type: 'warning';
      code: 'unpaginated_response' | 'retry_after' | 'slow_broker';
      detail: string;
    };

/** Gọi callback đồng bộ; lỗi ném từ callback bị nuốt để renderer hỏng không làm hỏng việc đọc. */
export function safeEmitter<T>(
  cb: ((e: T) => void) | undefined,
): (e: T) => void {
  if (!cb) return () => {};
  return (e) => {
    try {
      cb(e);
    } catch {
      // cố ý bỏ qua
    }
  };
}
