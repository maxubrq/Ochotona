import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const Q = ref.queue('q');
const two = (
  winner: Record<string, number | string>,
  loser: Record<string, number | string>,
  p2 = 1,
) =>
  brokerAt('4.2.1')
    .queue('q', { type: 'quorum' })
    .policy('p1', { pattern: '^q', priority: 2, definition: winner })
    .policy('p2', { pattern: '.*', priority: p2, definition: loser });

export default [
  fixture({
    rule: 'L3',
    kind: 'fail',
    title: 'two policies match; the loser has no safety key',
    raw: two({ 'max-length': 10 }, { 'message-ttl': 5 }).build(),
    expect: [{ object: Q, result: 'fail', severity: 'S3' }],
  }),
  fixture({
    rule: 'L3',
    kind: 'fail',
    title: 'the ignored policy sets dead-letter-exchange',
    raw: two({ 'max-length': 10 }, { 'dead-letter-exchange': 'dlx' }).build(),
    expect: [{ object: Q, result: 'fail', severity: 'S1', variant: 'keys' }],
  }),
  fixture({
    rule: 'L3',
    kind: 'fail',
    title: 'two policies tie on priority',
    raw: two({ 'max-length': 10 }, { 'message-ttl': 5 }, 2).build(),
    expect: [{ object: Q, result: 'fail', severity: 'S3', variant: 'tie' }],
  }),
  fixture({
    rule: 'L3',
    kind: 'fail',
    title: 'exchange loses its alternate exchange to a broader policy',
    raw: brokerAt('4.2.1')
      .exchange('orders')
      .policy('p1', {
        pattern: '^orders$',
        applyTo: 'exchanges',
        priority: 2,
        definition: { 'federation-upstream-set': 'all' },
      })
      .policy('p2', {
        pattern: '.*',
        applyTo: 'exchanges',
        priority: 1,
        definition: { 'alternate-exchange': 'ae' },
      })
      .build(),
    expect: [
      {
        object: ref.exchange('orders'),
        result: 'fail',
        severity: 'S1',
        variant: 'keys',
      },
    ],
  }),
  fixture({
    rule: 'L3',
    kind: 'near',
    title: 'the loser carries a key that does not apply to this queue type',
    raw: two({ 'max-length': 10 }, { 'alternate-exchange': 'ae' }).build(),
    expect: [{ object: Q, result: 'fail', severity: 'S3' }],
  }),
  fixture({
    rule: 'L3',
    kind: 'near',
    title: 'one policy only',
    raw: brokerAt('4.2.1')
      .queue('q')
      .policy('p1', { pattern: '^q$', definition: { 'max-length': 1 } })
      .build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'L3',
    kind: 'anti',
    title: 'policies that do not overlap',
    raw: brokerAt('4.2.1')
      .queue('q')
      .queue('r')
      .policy('p1', { pattern: '^q$', definition: { 'max-length': 1 } })
      .policy('p2', { pattern: '^r$', definition: { 'max-length': 1 } })
      .build(),
    expect: [
      { object: Q, result: 'pass' },
      { object: ref.queue('r'), result: 'pass' },
    ],
  }),
  fixture({
    rule: 'L3',
    kind: 'anti',
    title: 'pattern outside the supported PCRE subset',
    raw: brokerAt('4.2.1')
      .queue('q')
      .policy('p1', { pattern: '(?i)^Q$', definition: { 'max-length': 1 } })
      .build(),
    expect: [{ object: Q, result: 'not_checked', path: 'policy.pattern' }],
  }),
  fixture({
    rule: 'L3',
    kind: 'anti',
    title: 'policies cannot be read',
    raw: two({}, {}).httpError('policies', 403).build(),
    expect: [{ object: Q, result: 'not_checked', path: 'policy.pattern' }],
  }),
];
