// Management API giả lập trong tiến trình, cho test của @ochotona/broker.
// Trả response theo kịch bản cho từng đường dẫn: độ trễ, mã lỗi, đóng socket,
// chứng chỉ tự ký.

import { createServer as createHttp } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer as createHttps } from 'node:https';
import type { AddressInfo } from 'node:net';

export interface MockRequest {
  readonly method: string;
  /** Đường dẫn thô, chưa decode: `/api/queues/%2F`. */
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: IncomingMessage['headers'];
  /** Lần gọi thứ mấy tới đường dẫn này, bắt đầu từ 1. */
  readonly hit: number;
}

export interface MockReply {
  readonly status?: number;
  readonly json?: unknown;
  readonly text?: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Chờ trước khi gửi header. */
  readonly delayMs?: number;
  /** Đóng socket thay vì trả lời. */
  readonly destroy?: boolean;
}

export type MockRoute =
  MockReply | ((req: MockRequest) => MockReply | Promise<MockReply>);

export interface MockServer {
  /** `http://127.0.0.1:<cổng>` hoặc `https://localhost:<cổng>`. */
  readonly url: string;
  readonly port: number;
  /** Mọi request đã nhận, theo thứ tự. */
  readonly requests: MockRequest[];
  routes: Record<string, MockRoute>;
  close(): Promise<void>;
}

export interface MockOptions {
  readonly tls?: { readonly key: string; readonly cert: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startMock(
  routes: Record<string, MockRoute>,
  opts: MockOptions = {},
): Promise<MockServer> {
  const requests: MockRequest[] = [];
  const hits = new Map<string, number>();
  const sockets = new Set<import('node:net').Socket>();
  const state = { routes };

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const raw = req.url ?? '/';
    const q = raw.indexOf('?');
    const path = q === -1 ? raw : raw.slice(0, q);
    const hit = (hits.get(path) ?? 0) + 1;
    hits.set(path, hit);
    const r: MockRequest = {
      method: req.method ?? 'GET',
      path,
      query: new URLSearchParams(q === -1 ? '' : raw.slice(q + 1)),
      headers: req.headers,
      hit,
    };
    requests.push(r);
    const route = state.routes[path];
    const reply: MockReply =
      route === undefined
        ? {
            status: 404,
            json: { error: 'Object Not Found', reason: 'Not Found' },
          }
        : typeof route === 'function'
          ? await route(r)
          : route;
    if (reply.delayMs) await sleep(reply.delayMs);
    if (reply.destroy) {
      req.socket.destroy();
      return;
    }
    const isText = reply.text !== undefined;
    const body = isText ? reply.text! : JSON.stringify(reply.json ?? null);
    res.writeHead(reply.status ?? 200, {
      'content-type': isText ? 'text/plain; version=0.0.4' : 'application/json',
      ...reply.headers,
    });
    res.end(body);
  };

  const server: Server = opts.tls
    ? createHttps({ key: opts.tls.key, cert: opts.tls.cert }, handler)
    : createHttp(handler);
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const mock: MockServer = {
    url: opts.tls ? `https://localhost:${port}` : `http://127.0.0.1:${port}`,
    port,
    requests,
    get routes() {
      return state.routes;
    },
    set routes(r) {
      state.routes = r;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
  return mock;
}

/** Overview tối thiểu của một broker. */
export function overviewBody(
  opts: {
    version?: string;
    totals?: Partial<
      Record<
        'queues' | 'exchanges' | 'connections' | 'channels' | 'consumers',
        number
      >
    >;
    stats?: boolean;
  } = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    product_name: 'RabbitMQ',
    rabbitmq_version: opts.version ?? '4.2.1',
    cluster_name: 'rabbit@mock',
    object_totals: {
      queues: 0,
      exchanges: 0,
      connections: 0,
      channels: 0,
      consumers: 0,
      ...opts.totals,
    },
  };
  if (opts.stats ?? true) {
    body.message_stats = { publish: 0 };
    body.churn_rates = { connection_created: 0 };
  }
  return body;
}

/** Một trang của endpoint phân trang. */
export function pageBody(
  items: unknown[],
  page: number,
  pageCount: number,
  total?: number,
) {
  return {
    items,
    page,
    page_count: pageCount,
    page_size: 500,
    item_count: items.length,
    total_count: total ?? items.length,
    filtered_count: total ?? items.length,
  };
}

/** Kịch bản của một broker nhỏ, đủ mọi endpoint mà kế hoạch mặc định đọc. */
export function brokerRoutes(
  opts: { version?: string; stats?: boolean; vhosts?: string[] } = {},
): Record<string, MockRoute> {
  const vhosts = opts.vhosts ?? ['/'];
  const queues = vhosts.map((v) => ({
    vhost: v,
    name: 'orders',
    type: 'quorum',
    durable: true,
    auto_delete: false,
    exclusive: false,
    arguments: { 'x-queue-type': 'quorum' },
  }));
  const routes: Record<string, MockRoute> = {
    '/api/overview': {
      json: overviewBody({
        version: opts.version,
        stats: opts.stats,
        totals: { queues: queues.length, exchanges: 1 },
      }),
    },
    '/api/whoami': { json: { name: 'ocho', tags: ['monitoring'] } },
    '/api/feature-flags': { json: [{ name: 'khepri_db', state: 'disabled' }] },
    '/api/nodes': {
      json: [
        {
          name: 'rabbit@mock',
          running: true,
          uptime: 100_000,
          applications: [{ name: 'rabbit', version: opts.version ?? '4.2.1' }],
        },
      ],
    },
    '/api/vhosts': {
      json: vhosts.map((name) => ({ name, default_queue_type: 'classic' })),
    },
    '/api/policies': { json: [] },
    '/api/operator-policies': { json: [] },
    '/api/deprecated-features/used': { json: [] },
    '/api/exchanges': (r) => ({
      json: pageBody(
        [
          {
            vhost: '/',
            name: 'ex',
            type: 'topic',
            durable: true,
            auto_delete: false,
            internal: false,
            arguments: {},
          },
        ],
        Number(r.query.get('page')),
        1,
      ),
    }),
    '/api/queues': (r) => ({
      json: pageBody(queues, Number(r.query.get('page')), 1),
    }),
    '/api/bindings': { json: [] },
    '/api/connections': (r) => ({
      json: pageBody([], Number(r.query.get('page')), 0),
    }),
    '/api/channels': (r) => ({
      json: pageBody([], Number(r.query.get('page')), 0),
    }),
    '/api/consumers': { json: [] },
  };
  for (const v of vhosts) {
    const e = encodeURIComponent(v);
    routes[`/api/bindings/${e}`] = { json: [] };
    routes[`/api/consumers/${e}`] = { json: [] };
  }
  return routes;
}
