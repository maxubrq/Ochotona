import { Dispatcher, EnvHttpProxyAgent, request } from 'undici';
import type { ConnectionOptions } from 'node:tls';

/** Trần mỗi response của management API. */
export const MAX_BODY_BYTES = 64 * 1024 * 1024;

/** Huỷ bởi người gọi. Không phải lỗi của broker. */
export class AbortedError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortedError';
  }
}

/** Quá thời gian tổng do transport tự đặt (ví dụ trần 2 giây của Prometheus). */
export class DeadlineError extends Error {
  readonly code = 'OCHO_DEADLINE';
  constructor(ms: number) {
    super(`no complete response within ${ms} ms`);
    this.name = 'DeadlineError';
  }
}

/**
 * Tầng thứ ba của CL1: interceptor chặn mọi method khác GET trước khi request
 * rời máy. Đây là lỗi lập trình nên ném, không biến thành dữ liệu.
 */
export const getOnly: Dispatcher.DispatcherComposeInterceptor =
  (dispatch) => (opts, handler) => {
    if (opts.method !== 'GET') {
      throw new Error(
        `@ochotona/broker: refusing ${String(opts.method)} request (CL1: read-only)`,
      );
    }
    return dispatch(opts, handler);
  };

export interface DispatcherConfig {
  readonly tls: ConnectionOptions;
  readonly connectMs: number;
  /** Số socket tối đa mỗi origin. */
  readonly connections: number;
}

/** Một dispatcher cho cả phiên: proxy theo biến môi trường, TLS, keep-alive 10 giây. */
export function createDispatcher(cfg: DispatcherConfig): Dispatcher {
  const connect = { ...cfg.tls, timeout: cfg.connectMs };
  return new EnvHttpProxyAgent({
    connect,
    requestTls: connect,
    connections: cfg.connections,
    keepAliveTimeout: 10_000,
    keepAliveMaxTimeout: 10_000,
    maxResponseSize: MAX_BODY_BYTES,
  });
}

export interface TransportConfig {
  readonly dispatcher: Dispatcher;
  readonly user: string;
  readonly password: string;
  readonly userAgent: string;
  readonly requestMs: number;
  /** Mili-giây đơn điệu đủ dùng để đo thời gian phản hồi. */
  readonly nowMs: () => number;
}

export interface GetRequest {
  readonly url: string;
  /** `json` gửi `Authorization`; `prometheus` không bao giờ gửi. */
  readonly kind: 'json' | 'prometheus';
  readonly maxBytes: number;
  /** Trần tổng cho cả request, tính cả body. */
  readonly deadlineMs?: number;
  readonly signal?: AbortSignal;
}

export type GetOutcome =
  | {
      readonly kind: 'response';
      readonly status: number;
      readonly headers: Readonly<Record<string, string | string[] | undefined>>;
      /** `null` khi body vượt `maxBytes`. */
      readonly body: Buffer | null;
      readonly bytes: number;
      readonly latencyMs: number;
    }
  | {
      readonly kind: 'error';
      readonly error: unknown;
      readonly latencyMs: number;
    };

export interface Transport {
  get(req: GetRequest): Promise<GetOutcome>;
}

/**
 * Hàm gửi request duy nhất của gói. Method viết cứng là GET và không có tham
 * số nào đổi được nó (tầng thứ hai của CL1). Header `Authorization` được tính
 * một lần và chỉ nằm trong closure này.
 */
export function createTransport(cfg: TransportConfig): Transport {
  const authorization = `Basic ${Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64')}`;
  const jsonHeaders = {
    authorization,
    accept: 'application/json',
    'user-agent': cfg.userAgent,
  };
  const promHeaders = {
    accept: 'text/plain;version=0.0.4',
    'user-agent': cfg.userAgent,
  };

  async function get(req: GetRequest): Promise<GetOutcome> {
    if (req.signal?.aborted) throw new AbortedError();
    const started = cfg.nowMs();
    const deadline =
      req.deadlineMs !== undefined ? new AbortController() : null;
    const timer = deadline
      ? setTimeout(
          () => deadline.abort(new DeadlineError(req.deadlineMs!)),
          req.deadlineMs,
        )
      : null;
    const signals = [req.signal, deadline?.signal].filter(
      (s): s is AbortSignal => s !== undefined,
    );
    const signal =
      signals.length === 0
        ? undefined
        : signals.length === 1
          ? signals[0]
          : AbortSignal.any(signals);
    try {
      const res = await request(req.url, {
        method: 'GET',
        headers: req.kind === 'json' ? jsonHeaders : promHeaders,
        dispatcher: cfg.dispatcher,
        signal,
        headersTimeout: cfg.requestMs,
        bodyTimeout: cfg.requestMs,
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      let tooLarge = false;
      for await (const chunk of res.body) {
        bytes += (chunk as Buffer).length;
        if (bytes > req.maxBytes) {
          tooLarge = true;
          res.body.destroy();
          break;
        }
        chunks.push(chunk as Buffer);
      }
      return {
        kind: 'response',
        status: res.statusCode,
        headers: res.headers,
        body: tooLarge ? null : Buffer.concat(chunks),
        bytes,
        latencyMs: cfg.nowMs() - started,
      };
    } catch (error) {
      if (req.signal?.aborted) throw new AbortedError();
      const err =
        deadline?.signal.aborted &&
        deadline.signal.reason instanceof DeadlineError
          ? deadline.signal.reason
          : error;
      return { kind: 'error', error: err, latencyMs: cfg.nowMs() - started };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return { get };
}
