// Broker giả cỡ lớn cho test ngân sách: `queues` queue chia đều cho `vhosts`
// vhost, mỗi queue một binding từ một trong `exchanges` exchange topic.
// Endpoint phân trang tôn trọng `page`, `page_size`.
import {
  type MockRoute,
  type MockServer,
  overviewBody,
  pageBody,
  startMock,
} from '../../broker/tools/mock-mgmt.ts';

export interface BigBroker {
  readonly queues: number;
  readonly exchanges: number;
  readonly vhosts: number;
}

export function startBigBroker(o: BigBroker): Promise<MockServer> {
  const vhosts = Array.from({ length: o.vhosts }, (_, i) => `v${i}`);
  const pad = (n: number) => String(n).padStart(5, '0');
  const exchanges = Array.from({ length: o.exchanges }, (_, i) => ({
    vhost: vhosts[i % o.vhosts],
    name: `x-${pad(i)}`,
    type: 'topic',
    durable: true,
    auto_delete: false,
    internal: false,
    arguments: {},
  }));
  const queues = Array.from({ length: o.queues }, (_, i) => ({
    vhost: vhosts[i % o.vhosts],
    name: `q-${pad(i)}`,
    type: i % 2 ? 'quorum' : 'classic',
    durable: true,
    auto_delete: false,
    exclusive: false,
    arguments: i % 2 ? { 'x-queue-type': 'quorum' } : {},
    policy: null,
    operator_policy: null,
    effective_policy_definition: {},
    node: 'rabbit@big',
    members: i % 2 ? ['rabbit@big'] : undefined,
    consumers: 0,
    messages_ready: 0,
    messages_unacknowledged: 0,
  }));
  // Queue thứ i nằm ở vhost i % vhosts; exchange nguồn cùng vhost, xoay vòng.
  const perVhost = o.exchanges / o.vhosts;
  const bindings = queues.map((q, i) => ({
    vhost: q.vhost,
    source:
      exchanges[
        (i % o.vhosts) + o.vhosts * (Math.floor(i / o.vhosts) % perVhost)
      ].name,
    destination: q.name,
    destination_type: 'queue',
    routing_key: `${q.name}.#`,
    arguments: {},
  }));
  const paged =
    <T>(items: T[]) =>
    (r: { query: URLSearchParams }): { json: unknown } => {
      const page = Number(r.query.get('page') ?? 1);
      const size = Number(r.query.get('page_size') ?? 100);
      const count = Math.max(1, Math.ceil(items.length / size));
      return {
        json: {
          ...pageBody(
            items.slice((page - 1) * size, page * size),
            page,
            count,
            items.length,
          ),
          page_size: size,
        },
      };
    };
  const routes: Record<string, MockRoute> = {
    '/api/overview': {
      json: overviewBody({
        totals: { queues: o.queues, exchanges: o.exchanges },
      }),
    },
    '/api/whoami': { json: { name: 'ocho-doctor', tags: ['monitoring'] } },
    '/api/feature-flags': { json: [] },
    '/api/nodes': {
      json: [
        {
          name: 'rabbit@big',
          running: true,
          uptime: 100_000,
          mem_limit: 8e9,
          disk_free_limit: 8e9,
          applications: [{ name: 'rabbit', version: '4.2.1' }],
        },
      ],
    },
    '/api/vhosts': { json: vhosts.map((name) => ({ name })) },
    '/api/policies': { json: [] },
    '/api/operator-policies': { json: [] },
    '/api/deprecated-features/used': { json: [] },
    '/api/exchanges': paged(exchanges),
    '/api/queues': paged(queues),
    '/api/bindings': { json: bindings },
    '/api/connections': paged([]),
    '/api/channels': paged([]),
    '/api/consumers': { json: [] },
    '/metrics': { text: '' },
  };
  for (const v of vhosts) {
    const e = encodeURIComponent(v);
    routes[`/api/bindings/${e}`] = {
      json: bindings.filter((b) => b.vhost === v),
    };
    routes[`/api/consumers/${e}`] = { json: [] };
    routes[`/api/policies/${e}`] = { json: [] };
    routes[`/api/operator-policies/${e}`] = { json: [] };
  }
  for (const q of queues) {
    const at = `${encodeURIComponent(q.vhost)}/${q.name}`;
    routes[`/api/queues/${at}`] = { json: q };
    routes[`/api/queues/${at}/bindings`] = {
      json: bindings.filter((b) => b.destination === q.name),
    };
  }
  return startMock(routes);
}
