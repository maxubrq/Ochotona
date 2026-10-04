import { describe, expect, it } from 'vitest';
import { inferFlows } from '../src';
import { Broker, scanBroker, topologyOf } from './fixtures';

const infer = (b: Broker) => {
  const a = b.actual();
  return inferFlows(topologyOf(a), a);
};

describe('inferFlows', () => {
  it('bảng loại exchange: fanout, direct, topic, mặc định, headers', () => {
    const r = infer(scanBroker());
    expect(r.candidates.map((c) => [c.name, c.target])).toEqual([
      ['direct:on', { kind: 'direct', queue: 'on' }],
      ['audit', { kind: 'fanout', exchange: 'audit', groups: ['audit.log'] }],
      [
        'billing.invoice.created',
        {
          kind: 'binding',
          exchange: 'billing',
          routingKey: 'billing.invoice.created',
          groups: [
            'billing.invoice.created.email',
            'billing.invoice.created.ledger',
          ],
        },
      ],
      [
        'scan.request/request_clamav',
        expect.objectContaining({ kind: 'binding' }),
      ],
      [
        'scan.request/request_pdf',
        expect.objectContaining({ kind: 'binding' }),
      ],
      [
        'scan.request/request_yara',
        expect.objectContaining({ kind: 'binding' }),
      ],
    ]);
    expect(r.unmanaged).toEqual([
      {
        ref: { kind: 'exchange', vhost: '/', name: 'legacy.headers' },
        reason: 'headers_exchange',
      },
    ]);
  });

  it('thứ tự theo vhost, exchange, key; direct có exchange rỗng nên đứng đầu vhost', () => {
    const r = infer(
      new Broker()
        .exchange('b', 'direct')
        .bound('b', 'q2', 'k2')
        .bound('b', 'q1', 'k1')
        .queue('z')
        .exchange('a', 'fanout', 'v1')
        .bound('a', 'q3', '', { vhost: 'v1' }),
    );
    expect(r.candidates.map((c) => c.name)).toEqual([
      'direct:z',
      'b/k1',
      'b/k2',
      'a',
    ]);
  });

  it('binding exchange tới exchange là unmanaged', () => {
    const r = infer(
      new Broker()
        .exchange('a', 'topic')
        .exchange('b', 'fanout')
        .bind('a', 'b', 'x.#', { toExchange: true }),
    );
    expect(r.unmanaged).toEqual([
      expect.objectContaining({
        reason: 'exchange_to_exchange',
        ref: expect.objectContaining({ kind: 'binding', source: 'a' }),
      }),
      expect.objectContaining({
        reason: 'no_queue_bindings',
        ref: expect.objectContaining({ name: 'b' }),
      }),
    ]);
    expect(r.candidates).toEqual([]);
  });

  it('loại exchange của plugin là unmanaged', () => {
    const r = infer(
      new Broker().exchange('d', 'x-delayed-message').bound('d', 'q', 'k'),
    );
    expect(r.unmanaged.map((u) => u.reason)).toEqual([
      'unsupported_exchange_type',
    ]);
  });

  it('exchange dựng sẵn amq.* vẫn sinh luồng khi có binding', () => {
    const r = infer(
      new Broker().bound('amq.topic', 'q', 'orders.order.created'),
    );
    expect(r.candidates.map((c) => c.name)).toEqual(['orders.order.created']);
  });

  it('tên: key ba đoạn trở lên, không ký tự đại diện; còn lại <exchange>/<key>', () => {
    const r = infer(
      new Broker()
        .exchange('e', 'topic')
        .bound('e', 'q1', 'a.b.c')
        .bound('e', 'q2', 'a.b')
        .bound('e', 'q3', 'a.*.c')
        .bound('e', 'q4', 'A.b.c'),
    );
    expect(r.candidates.map((c) => c.name)).toEqual([
      'e/A.b.c',
      'e/a.*.c',
      'e/a.b',
      'a.b.c',
    ]);
  });

  it('va tên bậc 1: thêm @vhost cho ứng viên không ở /', () => {
    const r = infer(
      new Broker()
        .exchange('e', 'topic')
        .bound('e', 'q', 'a.b.c')
        .exchange('e', 'topic', 'v1')
        .bound('e', 'q', 'a.b.c', { vhost: 'v1' }),
    );
    expect(r.candidates.map((c) => c.name)).toEqual(['a.b.c', 'a.b.c@v1']);
  });

  it('va tên bậc 2: cùng vhost thì mọi ứng viên va dùng <exchange>/<key>', () => {
    const r = infer(
      new Broker()
        .exchange('e1', 'topic')
        .bound('e1', 'q1', 'a.b.c')
        .exchange('e2', 'direct')
        .bound('e2', 'q2', 'a.b.c')
        .exchange('e1', 'topic', 'v1')
        .bound('e1', 'q3', 'a.b.c', { vhost: 'v1' })
        .exchange('e2', 'direct', 'v1')
        .bound('e2', 'q4', 'a.b.c', { vhost: 'v1' }),
    );
    expect(r.candidates.map((c) => c.name)).toEqual([
      'e1/a.b.c',
      'e2/a.b.c',
      'e1/a.b.c@v1',
      'e2/a.b.c@v1',
    ]);
    expect(new Set(r.candidates.map((c) => c.name)).size).toBe(4);
  });

  it('tốc độ là lớn nhất trong publishRate của các queue; không có Actual thì null', () => {
    const b = new Broker()
      .exchange('e', 'fanout')
      .bound('e', 'q1', '', { rate: 3 })
      .bound('e', 'q2', '', { rate: 7 });
    expect(infer(b).candidates[0]).toMatchObject({
      queues: 2,
      rate: { perSecond: 7 },
    });
    expect(inferFlows(topologyOf(b.actual())).candidates[0].rate).toBeNull();
  });

  it('một queue thuộc nhiều luồng là cấu trúc thật, không phải lỗi', () => {
    const r = infer(
      new Broker()
        .exchange('e', 'topic')
        .bound('e', 'q', 'a.b.c')
        .bind('e', 'q', 'x.y.z'),
    );
    expect(r.candidates.map((c) => c.name)).toEqual(['a.b.c', 'x.y.z']);
  });
});
