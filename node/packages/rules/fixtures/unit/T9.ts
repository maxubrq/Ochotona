import { brokerAt } from '../builder';
import { declared, fixture, ref } from '../fixture';

const Q = ref.queue('cache');

export default [
  fixture({
    rule: 'T9',
    kind: 'fail',
    title: 'message-ttl without dead-letter, undeclared',
    raw: brokerAt('4.2.1')
      .queue('cache', { args: { 'x-message-ttl': 1000 } })
      .build(),
    expect: [
      {
        object: Q,
        result: 'fail',
        severity: 'S3',
        variant: 'ttl',
        urgency: 'at_risk',
        params: { ttlMs: 1000, layer: 'argument' },
        evidence: [
          'observed queue.effective key:message-ttl',
          'observed queue.effective key:dead-letter-exchange',
        ],
        fixSet: { 'dead-letter-exchange': 'ocho.retry' },
      },
    ],
  }),
  fixture({
    rule: 'T9',
    kind: 'fail',
    title: 'expires on a strict queue, even with dead-letter',
    raw: brokerAt('4.2.1')
      .queue('cache', {
        args: { 'x-expires': 60000, 'x-dead-letter-exchange': 'dlx' },
      })
      .build(),
    desired: declared({ f: { queue: 'cache', tolerance: 'strict' } }),
    expect: [
      {
        object: Q,
        result: 'fail',
        severity: 'S1',
        variant: 'expires',
        urgency: 'active_loss_path',
        params: { expiresMs: 60000, layer: 'argument' },
        evidence: ['observed queue.effective key:expires'],
      },
    ],
  }),
  fixture({
    rule: 'T9',
    kind: 'near',
    title: 'loose queue',
    raw: brokerAt('4.2.1')
      .queue('cache', { args: { 'x-message-ttl': 1000 } })
      .build(),
    desired: declared({ f: { queue: 'cache', tolerance: 'loose' } }),
    expect: [{ object: Q, result: 'pass', note: 'loose_by_declaration' }],
  }),
  fixture({
    rule: 'T9',
    kind: 'near',
    title: 'message-ttl with a dead-letter exchange from a policy',
    raw: brokerAt('4.2.1')
      .queue('cache', { args: { 'x-message-ttl': 1000 } })
      .policy('dl', {
        pattern: '^cache$',
        definition: { 'dead-letter-exchange': 'dlx' },
      })
      .build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'T9',
    kind: 'anti',
    title: 'no TTL and no expires',
    raw: brokerAt('4.2.1').queue('cache').build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'T9',
    kind: 'anti',
    title: 'policies cannot be read',
    raw: brokerAt('4.2.1').queue('cache').httpError('policies', 403).build(),
    expect: [{ object: Q, result: 'not_checked', path: 'queue.effective' }],
  }),
];
