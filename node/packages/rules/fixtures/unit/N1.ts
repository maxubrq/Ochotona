import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const C = ref.connection('c1');

export default [
  fixture({
    rule: 'N1',
    kind: 'fail',
    title: 'one connection publishes on channel 1 and consumes on channel 2',
    raw: brokerAt('4.2.1')
      .connection('c1')
      .channel('c1', 1, { publish: 3 })
      .channel('c1', 2, { consumers: 1 })
      .build(),
    expect: [{ object: C, result: 'fail', severity: 'S3' }],
  }),
  fixture({
    rule: 'N1',
    kind: 'near',
    title: 'publishing and consuming on separate connections',
    raw: brokerAt('4.2.1')
      .connection('c1')
      .channel('c1', 1, { publish: 3 })
      .connection('c2')
      .channel('c2', 1, { consumers: 1 })
      .build(),
    expect: [
      { object: C, result: 'pass' },
      { object: ref.connection('c2'), result: 'pass' },
    ],
  }),
  fixture({
    rule: 'N1',
    kind: 'anti',
    title: 'MQTT connection',
    raw: brokerAt('4.2.1').connection('m1', { protocol: 'MQTT 5-0' }).build(),
    expect: [
      {
        object: ref.connection('m1'),
        result: 'not_applicable',
        note: 'protocol',
      },
    ],
  }),
  fixture({
    rule: 'N1',
    kind: 'anti',
    title: 'statistics disabled: channels unknown',
    raw: brokerAt('4.2.1').connection('c1').channel('c1', 1).statsOff().build(),
    expect: [
      { object: C, result: 'not_checked', path: 'channel.publishCount' },
    ],
  }),
];
