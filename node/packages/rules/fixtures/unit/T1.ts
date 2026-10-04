import { brokerAt } from '../builder';
import { declared, fixture, ref } from '../fixture';

const Q = ref.queue('store');
const busy = (omit: string[] = []) =>
  brokerAt('4.2.1').queue('store', {
    consumers: 1,
    ready: 5,
    unacked: 1,
    omit,
  });
const strict = declared({ f: { queue: 'store', tolerance: 'strict' } });

export default [
  fixture({
    rule: 'T1',
    kind: 'fail',
    title: 'undeclared classic queue in use',
    raw: busy().build(),
    expect: [
      {
        object: Q,
        result: 'fail',
        severity: 'S3',
        urgency: 'at_risk',
        params: { messages: 6, consumers: 1 },
        evidence: ['inferred queue.type'],
      },
    ],
  }),
  fixture({
    rule: 'T1',
    kind: 'fail',
    title: 'strict classic queue',
    raw: busy().build(),
    desired: strict,
    expect: [{ object: Q, result: 'fail', severity: 'S1' }],
  }),
  fixture({
    rule: 'T1',
    kind: 'fail',
    title: 'strict classic queue, counts unknown',
    raw: busy().statsOff().build(),
    desired: strict,
    expect: [{ object: Q, result: 'fail', severity: 'S1', variant: 'bare' }],
  }),
  fixture({
    rule: 'T1',
    kind: 'fail',
    title: 'strict classic queue, unacked count missing',
    raw: busy(['messages_unacknowledged']).build(),
    desired: strict,
    expect: [{ object: Q, result: 'fail', severity: 'S1', variant: 'bare' }],
  }),
  fixture({
    rule: 'T1',
    kind: 'near',
    title: 'undeclared classic queue with a backlog but no consumer',
    raw: brokerAt('4.2.1').queue('store', { consumers: 0, ready: 5 }).build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'T1',
    kind: 'anti',
    title: 'busy quorum and auto-delete queues',
    raw: brokerAt('4.2.1')
      .queue('store', { type: 'quorum', consumers: 1, ready: 5 })
      .queue('ad', { autoDelete: true, consumers: 1, ready: 5 })
      .build(),
    expect: [
      { object: Q, result: 'pass' },
      { object: ref.queue('ad'), result: 'pass' },
    ],
  }),
  fixture({
    rule: 'T1',
    kind: 'anti',
    title: 'undeclared, consumer count missing',
    raw: busy(['consumers']).build(),
    expect: [{ object: Q, result: 'not_checked', path: 'queue.consumers' }],
  }),
  fixture({
    rule: 'T1',
    kind: 'anti',
    title: 'undeclared, statistics disabled',
    raw: busy().statsOff().build(),
    expect: [{ object: Q, result: 'not_checked', path: 'queue.ready' }],
  }),
  fixture({
    rule: 'T1',
    kind: 'anti',
    title: 'undeclared, unacked count missing',
    raw: busy(['messages_unacknowledged']).build(),
    expect: [{ object: Q, result: 'not_checked', path: 'queue.unacked' }],
  }),
  fixture({
    rule: 'T1',
    kind: 'near',
    title: 'loose classic queue',
    raw: busy().build(),
    desired: declared({ f: { queue: 'store', tolerance: 'loose' } }),
    expect: [{ object: Q, result: 'pass', note: 'loose_by_declaration' }],
  }),
  fixture({
    rule: 'T1',
    kind: 'near',
    title: 'undeclared classic queue that is empty',
    raw: brokerAt('4.2.1').queue('store', { consumers: 1 }).build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'T1',
    kind: 'anti',
    title: 'quorum queue, transient classic queue',
    raw: brokerAt('4.2.1')
      .queue('store', { type: 'quorum' })
      .queue('tmp', { durable: false, consumers: 1, ready: 3 })
      .build(),
    expect: [
      { object: Q, result: 'pass' },
      { object: ref.queue('tmp'), result: 'pass' },
    ],
  }),
  fixture({
    rule: 'T1',
    kind: 'anti',
    title: 'queues cannot be read',
    raw: busy().httpError('queues', 403).build(),
    expect: [{ object: ref.broker, result: 'not_checked', path: 'queue' }],
  }),
];
