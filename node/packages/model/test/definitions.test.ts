import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type Instant,
  actualFromDefinitions,
  topologyFromDefinitions,
} from '../src';

const at = '2026-10-05T00:00:00.000Z' as Instant;
const ctx = { contextName: 'definitions.json', at };
const SUT = JSON.parse(
  readFileSync(
    new URL('../../../../SUT/common/definitions.json', import.meta.url),
    'utf8',
  ),
) as Record<string, unknown>;

describe('topologyFromDefinitions', () => {
  it('đủ năm phần của definitions của SUT', () => {
    const r = topologyFromDefinitions(SUT, ctx);
    if (!r.ok || r.value.state !== 'known') throw new Error('expected known');
    const t = r.value.value;
    expect(t.exchanges).toHaveLength(4);
    expect(t.queues).toHaveLength(9);
    expect(t.bindings).toHaveLength(4);
    expect(t.policies).toHaveLength(4);
    expect(t.operatorPolicies).toHaveLength(1);
    const q = t.queues.find((x) => x.name === 'orders.created')!;
    expect(q).toMatchObject({ vhost: 'payments', type: 'quorum' });
  });

  it('kiểu queue: x-queue-type, rồi kiểu mặc định của vhost, rồi classic', () => {
    const doc = {
      vhosts: [
        { name: 'q', metadata: { default_queue_type: 'quorum' } },
        { name: 's', default_queue_type: 'stream' },
        { name: '/' },
      ],
      queues: [
        { vhost: 'q', name: 'a', durable: true, arguments: {} },
        { vhost: 's', name: 'b', durable: true, arguments: {} },
        { vhost: '/', name: 'c', durable: true, arguments: {} },
        {
          vhost: 'q',
          name: 'd',
          durable: true,
          arguments: { 'x-queue-type': 'classic' },
        },
      ],
    };
    const r = topologyFromDefinitions(doc, ctx);
    if (!r.ok || r.value.state !== 'known') throw new Error('expected known');
    expect(r.value.value.queues.map((x) => [x.name, x.type]).sort()).toEqual([
      ['a', 'quorum'],
      ['b', 'stream'],
      ['c', 'classic'],
      ['d', 'classic'],
    ]);
  });

  it('phần không có trong file là danh sách rỗng; node, connection không đọc', () => {
    const a = actualFromDefinitions({ rabbit_version: '3.13.7' }, ctx);
    if (!a.ok) throw new Error('expected ok');
    expect(a.value.queues).toMatchObject({ state: 'known', value: [] });
    expect(a.value.nodes.state).toBe('unknown');
    expect(a.value.connections.state).toBe('unknown');
    expect(a.value.anomalies).toEqual([]);
  });

  it('file không phải object, hoặc một phần không phải mảng', () => {
    expect(topologyFromDefinitions([], ctx)).toEqual({
      ok: false,
      error: { detail: 'the file is not a JSON object' },
    });
    expect(topologyFromDefinitions({ queues: {} }, ctx)).toEqual({
      ok: false,
      error: { detail: 'queues is not an array' },
    });
  });
});
