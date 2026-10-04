import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { table } from '../tools/check-assumptions';
import { checkTree, leaks, makeRedactor, redactDir } from '../tools/redact-raw';

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'ocho-raw-'));
  dirs.push(d);
  return d;
}
const ok = (body: unknown) => ({
  status: 'ok',
  pages: [{ body, observedAt: '2026-10-04T00:00:00.000Z' }],
});
const write = (dir: string, f: string, v: unknown) =>
  writeFileSync(join(dir, f), typeof v === 'string' ? v : JSON.stringify(v));

describe('redact-raw', () => {
  const conn = {
    name: '10.0.0.7:51234 -> 10.0.0.1:5672',
    vhost: 'payments',
    user: 'svc-pay',
    peer_host: '10.0.0.7',
    client_properties: {
      product: 'RabbitMQ.Client',
      version: '6.8.1',
      connection_name: 'pay-api',
      platform: '.NET on ip-10-0-0-7.ec2.internal',
    },
  };

  it('che host, giữ product, version, connection_name; nhất quán trong một lần', () => {
    const r = makeRedactor({ names: false, literals: [], salt: 's' });
    const [a, b] = r.body('connections', [conn, conn]) as Record<string, any>[];
    expect(a).toEqual(b);
    expect(a.peer_host).toMatch(/^host-[0-9a-f]{10}$/);
    expect(a.name).toMatch(/^conn-/);
    expect(a.vhost).toBe('payments');
    expect(a.client_properties).toMatchObject({
      product: 'RabbitMQ.Client',
      version: '6.8.1',
      connection_name: 'pay-api',
    });
    expect(a.client_properties.platform).toMatch(/^client-/);
    expect(leaks(JSON.stringify(a), true)).toEqual([]);
  });

  it('--redact names băm vhost, queue, exchange, user, policy; giữ amq.*', () => {
    const r = makeRedactor({ names: true, literals: [], salt: 's' });
    const q = r.body('queues', {
      items: [
        {
          vhost: 'payments',
          name: 'orders',
          policy: 'ha',
          node: 'rabbit@ip-10-0-0-1.ec2.internal',
        },
      ],
    }) as { items: Record<string, string>[] };
    expect(q.items[0].vhost).toMatch(/^vhost-/);
    expect(q.items[0].name).toMatch(/^queue-/);
    expect(q.items[0].policy).toMatch(/^policy-/);
    expect(q.items[0].node).toMatch(/^rabbit@host-/);
    const b = r.body('bindings', [
      { vhost: 'payments', source: 'amq.topic', destination: 'orders' },
    ]) as Record<string, string>[];
    expect(b[0].source).toBe('amq.topic');
    expect(b[0].destination).toBe(q.items[0].name);
    expect(
      (r.body('connections', [conn]) as Record<string, string>[])[0].user,
    ).toMatch(/^user-/);
  });

  it('văn bản Prometheus và chuỗi literal', () => {
    const r = makeRedactor({
      names: false,
      literals: ['b-1.mq.example'],
      salt: 's',
    });
    const t = r.hosts(
      'rabbitmq_identity_info{rabbitmq_node="rabbit@b-1.mq.example"} 1\nx{h="b-1.mq.example"} 1',
    );
    expect(t).not.toContain('b-1.mq.example');
    expect(t).toMatch(/rabbitmq_node="rabbit@host-/);
  });

  it('--check bắt IPv4, IPv6, amazonaws; bỏ qua khoá version', () => {
    expect(
      leaks(
        JSON.stringify({ erlang_version: '26.2.5.6', ip: '192.168.1.10' }),
        true,
      ),
    ).toEqual(['192.168.1.10']);
    expect(
      leaks(
        JSON.stringify({
          a: 'fe80::1',
          b: 'b-1.mq.us-east-1.amazonaws.com',
          t: '12:30:45',
        }),
        true,
      ),
    ).toHaveLength(2);
    expect(leaks('m{erlang_version="26.2.5.6"} 1\n', false)).toEqual([]);

    const root = tmp();
    const d = join(root, 'lab', 'full');
    mkdirSync(d, { recursive: true });
    write(d, 'manifest.json', {
      label: 'lab',
      variant: 'full',
      redacted: false,
    });
    write(d, 'connections.json', ok([conn]));
    expect(checkTree(root).length).toBeGreaterThan(0);
    redactDir(d, { names: false, literals: [] });
    expect(checkTree(root)).toEqual([]);
    expect(
      JSON.parse(readFileSync(join(d, 'manifest.json'), 'utf8')).redacted,
    ).toBe('hosts');
  });
});

describe('check-assumptions', () => {
  function recording(
    root: string,
    label: string,
    variant: string,
    overrides: Record<string, unknown> = {},
  ) {
    const d = join(root, label, variant);
    mkdirSync(join(d, 'columns'), { recursive: true });
    const stats = !variant.includes('nostats');
    const files: Record<string, unknown> = {
      'manifest.json': {
        label,
        variant,
        brokerVersion: '3.13.7',
        userTags: ['monitoring'],
      },
      'overview.json': ok(stats ? { message_stats: {}, churn_rates: {} } : {}),
      'nodes.json': ok([
        {
          name: 'rabbit@a',
          applications: [{ name: 'rabbit', version: '3.13.7' }],
        },
      ]),
      'queues.json': ok({
        items: [
          {
            vhost: '/',
            name: 'q',
            effective_policy_definition: {},
            message_stats: { publish_details: { rate: 1 } },
          },
        ],
      }),
      'vhosts.json': ok([{ name: '/', default_queue_type: 'classic' }]),
      'channels.json': ok([{ name: 'c', confirm: true }]),
      'deprecatedUsed.json': ok([]),
      'columns/queues.json': ok({
        items: [
          {
            vhost: '/',
            name: 'q',
            message_stats: { publish_details: { rate: 1 } },
          },
        ],
      }),
      'prometheus.txt':
        '# TYPE rabbitmq_identity_info gauge\nrabbitmq_identity_info{rabbitmq_node="rabbit@a",rabbitmq_cluster="c"} 1\n',
      ...overrides,
    };
    for (const e of [
      'whoami',
      'featureFlags',
      'exchanges',
      'bindings',
      'policies',
      'operatorPolicies',
      'connections',
      'consumers',
      'totalsAtEnd',
    ]) {
      files[`${e}.json`] ??= ok([]);
    }
    for (const [f, v] of Object.entries(files)) write(d, f, v);
  }

  it('bản ghi đạt hết', () => {
    const root = tmp();
    recording(root, 'rmq-3.13', 'full');
    recording(root, 'rmq-3.13', 'nostats');
    const { markdown, failed } = table(root);
    expect(failed).toBe(false);
    expect(markdown.split('\n')[0]).toBe(
      '| Bản ghi | GC1 | GC2 | GC8, GC21 | GC9 | GC12 | GC15 | GC17 | GC20 | GC22 |',
    );
    expect(markdown).toContain(
      '| rmq-3.13/full | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |',
    );
    expect(markdown).toContain(
      '| rmq-3.13/nostats | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |',
    );
  });

  it('giả định sai thì ✗', () => {
    const root = tmp();
    recording(root, 'rmq-4.2', 'nostats', {
      'overview.json': ok({ message_stats: {}, churn_rates: {} }),
      'queues.json': ok({
        items: [
          {
            vhost: '/',
            name: 'q',
            message_stats: { publish_details: { rate: 1 } },
          },
        ],
      }),
      'columns/queues.json': ok({ items: [{ vhost: '/', name: 'q' }] }),
      'prometheus.txt': '# TYPE x gauge\n',
      'deprecatedUsed.json': { status: 'http_error', code: 404 },
      'policies.json': { status: 'http_error', code: 403 },
      'channels.json': { status: 'http_error', code: 400 },
    });
    const { markdown, failed } = table(root);
    expect(failed).toBe(true);
    expect(markdown).toContain(
      '| rmq-4.2/nostats | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |',
    );
  });
});
