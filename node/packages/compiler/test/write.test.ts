import { type Desired, type Instant, buildDesired } from '@ochotona/model';
import { describe, expect, it } from 'vitest';
import { readOchoYaml, writeOchoYaml } from '../src';
import { Broker, T0, scanBroker } from './fixtures';
import { nonInteractive, run, session } from './helpers';

const header = {
  context: 'prod',
  toolVersion: '0.1.0',
  at: T0,
  schemaUrl: 'https://example.test/ocho-yaml-0.1.json',
};
const write = (d: Desired, base?: string) =>
  writeOchoYaml(d, {
    header,
    ochoComments: [],
    ...(base ? { base: { text: base } } : {}),
  });

const desired = () =>
  run(session(scanBroker().actual()), (q) =>
    q.kind === 'family'
      ? { kind: 'family', action: 'accept' }
      : { kind: 'tolerance', value: 'strict', scope: 'flow' },
  ).desired;

/** Cùng Desired, thứ tự chèn khoá khác. */
function shuffled(d: Desired): Desired {
  const rev = <T>(r: Readonly<Record<string, T>>) =>
    Object.fromEntries(Object.entries(r).reverse());
  return {
    ...d,
    families: rev(d.families),
    flows: rev(d.flows),
    topology: {
      exchanges: [...d.topology.exchanges].reverse(),
      queues: [...d.topology.queues].reverse().map((q) => ({
        ...q,
        arguments: Object.fromEntries(Object.entries(q.arguments).reverse()),
      })),
      bindings: [...d.topology.bindings].reverse(),
      policies: [...d.topology.policies].reverse(),
      operatorPolicies: [...d.topology.operatorPolicies].reverse(),
    },
  };
}

describe('writeOchoYaml', () => {
  it('tất định: cùng Desired cho cùng byte, bất kể thứ tự chèn', () => {
    const d = desired();
    const a = write(d);
    expect(write(d)).toBe(a);
    expect(write(shuffled(d))).toBe(a);
  });

  it('ba dòng đầu file', () => {
    expect(write(desired()).split('\n').slice(0, 3)).toEqual([
      '# yaml-language-server: $schema=https://example.test/ocho-yaml-0.1.json',
      '# ocho import 0.1.0 · context prod · 2026-10-04T01:30:00.000Z',
      '# Edit families, flows, services, waivers. The topology section mirrors the broker; ocho import rewrites it.',
    ]);
  });

  it('thứ tự khoá cấp cao nhất và trong luồng', () => {
    const text = write(desired());
    const top = [...text.matchAll(/^([a-z_]+):/gm)].map((m) => m[1]);
    expect(top).toEqual(['spec', 'broker', 'families', 'flows', 'topology']);
    expect(text).toContain(
      [
        '  billing.invoice.created:',
        '    tolerance: strict',
        '    exchange: billing',
        '    routing_key: billing.invoice.created',
        '    groups:',
      ].join('\n'),
    );
    // vhost bỏ khi là /, tolerance luôn ghi.
    expect(text).not.toMatch(/^ {4}vhost: \/$/m);
  });

  it('vhost khác / được ghi trước tolerance', () => {
    const b = scanBroker();
    b.exchange('e', 'fanout', 'v1').bound('e', 'q', '', { vhost: 'v1' });
    const text = nonInteractive(b.actual()).yaml;
    expect(text).toContain(
      '  e:\n    vhost: v1\n    tolerance: undeclared\n    exchange: e\n',
    );
  });

  it('định dạng: thụt 2 dấu cách, LF, không tab, kết thúc bằng xuống dòng, dòng flow ≤ 120', () => {
    const text = write(desired());
    expect(text).not.toContain('\t');
    expect(text).not.toContain('\r');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    for (const line of text.split('\n'))
      if (line.includes('{ ')) expect(line.length).toBeLessThanOrEqual(120);
    expect(text).toMatch(
      /^ {4}- \{ vhost: \/, name: audit\.log, type: classic/m,
    );
    // Phần tử dài hơn 120 ký tự viết kiểu block.
    const long = scanBroker().queue(`q${'x'.repeat(100)}`, {
      args: { 'x-max-length': 10 },
    });
    const t2 = nonInteractive(long.actual()).yaml;
    expect(t2).toContain(
      `    - vhost: /\n      name: q${'x'.repeat(100)}\n      type: classic\n      durable: true\n      arguments: { x-max-length: 10 }\n`,
    );
  });

  it('thứ tự khoá cố định trong phần tử topology; giá trị mặc định của model bỏ', () => {
    const text = write(desired());
    expect(text).toContain(
      '    - { vhost: /, name: audit.log, type: classic, durable: true, flow: audit }',
    );
    expect(text).toContain(
      '    - vhost: /\n      name: request_clamav_q\n      type: quorum\n      durable: true\n      arguments: { x-queue-type: quorum }\n      flow: "scan.request/request_{p1}"\n',
    );
    expect(text).toContain(
      '    - { vhost: /, source: audit, destination: audit.log }',
    );
    expect(text).toContain(
      '    - { vhost: /, name: audit, type: fanout, durable: true, flow: audit }\n',
    );
    // Queue không thuộc luồng nào: không có khoá flow.
    expect(text).toContain(
      '    - { vhost: /, name: legacy.q, type: classic, durable: true }\n',
    );
    const b = new Broker()
      .exchange('x', 'topic', '/', { 'alternate-exchange': 'ae' })
      .exchange('y', 'fanout')
      .bind('x', 'y', 'k.#', { toExchange: true });
    const t2 = nonInteractive(b.actual()).yaml;
    expect(t2).toContain(
      '    - { vhost: /, name: x, type: topic, durable: true, arguments: { alternate-exchange: ae } }',
    );
    expect(t2).toContain(
      '    - { vhost: /, source: x, destination: "y", destination_type: exchange, routing_key: k.# }',
    );
  });

  it('đọc lại không có chẩn đoán và dựng lại đúng Desired', () => {
    const d = desired();
    const r = readOchoYaml(write(d));
    expect(r.diagnostics).toEqual([]);
    const d2 = buildDesired(r.value, T0 as Instant);
    expect(d2.ok && JSON.stringify(write(d2.value))).toBe(
      JSON.stringify(write(d)),
    );
  });

  it('base: giữ chú thích, thứ tự của người dùng; bỏ chú thích ocho cũ', () => {
    const d = desired();
    const user = write(d)
      .replace('flows:\n', 'flows:\n  # z first\n')
      .replace(
        '  billing.invoice.created:\n',
        '  # old\n  # ocho: stale\n  billing.invoice.created:\n',
      );
    // Người dùng đảo thứ tự: chuyển audit xuống cuối.
    const lines = user.split('\n');
    const start = lines.indexOf('  audit:');
    const block = lines.splice(start, 4);
    lines.splice(lines.indexOf('topology:') - 1, 0, ...block);
    const text = write(d, lines.join('\n'));
    expect(text).toContain('  # old\n  billing.invoice.created:');
    expect(text).not.toContain('stale');
    const flows = text.slice(
      text.indexOf('\nflows:'),
      text.indexOf('\ntopology:'),
    );
    expect(
      [...flows.matchAll(/^ {2}("?[^\s:"]+"?):$/gm)].map((m) => m[1]).pop(),
    ).toBe('audit');
    expect(write(d, text)).toBe(text);
  });

  it('base hỏng thì bỏ qua base', () => {
    const d = desired();
    expect(write(d, 'flows: [')).toBe(write(d));
  });
});
