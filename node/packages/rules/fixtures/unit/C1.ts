import { brokerAt } from '../builder';
import { declared, fixture, ref } from '../fixture';

const C = ref.consumer('c1', 1, 'ct');
const consuming = (ackRequired: boolean, queue = 'q') =>
  brokerAt('4.2.1')
    .queue('q')
    .connection('c1')
    .channel('c1', 1, { consumers: 1 })
    .consumer('ct', { channel: 'c1 (1)', queue, ackRequired });

export default [
  fixture({
    rule: 'C1',
    kind: 'fail',
    title: 'auto-ack consumer, undeclared queue',
    raw: consuming(false).build(),
    expect: [
      {
        object: C,
        result: 'fail',
        severity: 'S3',
        urgency: 'at_risk',
        params: { queue: 'q', connection: 'c1' },
        evidence: ['observed consumer.ackRequired'],
      },
    ],
  }),
  fixture({
    rule: 'C1',
    kind: 'fail',
    title: 'auto-ack consumer on a strict queue',
    raw: consuming(false).build(),
    desired: declared({ f: { queue: 'q', tolerance: 'strict' } }),
    expect: [{ object: C, result: 'fail', severity: 'S1' }],
  }),
  fixture({
    rule: 'C1',
    kind: 'near',
    title: 'auto-ack consumer on a loose queue',
    raw: consuming(false).build(),
    desired: declared({ f: { queue: 'q', tolerance: 'loose' } }),
    expect: [{ object: C, result: 'pass', note: 'loose_by_declaration' }],
  }),
  fixture({
    rule: 'C1',
    kind: 'near',
    title: 'auto-ack on direct reply-to is excluded (EX9)',
    raw: consuming(false, 'amq.rabbitmq.reply-to').build(),
    expect: [{ object: C, result: 'none' }],
  }),
  fixture({
    rule: 'C1',
    kind: 'anti',
    title: 'manual ack',
    raw: consuming(true).build(),
    expect: [{ object: C, result: 'pass' }],
  }),
  fixture({
    rule: 'C1',
    kind: 'anti',
    title: 'statistics disabled: consumers cannot be listed',
    raw: consuming(false).statsOff().build(),
    expect: [{ object: ref.broker, result: 'not_checked', path: 'consumer' }],
  }),
];
