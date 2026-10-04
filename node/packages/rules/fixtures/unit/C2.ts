import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const C = ref.consumer('c1', 1, 'ct');
const consumer = (prefetch: number, deliverRate: number | string = 0) =>
  brokerAt('4.2.1')
    .queue('q', { deliverRate })
    .connection('c1')
    .channel('c1', 1, { consumers: 1 })
    .consumer('ct', { channel: 'c1 (1)', queue: 'q', prefetch });

export default [
  fixture({
    rule: 'C2',
    kind: 'fail',
    title: 'prefetch 0',
    raw: consumer(0).build(),
    expect: [{ object: C, result: 'fail', severity: 'S3' }],
  }),
  fixture({
    rule: 'C2',
    kind: 'fail',
    title: 'prefetch 1 on a queue delivering 150 per second',
    raw: consumer(1, 150).build(),
    expect: [{ object: C, result: 'fail', severity: 'S4', variant: 'one' }],
  }),
  fixture({
    rule: 'C2',
    kind: 'anti',
    title: 'prefetch 1, delivery rate unreadable',
    raw: consumer(1, 'n/a').build(),
    expect: [{ object: C, result: 'not_checked', path: 'queue.deliverRate' }],
  }),
  fixture({
    rule: 'C2',
    kind: 'near',
    title: 'prefetch 1 on a slow queue',
    raw: consumer(1, 50).build(),
    expect: [{ object: C, result: 'pass' }],
  }),
  fixture({
    rule: 'C2',
    kind: 'anti',
    title: 'prefetch 20',
    raw: consumer(20, 500).build(),
    expect: [{ object: C, result: 'pass' }],
  }),
  fixture({
    rule: 'C2',
    kind: 'anti',
    title: 'statistics disabled: consumers cannot be listed',
    raw: consumer(0).statsOff().build(),
    expect: [{ object: ref.broker, result: 'not_checked', path: 'consumer' }],
  }),
];
