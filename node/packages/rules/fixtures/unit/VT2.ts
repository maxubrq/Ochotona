import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const Q = ref.queue('jobs');

export default [
  fixture({
    rule: 'VT2',
    kind: 'fail',
    title: 'quorum queue without dead-letter or limit, upgrading to 4.2',
    raw: brokerAt('3.13.7').queue('jobs', { type: 'quorum' }).build(),
    targetVersion: '4.2.0',
    expect: [{ object: Q, result: 'fail', severity: 'S1' }],
  }),
  fixture({
    rule: 'VT2',
    kind: 'near',
    title: 'dead-letter already set',
    raw: brokerAt('3.13.7')
      .queue('jobs', {
        type: 'quorum',
        args: { 'x-dead-letter-exchange': 'dlx' },
      })
      .build(),
    targetVersion: '4.2.0',
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'VT2',
    kind: 'anti',
    title: 'classic queue',
    raw: brokerAt('3.13.7').queue('jobs').build(),
    targetVersion: '4.2.0',
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'VT2',
    kind: 'anti',
    title: 'policies cannot be read',
    raw: brokerAt('3.13.7')
      .queue('jobs', { type: 'quorum' })
      .httpError('policies', 403)
      .build(),
    targetVersion: '4.2.0',
    expect: [{ object: Q, result: 'not_checked', path: 'queue.effective' }],
  }),
];
