import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const Q = ref.queue('orders');

export default [
  fixture({
    rule: 'T5',
    kind: 'fail',
    title: 'dead-letter argument, strategy and overflow left at defaults',
    raw: brokerAt('4.2.1')
      .queue('orders', {
        type: 'quorum',
        args: { 'x-dead-letter-exchange': 'dlx' },
      })
      .build(),
    expect: [
      {
        object: Q,
        result: 'fail',
        severity: 'S1',
        urgency: 'active_loss_path',
        params: {
          strategy: 'at-most-once',
          overflow: 'drop-head',
          strategyLayer: 'default',
          overflowLayer: 'default',
        },
        evidence: [
          'observed queue.effective key:dead-letter-exchange',
          'inferred queue.effective key:dead-letter-strategy',
          'inferred queue.effective key:overflow',
        ],
        fixSet: {
          'dead-letter-strategy': 'at-least-once',
          overflow: 'reject-publish',
        },
      },
    ],
  }),
  fixture({
    rule: 'T5',
    kind: 'fail',
    title: 'at-least-once without reject-publish',
    raw: brokerAt('3.13.7')
      .queue('orders', { type: 'quorum' })
      .policy('dlx', {
        pattern: '^orders$',
        applyTo: 'queues',
        priority: 1,
        definition: {
          'dead-letter-exchange': 'dlx',
          'dead-letter-strategy': 'at-least-once',
        },
      })
      .build(),
    expect: [{ object: Q, result: 'fail', severity: 'S1' }],
  }),
  fixture({
    rule: 'T5',
    kind: 'fail',
    title: 'reject-publish without at-least-once',
    raw: brokerAt('4.2.1')
      .queue('orders', {
        type: 'quorum',
        args: {
          'x-dead-letter-exchange': 'dlx',
          'x-overflow': 'reject-publish',
        },
      })
      .build(),
    expect: [
      {
        object: Q,
        result: 'fail',
        severity: 'S1',
        params: { overflow: 'reject-publish', overflowLayer: 'argument' },
      },
    ],
  }),
  fixture({
    rule: 'T5',
    kind: 'near',
    title: 'at-least-once and reject-publish set through a policy',
    raw: brokerAt('4.2.1')
      .queue('orders', { type: 'quorum' })
      .policy('dlx', {
        pattern: '^orders$',
        applyTo: 'queues',
        priority: 1,
        definition: {
          'dead-letter-exchange': 'ocho.retry',
          'dead-letter-strategy': 'at-least-once',
          overflow: 'reject-publish',
        },
      })
      .build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'T5',
    kind: 'anti',
    title: 'quorum queue without dead-letter, and a classic queue',
    raw: brokerAt('4.2.1')
      .queue('orders', { type: 'quorum' })
      .queue('legacy', { args: { 'x-dead-letter-exchange': 'dlx' } })
      .build(),
    expect: [
      { object: Q, result: 'pass' },
      { object: ref.queue('legacy'), result: 'pass' },
    ],
  }),
  fixture({
    rule: 'T5',
    kind: 'anti',
    title: 'policies cannot be read',
    raw: brokerAt('4.2.1')
      .queue('orders', { type: 'quorum' })
      .httpError('policies', 403)
      .build(),
    expect: [{ object: Q, result: 'not_checked', path: 'queue.effective' }],
  }),
];
