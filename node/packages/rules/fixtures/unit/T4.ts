import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const Q = ref.queue('jobs');

export default [
  fixture({
    rule: 'T4',
    kind: 'fail',
    title: '4.2 quorum queue without dead-letter gets the default limit 20',
    raw: brokerAt('4.2.1').queue('jobs', { type: 'quorum' }).build(),
    expect: [
      {
        object: Q,
        result: 'fail',
        severity: 'S1',
        variant: 'drop',
        urgency: 'active_loss_path',
        params: { limit: 20, limitLayer: 'default' },
        evidence: [
          'observed queue.effective key:dead-letter-exchange',
          'inferred queue.effective key:delivery-limit',
          'observed broker.version',
        ],
        fixSet: {
          'delivery-limit': 10,
          'dead-letter-exchange': 'ocho.retry',
          'dead-letter-strategy': 'at-least-once',
          overflow: 'reject-publish',
        },
      },
    ],
  }),
  fixture({
    rule: 'T4',
    kind: 'fail',
    title: '3.13 quorum queue with no limit loops',
    raw: brokerAt('3.13.7').queue('jobs', { type: 'quorum' }).build(),
    expect: [
      {
        object: Q,
        result: 'fail',
        severity: 'S3',
        variant: 'loop',
        urgency: 'hygiene',
      },
    ],
  }),
  fixture({
    rule: 'T4',
    kind: 'fail',
    title: '3.13 with an explicit limit and no dead-letter drops',
    raw: brokerAt('3.13.7')
      .queue('jobs', { type: 'quorum', args: { 'x-delivery-limit': 5 } })
      .build(),
    expect: [{ object: Q, result: 'fail', severity: 'S1', variant: 'drop' }],
  }),
  fixture({
    rule: 'T4',
    kind: 'near',
    title: 'limit with a dead-letter exchange',
    raw: brokerAt('4.2.1')
      .queue('jobs', {
        type: 'quorum',
        args: { 'x-dead-letter-exchange': 'dlx' },
      })
      .build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'T4',
    kind: 'near',
    title: '4.2 limit disabled with -1 is not a drop',
    raw: brokerAt('4.2.1')
      .queue('jobs', { type: 'quorum', args: { 'x-delivery-limit': -1 } })
      .build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'T4',
    kind: 'fail',
    title: 'delivery limit 0 is still a limit',
    raw: brokerAt('4.2.1')
      .queue('jobs', { type: 'quorum', args: { 'x-delivery-limit': 0 } })
      .build(),
    expect: [
      {
        object: Q,
        result: 'fail',
        severity: 'S1',
        variant: 'drop',
        params: { limit: 0, limitLayer: 'argument' },
      },
    ],
  }),
  fixture({
    rule: 'T4',
    kind: 'near',
    title: '4.0.0 limit disabled with -1 is not a loop',
    raw: brokerAt('4.0.0')
      .queue('jobs', { type: 'quorum', args: { 'x-delivery-limit': -1 } })
      .build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'T4',
    kind: 'anti',
    title: 'classic queue on 3.13',
    raw: brokerAt('3.13.7').queue('jobs').build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'T4',
    kind: 'anti',
    title: 'classic queue',
    raw: brokerAt('4.2.1').queue('jobs').build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'T4',
    kind: 'anti',
    title: 'policies cannot be read',
    raw: brokerAt('4.2.1')
      .queue('jobs', { type: 'quorum' })
      .httpError('policies', 403)
      .build(),
    expect: [{ object: Q, result: 'not_checked', path: 'queue.effective' }],
  }),
];
