import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MockServer } from '../../broker/tools/mock-mgmt.ts';
import {
  PASSWORD,
  expectSingleJson,
  runCli,
  startReplay,
  targetFlags,
} from './helpers';
import { expectValid } from './schemas';

const env = { OCHO_PASSWORD: PASSWORD };

describe('explain without the network', () => {
  it('a rule code: title, severities, mechanism, spec link', async () => {
    const r = await runCli(['explain', 'T2']);
    expect(r.code).toBe(0);
    const lines = r.stdout.split('\n');
    expect(lines[0]).toBe('T2  Unroutable messages can be dropped');
    expect(r.stdout).toMatch(/^Severity\s+S1, S3$/m);
    expect(r.stdout).toContain('spec/0.4#T2');
    expect(r.stdout).toMatch(
      /^Fails when\s+An exchange with outgoing bindings has no usable/m,
    );
    expect(r.stdout).toMatch(
      /^Examples\s+fail exchange orders → fail S3 at_risk/m,
    );
    expect(r.stdout).toMatch(/^\s+near exchange orders → pass/m);
    const j = await runCli(['explain', 't2', '--json']);
    const doc = expectSingleJson(j.stdout);
    expectValid(doc);
    expect(doc).toMatchObject({
      kind: 'rule',
      id: 'T2',
      rule: { severities: ['S1', 'S3'], fix: 'policy' },
    });
    expect(doc.rule.examples.map((e: { kind: string }) => e.kind)).toEqual([
      'fail',
      'near',
    ]);
    // Ngưỡng của luật đi vào vị từ, theo số của ngôn ngữ.
    const dx1 = await runCli(['explain', 'DX1', '--json']);
    expect(dx1.json().rule.predicate).toBe(
      'A queue holds more than 1,000,000 ready messages.',
    );
    const vi = await runCli(['explain', 'DX1', '--lang', 'vi']);
    expect(vi.stdout).toMatch(/^Fail khi\s+Queue giữ hơn 1\.000\.000 message/m);
  });

  it('a blind-spot code and a diagnostic code', async () => {
    const le = await runCli(['explain', 'LE5', '--json']);
    expectValid(le.json());
    expect(le.json().blindSpot.caughtBy).toBe('client');
    const cx = await runCli(['explain', 'CX9']);
    expect(cx.stdout.split('\n')[0]).toBe(
      'CX9  Broker returns 403 at /api/overview: the user has no management tag',
    );
    expect(cx.stdout).toContain(
      'The broker rejected user <user> at /api/overview with 403',
    );
    const j = await runCli(['explain', 'CX11', '--json']);
    expectValid(j.json());
    const vi = await runCli(['explain', 'T2', '--lang', 'vi']);
    expect(vi.stdout).toMatch(/^Mức\s+S1, S3$/m);
  });

  it('usage errors: no target, unknown kind', async () => {
    const none = await runCli(['explain']);
    expect(none.code).toBe(4);
    const kind = await runCli(['explain', 'topic', 'x', '--json']);
    expect(kind.code).toBe(4);
    expectValid(kind.json());
  });
});

describe('explain an object on a recorded broker', () => {
  let mock: MockServer;
  beforeAll(async () => {
    mock = await startReplay('rabbitmq-4.2/full');
  });
  afterAll(() => mock.close());

  it('queue: effective table, matching policies, broker check', async () => {
    const before = mock.requests.length;
    const r = await runCli(
      ['explain', 'queue', 'overlap', ...targetFlags(mock)],
      { env },
    );
    expect(r.code).toBe(0);
    const lines = r.stdout.split('\n');
    expect(lines[0]).toBe('queue overlap · classic · vhost /');
    expect(lines[2]).toMatch(/^KEY\s+VALUE\s+LAYER\s+SET BY\s+RUNTIME\s+NOTE$/);
    expect(r.stdout).toMatch(/^max-length\s+1000\s+policy\s+overlap-a\s+yes/m);
    expect(r.stdout).toMatch(
      /^overflow\s+drop-head\s+builtin default\s+-\s+yes\s+T3 S3$/m,
    );
    expect(r.stdout).toContain(
      'overlap-a (prio 2, applied) · overlap-b (prio 1, ignored)',
    );
    expect(r.stdout).toContain('Broker agrees');
    // Chỉ đối tượng đó: 6 request, không Prometheus, chỉ GET (K5).
    const reqs = mock.requests.slice(before);
    expect(reqs.map((q) => q.path)).toEqual([
      '/api/overview',
      '/api/whoami',
      '/api/policies/%2F',
      '/api/operator-policies/%2F',
      '/api/queues/%2F/overlap',
      '/api/queues/%2F/overlap/bindings',
    ]);
    expect(reqs.every((q) => q.method === 'GET')).toBe(true);
    expect(reqs.some((q) => q.path === '/metrics')).toBe(false);
    expect(reqs.some((q) => q.path.includes('payments'))).toBe(false);
  });

  it('bare name in another vhost; JSON validates', async () => {
    const r = await runCli(
      [
        'explain',
        'orders.created',
        '--vhost',
        'payments',
        '--json',
        ...targetFlags(mock),
      ],
      {
        env,
      },
    );
    const doc = expectSingleJson(r.stdout);
    expectValid(doc);
    expect(doc.object).toMatchObject({
      label: 'queue orders.created (vhost payments)',
      brokerCheck: 'agrees',
    });
    expect(doc.findings.some((f: { rule: string }) => f.rule === 'T5')).toBe(
      true,
    );
  });

  it('exchange; not found; flow without ocho.yaml', async () => {
    const x = await runCli(
      ['explain', 'exchange', 'direct', ...targetFlags(mock)],
      { env },
    );
    expect(x.stdout.split('\n')[0]).toBe('exchange direct · direct · vhost /');
    const nf = await runCli(
      ['explain', 'queue', 'nope', ...targetFlags(mock)],
      { env },
    );
    expect([nf.code, nf.stderr.split('\n')[0]]).toEqual([
      4,
      'error: queue nope does not exist in vhost /',
    ]);
    const flow = await runCli(['explain', 'flow', 'x', ...targetFlags(mock)], {
      env,
    });
    expect(flow.code).toBe(4);
  });

  it('exchange with an alternate exchange: two more requests, T2 sees the target', async () => {
    const before = mock.requests.length;
    const r = await runCli(
      ['explain', 'exchange', 'events', '--json', ...targetFlags(mock)],
      { env },
    );
    expect(r.code).toBe(0);
    const doc = expectSingleJson(r.stdout);
    expectValid(doc);
    const t2 = doc.findings.find((f: { rule: string }) => f.rule === 'T2');
    expect(t2?.result ?? 'pass').toBe('pass');
    const paths = mock.requests.slice(before).map((q) => q.path);
    expect(paths).toHaveLength(8);
    expect(paths.slice(6)).toEqual([
      '/api/exchanges/%2F/events.unrouted',
      '/api/exchanges/%2F/events.unrouted/bindings/source',
    ]);
  });

  it('bare name: queue and exchange with the same name is ambiguous', async () => {
    const r = await runCli(
      ['explain', 'events.unrouted', '--json', ...targetFlags(mock)],
      { env },
    );
    expect(r.code).toBe(4);
    expectValid(r.json());
    expect(r.json().message).toContain('events.unrouted');
  });

  it('bare name of an exchange only: reads the exchange after the probe', async () => {
    const r = await runCli(['explain', 'events', ...targetFlags(mock)], {
      env,
    });
    expect(r.code).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe('exchange events · topic · vhost /');
    const none = await runCli(['explain', 'nothing', ...targetFlags(mock)], {
      env,
    });
    expect(none.code).toBe(4);
  });
});
