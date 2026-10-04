import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

export default [
  fixture({
    rule: 'DX3',
    kind: 'fail',
    title: 'connections and queues are both churned',
    raw: brokerAt('4.2.1').churnRates({ connection: 6, queue: 7 }).build(),
    expect: [
      {
        object: ref.broker,
        result: 'fail',
        severity: 'S5',
        variant: 'connection',
      },
      { object: ref.broker, result: 'fail', severity: 'S5', variant: 'queue' },
    ],
  }),
  fixture({
    rule: 'DX3',
    kind: 'near',
    title: 'exactly at the threshold',
    raw: brokerAt('4.2.1').churnRates({ connection: 5, queue: 5 }).build(),
    expect: [{ object: ref.broker, result: 'pass' }],
  }),
  fixture({
    rule: 'DX3',
    kind: 'anti',
    title: 'no churn',
    raw: brokerAt('4.2.1').build(),
    expect: [{ object: ref.broker, result: 'pass' }],
  }),
  fixture({
    rule: 'DX3',
    kind: 'anti',
    title: 'statistics disabled',
    raw: brokerAt('4.2.1').statsOff().build(),
    expect: [
      { object: ref.broker, result: 'not_checked', path: 'broker.churn' },
    ],
  }),
];
