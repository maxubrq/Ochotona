import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const Q = ref.queue('work');
const rates = (deliverRate: number, redeliverRate: number) =>
  brokerAt('4.2.1').queue('work', { deliverRate, redeliverRate });

export default [
  fixture({
    rule: 'F4',
    kind: 'fail',
    title: '80% of deliveries are redeliveries',
    raw: rates(10, 8).build(),
    expect: [{ object: Q, result: 'fail', severity: 'S3' }],
  }),
  fixture({
    rule: 'F4',
    kind: 'near',
    title: 'ratio exactly at the threshold',
    raw: rates(10, 5).build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'F4',
    kind: 'anti',
    title: 'traffic below the minimum rate',
    raw: rates(0.5, 0.5).build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'F4',
    kind: 'anti',
    title: 'statistics disabled',
    raw: rates(10, 8).statsOff().build(),
    expect: [{ object: Q, result: 'not_checked', path: 'queue.deliverRate' }],
  }),
];
