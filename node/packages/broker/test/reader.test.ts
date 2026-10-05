import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import {
  buildActual,
  DEFAULT_CAPABILITY_TABLE,
  planRead,
  type ReadPlan,
} from '@ochotona/model';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createReader,
  estimateRead,
  type BrokerReader,
  type BrokerTarget,
  type ReadEvent,
  type ReadOptions,
} from '../src/index';
import {
  brokerRoutes,
  overviewBody,
  pageBody,
  startMock,
  type MockServer,
} from '../tools/mock-mgmt';
import { findSecrets, TEST_PASSWORD, tracked } from './secrets';

const PASSWORD = TEST_PASSWORD;
const fast: ReadOptions = { maxRps: 20, concurrency: 2 };
const noJitter = { toolVersion: '0.1.0-test', random: () => 0 };

let mocks: MockServer[] = [];
let readers: BrokerReader[] = [];
afterEach(async () => {
  await Promise.all(readers.map((r) => r.close()));
  await Promise.all(mocks.map((m) => m.close()));
  mocks = [];
  readers = [];
});

async function mock(
  routes: Parameters<typeof startMock>[0],
  opts?: Parameters<typeof startMock>[1],
) {
  const m = await startMock(routes, opts);
  mocks.push(m);
  return m;
}

function reader(target: Partial<BrokerTarget> & { url: string }, deps = {}) {
  const r = createReader(
    {
      user: 'ocho',
      password: PASSWORD,
      prometheus: 'off',
      name: 'lab',
      ...target,
    },
    { ...noJitter, ...deps },
  );
  if (!r.ok) throw new Error(r.error.diag);
  readers.push(r.value);
  return tracked(r.value);
}

async function identifyOk(
  r: BrokerReader,
  plan: ReadPlan,
  opts: ReadOptions = fast,
) {
  const o = await r.identify(plan, opts);
  if (o.status !== 'ok') throw new Error(JSON.stringify(o));
  return o.identified;
}

describe('createReader', () => {
  it('URL sai trả CX4, CX10 mà không gửi request', () => {
    const a = createReader(
      { url: 'http://u:p@h', user: 'u', password: 'p' },
      noJitter,
    );
    expect(a).toMatchObject({ ok: false, error: { diag: 'CX4' } });
    const b = createReader(
      { url: 'amqp://h', user: 'u', password: 'p' },
      noJitter,
    );
    expect(b).toMatchObject({ ok: false, error: { diag: 'CX10' } });
  });
  it('maxRps, concurrency ngoài khoảng là lỗi lập trình', async () => {
    const m = await mock(brokerRoutes());
    const r = reader({ url: m.url });
    await expect(r.identify(planRead(), { maxRps: 0 })).rejects.toThrow(
      RangeError,
    );
    await expect(r.identify(planRead(), { concurrency: 5 })).rejects.toThrow(
      RangeError,
    );
  });
  it('gọi sau close là lỗi lập trình', async () => {
    const m = await mock(brokerRoutes());
    const r = reader({ url: m.url });
    await r.close();
    await expect(r.identify(planRead(), fast)).rejects.toThrow('closed');
  });
});

describe('identify và read trên broker giả', () => {
  it('đọc đủ, header đúng, raw dựng được Actual', async () => {
    const m = await mock(brokerRoutes());
    const r = reader({ url: `${m.url}/api/` });
    const plan = planRead();
    const id = await identifyOk(r, plan);
    expect(id.version).toMatchObject({ major: 4, minor: 2, patch: 1 });
    expect(id.capability?.status).toBe('supported');
    expect(id.sources).toEqual({
      'http.list': 'ok',
      'http.stats': 'ok',
      prometheus: 'not_attempted',
    });
    const out = await r.read(plan, id, fast);
    expect(out.status).toBe('complete');
    if (out.status !== 'complete') return;
    for (const [k, v] of Object.entries(out.raw)) {
      if (k === 'prometheus')
        expect(v).toEqual({ status: 'not_attempted', reason: 'off' });
      else expect(v.status, k).toBe('ok');
    }
    expect(out.readStartedAt <= out.readFinishedAt).toBe(true);

    // Mọi request là GET, đúng ba header.
    for (const q of m.requests) {
      expect(q.method).toBe('GET');
      expect(q.headers['user-agent']).toBe('ochotona/0.1.0-test (read-only)');
      expect(q.headers.accept).toBe('application/json');
      expect(q.headers.authorization).toBe(
        `Basic ${Buffer.from(`ocho:${PASSWORD}`).toString('base64')}`,
      );
    }
    // Tham số của kế hoạch.
    const q = m.requests.find((x) => x.path === '/api/queues')!;
    expect(q.query.get('page_size')).toBe('500');
    expect(q.query.get('sort')).toBe('name');
    expect(q.query.get('sort_reverse')).toBe('false');
    expect(q.query.get('columns')).toContain(
      'message_stats.publish_details.rate',
    );
    const ex = m.requests.find((x) => x.path === '/api/exchanges')!;
    expect(ex.query.get('disable_stats')).toBe('true');
    // ≤ 20 vhost: binding và consumer đọc theo vhost; pha đóng đọc lại overview.
    expect(m.requests.some((x) => x.path === '/api/bindings/%2F')).toBe(true);
    expect(m.requests.some((x) => x.path === '/api/bindings')).toBe(false);
    expect(m.requests.filter((x) => x.path === '/api/overview')).toHaveLength(
      2,
    );

    const actual = buildActual(out.raw, {
      contextName: 'lab',
      readStartedAt: out.readStartedAt,
      readFinishedAt: out.readFinishedAt,
      scope: plan.scope,
      caps: DEFAULT_CAPABILITY_TABLE,
    });
    expect(actual.queues.state).toBe('known');
    if (actual.queues.state === 'known')
      expect(actual.queues.value).toHaveLength(1);
  });

  it('/api/users chỉ đọc khi kế hoạch bật', async () => {
    const m = await mock({
      ...brokerRoutes(),
      '/api/users': { json: [{ name: 'app', tags: ['administrator'] }] },
    });
    const r = reader({ url: m.url });
    const off = await r.read(planRead(), await identifyOk(r, planRead()), fast);
    expect(off.status === 'complete' && 'users' in off.raw).toBe(false);
    expect(m.requests.some((x) => x.path === '/api/users')).toBe(false);
    const plan = planRead({ users: true });
    const on = await r.read(plan, await identifyOk(r, plan), fast);
    expect(on.status === 'complete' && on.raw.users?.status).toBe('ok');
  });

  it('thứ tự các pha và nhóm kiểm kê', async () => {
    const m = await mock(brokerRoutes());
    const r = reader({ url: m.url });
    const plan = planRead();
    const id = await identifyOk(r, plan, { ...fast, concurrency: 1 });
    await r.read(plan, id, { ...fast, concurrency: 1 });
    const paths = m.requests.map((x) => x.path);
    const idx = (p: string) => paths.indexOf(p);
    expect(idx('/api/vhosts')).toBeLessThan(idx('/api/exchanges'));
    expect(idx('/api/deprecated-features/used')).toBeLessThan(
      idx('/api/queues'),
    );
    expect(idx('/api/bindings/%2F')).toBeLessThan(idx('/api/connections'));
    expect(paths.at(-1)).toBe('/api/overview');
  });

  it('trên 20 vhost: binding và consumer đọc một lần', async () => {
    const vhosts = Array.from({ length: 21 }, (_, i) => `v${i}`);
    const m = await mock(brokerRoutes({ vhosts }));
    const r = reader({ url: m.url });
    const plan = planRead();
    const out = await r.read(plan, await identifyOk(r, plan), fast);
    expect(out.status).toBe('complete');
    expect(
      m.requests.filter((x) => x.path.startsWith('/api/bindings')),
    ).toHaveLength(1);
  });

  it('phạm vi --vhost dùng endpoint theo vhost', async () => {
    const routes = brokerRoutes({ vhosts: ['/', 'a b'] });
    const page = (r: { query: URLSearchParams }) => ({
      json: pageBody([], Number(r.query.get('page')), 0),
    });
    Object.assign(routes, {
      '/api/queues/a%20b': page,
      '/api/exchanges/a%20b': page,
      '/api/policies/a%20b': { json: [] },
      '/api/operator-policies/a%20b': { json: [] },
      '/api/vhosts/a%20b/connections': page,
      '/api/vhosts/a%20b/channels': page,
    });
    const m = await mock(routes);
    const r = reader({ url: m.url });
    const plan = planRead({ scope: { vhosts: ['a b'] } });
    const out = await r.read(plan, await identifyOk(r, plan), fast);
    expect(out.status).toBe('complete');
    if (out.status !== 'complete') return;
    expect(out.raw.queues.status).toBe('ok');
    expect(out.raw.bindings.status).toBe('ok');
    expect(m.requests.some((x) => x.path === '/api/queues')).toBe(false);
    expect(m.requests.some((x) => x.path === '/api/bindings/a%20b')).toBe(true);
  });

  it('phạm vi một đối tượng: 6 request, object gói thành mảng, 404 là rỗng', async () => {
    const routes = brokerRoutes();
    const queue = {
      vhost: '/',
      name: 'orders',
      type: 'quorum',
      durable: true,
      auto_delete: false,
      exclusive: false,
      arguments: { 'x-queue-type': 'quorum' },
    };
    Object.assign(routes, {
      '/api/policies/%2F': { json: [] },
      '/api/operator-policies/%2F': { json: [] },
      '/api/queues/%2F/orders': { json: queue },
      '/api/queues/%2F/orders/bindings': {
        json: [
          {
            vhost: '/',
            source: 'ex',
            destination: 'orders',
            destination_type: 'queue',
            routing_key: 'o.#',
            arguments: {},
          },
        ],
      },
    });
    const m = await mock(routes);
    const r = reader({ url: m.url });
    const plan = planRead({
      scope: { vhosts: ['/'], object: { kind: 'queue', name: 'orders' } },
    });
    const id = await identifyOk(r, plan);
    expect(id.estimate.requests).toBe(4);
    const out = await r.read(plan, id, fast);
    if (out.status !== 'complete') throw new Error(out.status);
    expect(m.requests).toHaveLength(6);
    expect(out.raw.totalsAtEnd).toEqual({ status: 'not_attempted' });
    expect(
      out.raw.queues.status === 'ok' && out.raw.queues.pages[0].body,
    ).toEqual([queue]);
    const actual = buildActual(out.raw, {
      contextName: 'lab',
      readStartedAt: out.readStartedAt,
      readFinishedAt: out.readFinishedAt,
      scope: plan.scope,
      caps: DEFAULT_CAPABILITY_TABLE,
    });
    // Binding trỏ tới exchange không đọc: không phải dangling_ref trong phạm vi này.
    expect(actual.anomalies).toEqual([]);
    expect(
      actual.bindings.state === 'known' && actual.bindings.value,
    ).toHaveLength(1);

    const gone = planRead({
      scope: { vhosts: ['/'], object: { kind: 'queue', name: 'nope' } },
    });
    const out2 = await r.read(gone, await identifyOk(r, gone), fast);
    if (out2.status !== 'complete') throw new Error(out2.status);
    expect(
      out2.raw.queues.status === 'ok' && out2.raw.queues.pages[0].body,
    ).toEqual([]);
    // 404 ở endpoint không phải một đối tượng vẫn là lỗi.
    expect(out2.raw.bindings.status).toBe('http_error');
  });

  it('endpoint phiên bản không có: not_attempted, không tốn request', async () => {
    const m = await mock(brokerRoutes());
    const r = reader({ url: m.url });
    const plan = planRead();
    const id = await identifyOk(r, plan);
    const noDeprecated = {
      ...id,
      capability:
        id.capability && id.capability.status !== 'unsupported'
          ? {
              ...id.capability,
              caps: {
                ...id.capability.caps,
                endpoints: {
                  ...id.capability.caps.endpoints,
                  deprecatedFeaturesUsed: false,
                },
              },
            }
          : id.capability,
    };
    const out = await r.read(plan, noDeprecated, fast);
    expect(out.status === 'complete' && out.raw.deprecatedUsed).toEqual({
      status: 'not_attempted',
      reason: 'capability',
    });
    expect(m.requests.some((x) => x.path.startsWith('/api/deprecated'))).toBe(
      false,
    );
  });
});

describe('lỗi ở pha nhận diện', () => {
  const overviewAs = async (reply: Parameters<typeof startMock>[0][string]) => {
    const m = await mock({ ...brokerRoutes(), '/api/overview': reply });
    return reader({ url: m.url }).identify(planRead(), fast);
  };
  it('401 → CX3, 403 → CX9', async () => {
    expect(await overviewAs({ status: 401 })).toMatchObject({
      status: 'failed',
      diag: 'CX3',
    });
    expect(await overviewAs({ status: 403 })).toMatchObject({
      status: 'failed',
      diag: 'CX9',
    });
  });
  it('body rác → CX1', async () => {
    expect(await overviewAs({ text: '<html>' })).toMatchObject({
      status: 'failed',
      diag: 'CX1',
      detail: 'HTTP 200 (parse_error)',
    });
  });
  it('phiên bản quá cũ → CX8', async () => {
    expect(
      await overviewAs({ json: overviewBody({ version: '3.12.14' }) }),
    ).toMatchObject({
      status: 'failed',
      diag: 'CX8',
    });
  });
  it('cổng đóng → CX1, thông báo đã che origin', async () => {
    const port = await new Promise<number>((resolve) => {
      const s = createServer().listen(0, '127.0.0.1', () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => resolve(p));
      });
    });
    const o = await reader({ url: `http://127.0.0.1:${port}` }).identify(
      planRead(),
      fast,
    );
    expect(o).toMatchObject({ status: 'failed', diag: 'CX1' });
    expect(JSON.stringify(o)).not.toContain(`127.0.0.1:${port}`);
  });
  it('chứng chỉ tự ký → CX2; có --ca thì qua', async () => {
    const key = readFileSync(
      new URL('./fixtures/selfsigned.key', import.meta.url),
      'utf8',
    );
    const cert = readFileSync(
      new URL('./fixtures/selfsigned.crt', import.meta.url),
      'utf8',
    );
    const m = await mock(brokerRoutes(), { tls: { key, cert } });
    expect(
      await reader({ url: m.url }).identify(planRead(), fast),
    ).toMatchObject({
      status: 'failed',
      diag: 'CX2',
    });
    const ok = await reader({ url: m.url, tls: { ca: cert } }).identify(
      planRead(),
      fast,
    );
    expect(ok.status).toBe('ok');
    const insecure = await reader({
      url: m.url,
      tls: { insecure: true },
    }).identify(planRead(), fast);
    expect(insecure.status).toBe('ok');
  });
});

describe('phát hiện nguồn', () => {
  it('http.stats cần cả message_stats và churn_rates', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ message_stats: {}, churn_rates: {} }, 'ok'],
      [{ message_stats: {} }, 'unavailable'],
      [{ churn_rates: {} }, 'unavailable'],
      [{}, 'unavailable'],
    ];
    for (const [extra, want] of cases) {
      const m = await mock({
        ...brokerRoutes(),
        '/api/overview': {
          json: { ...overviewBody({ stats: false }), ...extra },
        },
      });
      const id = await identifyOk(reader({ url: m.url }), planRead());
      expect(id.sources['http.stats'], JSON.stringify(extra)).toBe(want);
    }
  });

  it('Prometheus: 200, 401, body rác, quá 2 giây', async () => {
    const exposition =
      '# HELP rabbitmq_identity_info x\n# TYPE rabbitmq_identity_info gauge\n';
    const cases: [Parameters<typeof startMock>[0][string], string][] = [
      [{ text: exposition }, 'ok'],
      [{ status: 401, text: '' }, 'forbidden'],
      [{ status: 403, text: '' }, 'forbidden'],
      [{ text: '<html>not metrics</html>' }, 'unavailable'],
      [{ text: exposition, delayMs: 2300 }, 'unavailable'],
    ];
    for (const [reply, want] of cases) {
      const m = await mock({ ...brokerRoutes(), '/metrics': reply });
      const id = await identifyOk(
        reader({ url: m.url, prometheus: { url: `${m.url}/metrics` } }),
        planRead(),
      );
      expect(id.sources.prometheus).toBe(want);
      const req = m.requests.find((x) => x.path === '/metrics')!;
      expect(req.headers.authorization).toBeUndefined();
      expect(req.headers.accept).toBe('text/plain;version=0.0.4');
      if (want === 'ok') {
        expect(id.raw.prometheus).toMatchObject({
          status: 'ok',
          pages: [{ body: exposition }],
        });
      }
    }
  }, 15_000);
});

describe('phân trang', () => {
  const plan = planRead({ requires: new Set(['queues']) });

  it('page_count tăng giữa chừng: đọc đủ trang mới', async () => {
    const m = await mock({
      ...brokerRoutes(),
      '/api/queues': (r) => {
        const page = Number(r.query.get('page'));
        return {
          json: pageBody([{ name: `q${page}` }], page, page === 1 ? 2 : 3),
        };
      },
    });
    const r = reader({ url: m.url });
    const events: ReadEvent[] = [];
    const out = await r.read(plan, await identifyOk(r, plan), {
      ...fast,
      onEvent: (e) => events.push(e),
    });
    expect(
      out.status === 'complete' &&
        out.raw.queues.status === 'ok' &&
        out.raw.queues.pages,
    ).toHaveLength(3);
    expect(
      events
        .filter((e) => e.type === 'page' && e.endpoint === 'queues')
        .map((e) => e.type === 'page' && e.pageCount),
    ).toEqual([2, 3, 3]);
  });

  it('chạm trần an toàn: pagination_runaway', async () => {
    const m = await mock({
      ...brokerRoutes(),
      '/api/overview': { json: overviewBody({ totals: { queues: 10 } }) },
      '/api/queues': (r) => {
        const page = Number(r.query.get('page'));
        return { json: pageBody([], page, page + 1) };
      },
    });
    const r = reader({ url: m.url });
    const out = await r.read(plan, await identifyOk(r, plan), fast);
    expect(out.status === 'complete' && out.raw.queues).toEqual({
      status: 'http_error',
      code: 200,
      note: 'pagination_runaway',
    });
    // ceil(10 × 1,5 / 500) + 5 = 6 trang.
    expect(m.requests.filter((x) => x.path === '/api/queues')).toHaveLength(6);
  });

  it('endpoint phân trang trả mảng: một trang, kèm warning', async () => {
    const m = await mock({
      ...brokerRoutes(),
      '/api/queues': { json: [{ name: 'q' }] },
    });
    const r = reader({ url: m.url });
    const events: ReadEvent[] = [];
    const out = await r.read(plan, await identifyOk(r, plan), {
      ...fast,
      onEvent: (e) => events.push(e),
    });
    expect(
      out.status === 'complete' &&
        out.raw.queues.status === 'ok' &&
        out.raw.queues.pages,
    ).toHaveLength(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'warning',
        code: 'unpaginated_response',
      }),
    );
  });

  it('một trang hỏng sau ba lượt: cả endpoint hỏng, không giữ trang nào', async () => {
    const m = await mock({
      ...brokerRoutes(),
      '/api/queues': (r) => {
        const page = Number(r.query.get('page'));
        return page === 2
          ? { status: 503 }
          : { json: pageBody([{ name: 'q' }], page, 3) };
      },
    });
    const r = reader({ url: m.url });
    const out = await r.read(plan, await identifyOk(r, plan), fast);
    expect(out.status === 'complete' && out.raw.queues).toEqual({
      status: 'http_error',
      code: 503,
    });
    const pages = m.requests
      .filter((x) => x.path === '/api/queues')
      .map((x) => x.query.get('page'));
    expect(pages).toEqual(['1', '2', '2', '2']);
  });

  it('mất kết nối giữa chừng: thử lại rồi thành công', async () => {
    const m = await mock({
      ...brokerRoutes(),
      '/api/queues': (r) =>
        r.hit === 1
          ? { destroy: true }
          : { json: pageBody([], Number(r.query.get('page')), 1) },
    });
    const r = reader({ url: m.url });
    const events: ReadEvent[] = [];
    const out = await r.read(plan, await identifyOk(r, plan), {
      ...fast,
      onEvent: (e) => events.push(e),
    });
    expect(out.status === 'complete' && out.raw.queues.status).toBe('ok');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'retry', endpoint: 'queues' }),
    );
    expect(r.stats().retries).toBe(1);
  });
});

describe('huỷ', () => {
  it('huỷ trước và trong pha nhận diện', async () => {
    const m = await mock({
      ...brokerRoutes(),
      '/api/overview': { json: overviewBody(), delayMs: 300 },
    });
    const r = reader({ url: m.url });
    const ac = new AbortController();
    ac.abort();
    expect(
      await r.identify(planRead(), { ...fast, signal: ac.signal }),
    ).toEqual({ status: 'aborted' });
    expect(m.requests).toHaveLength(0);
    const ac2 = new AbortController();
    setTimeout(() => ac2.abort(), 50);
    expect(
      await r.identify(planRead(), { ...fast, signal: ac2.signal }),
    ).toEqual({ status: 'aborted' });
  });

  it('huỷ ở pha kiểm kê: aborted, mock không nhận thêm request', async () => {
    const ac = new AbortController();
    const m = await mock({
      ...brokerRoutes(),
      '/api/queues': () => {
        ac.abort();
        return { json: pageBody([], 1, 1), delayMs: 100 };
      },
    });
    const r = reader({ url: m.url });
    const plan = planRead();
    const id = await identifyOk(r, plan);
    const out = await r.read(plan, id, { ...fast, signal: ac.signal });
    expect(out).toMatchObject({
      status: 'aborted',
      pagesTotal: id.estimate.requests,
    });
    const count = m.requests.length;
    await new Promise((res) => setTimeout(res, 200));
    expect(m.requests.length).toBe(count);
    expect(m.requests.some((x) => x.path === '/api/connections')).toBe(false);
  });

  it('huỷ ở pha đóng', async () => {
    const ac = new AbortController();
    const m = await mock(brokerRoutes());
    const r = reader({ url: m.url });
    const plan = planRead();
    const id = await identifyOk(r, plan);
    const out = await r.read(plan, id, {
      ...fast,
      signal: ac.signal,
      onEvent: (e) => {
        if (e.type === 'phase' && e.phase === 'close') ac.abort();
      },
    });
    expect(out.status).toBe('aborted');
  });

  it('huỷ giữa lúc chờ backoff', async () => {
    const ac = new AbortController();
    const m = await mock({ ...brokerRoutes(), '/api/queues': { status: 503 } });
    const r = reader({ url: m.url }, { random: () => 0.99 });
    const plan = planRead({ requires: new Set(['queues']) });
    const id = await identifyOk(r, plan);
    const out = await r.read(plan, id, {
      ...fast,
      signal: ac.signal,
      onEvent: (e) => {
        if (e.type === 'retry') setTimeout(() => ac.abort(), 20);
      },
    });
    expect(out.status).toBe('aborted');
    expect(m.requests.filter((x) => x.path === '/api/queues')).toHaveLength(1);
  });
});

describe('sự kiện', () => {
  it('thứ tự phát; callback ném lỗi không ảnh hưởng việc đọc', async () => {
    const m = await mock(brokerRoutes());
    const r = reader({ url: m.url });
    const plan = planRead();
    const seen: string[] = [];
    const onEvent = (e: ReadEvent) => {
      seen.push(e.type === 'phase' ? `phase:${e.phase}` : e.type);
      throw new Error('renderer hỏng');
    };
    const id = await identifyOk(r, plan, { ...fast, onEvent });
    const out = await r.read(plan, id, { ...fast, onEvent });
    expect(out.status).toBe('complete');
    const firstOf = (s: string) => seen.indexOf(s);
    expect(seen[0]).toBe('phase:identify');
    expect(firstOf('identified')).toBeLessThan(firstOf('estimate'));
    expect(firstOf('estimate')).toBeLessThan(firstOf('phase:inventory'));
    expect(firstOf('phase:inventory')).toBeLessThan(firstOf('phase:close'));
    expect(seen.at(-1)).toBe('page');
  });
});

describe('ước tính', () => {
  it('broker giả 10.000 queue, 3 vhost', () => {
    const totals = {
      queues: 10_000,
      exchanges: 600,
      connections: 1200,
      channels: 2400,
      consumers: 3000,
    };
    // Mọi vhost: 4 endpoint phân trang theo tổng, 6 endpoint không phân trang, 1 pha đóng.
    const all = estimateRead(planRead(), totals, 5);
    expect(all.requests).toBe(20 + 2 + 3 + 5 + 6 + 1);
    expect(all.seconds).toBe(Math.ceil((37 / 5) * 1.2));
    // Ba vhost: endpoint theo vhost nhân ba; vhosts và deprecatedUsed đọc một lần.
    const three = estimateRead(
      planRead({ scope: { vhosts: ['a', 'b', 'c'] } }),
      totals,
      5,
    );
    expect(three.requests).toBe(20 + 3 + 3 + 5 + 3 * 4 + 2 + 1);
  });
});

describe('bí mật', () => {
  it('không có mật khẩu hay base64 trong log, sự kiện, lỗi, RawResponses', async () => {
    const m = await mock({
      ...brokerRoutes(),
      '/api/channels': (r) =>
        r.hit === 1 ? { destroy: true } : { json: pageBody([], 1, 1) },
      '/api/consumers/%2F': { status: 500 },
    });
    const r = reader({ url: m.url });
    const plan = planRead();
    const sink: unknown[] = [];
    const opts: ReadOptions = {
      ...fast,
      onEvent: (e) => sink.push(e),
      onDebug: (l) => sink.push(l),
    };
    const id = await identifyOk(r, plan, opts);
    sink.push(id, await r.read(plan, id, opts), r.stats());
    const closed = createReader(
      { url: 'http://127.0.0.1:1', user: 'ocho', password: PASSWORD },
      noJitter,
    );
    if (closed.ok) {
      sink.push(await closed.value.identify(planRead(), fast));
      await closed.value.close();
    }
    expect(
      sink.some((x) => typeof x === 'string' && x.startsWith('GET /api/')),
    ).toBe(true);
    expect(findSecrets(sink)).toEqual([]);
  });

  it('bộ quét bắt được bí mật cài vào (để hook toàn cục không xanh giả)', () => {
    const b64 = Buffer.from(`ocho:${PASSWORD}`).toString('base64');
    expect(findSecrets([{ detail: `x ${PASSWORD}` }])).toEqual([PASSWORD]);
    expect(findSecrets([new Error(`Basic ${b64}`)])).toEqual([b64]);
    expect(findSecrets(['Authorization: x'])).toEqual(['authorization']);
    expect(findSecrets([{ ok: true }])).toEqual([]);
  });
});
