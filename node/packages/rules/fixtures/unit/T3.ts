import { brokerAt } from '../builder';
import { declared, fixture, ref } from '../fixture';

const Q = ref.queue('buf');
const limited = () =>
  brokerAt('4.2.1').queue('buf', { args: { 'x-max-length': 10 } });

export default [
  fixture({
    rule: 'T3',
    kind: 'fail',
    title: 'max-length with the default drop-head, undeclared',
    raw: limited().build(),
    expect: [
      {
        object: Q,
        result: 'fail',
        severity: 'S3',
        urgency: 'at_risk',
        params: { limit: 10, limitKind: 'messages', overflowLayer: 'default' },
        evidence: [
          'observed queue.effective key:max-length',
          'inferred queue.effective key:overflow',
        ],
        fixSet: { overflow: 'reject-publish' },
      },
    ],
  }),
  fixture({
    rule: 'T3',
    kind: 'fail',
    title: 'max-length-bytes through a policy on a strict queue',
    raw: brokerAt('4.2.1')
      .queue('buf', { type: 'quorum' })
      .policy('cap', {
        pattern: '^buf$',
        applyTo: 'queues',
        definition: { 'max-length-bytes': 1024 },
      })
      .build(),
    desired: declared({ f: { queue: 'buf', tolerance: 'strict' } }),
    expect: [
      {
        object: Q,
        result: 'fail',
        severity: 'S1',
        urgency: 'active_loss_path',
        params: { limit: 1024, limitKind: 'bytes' },
        evidence: [
          'observed queue.effective key:max-length-bytes',
          'inferred queue.effective key:overflow',
        ],
      },
    ],
  }),
  fixture({
    rule: 'T3',
    kind: 'near',
    title: 'loose queue',
    raw: limited().build(),
    desired: declared({ f: { queue: 'buf', tolerance: 'loose' } }),
    expect: [{ object: Q, result: 'pass', note: 'loose_by_declaration' }],
  }),
  fixture({
    rule: 'T3',
    kind: 'near',
    title: 'max-length with overflow reject-publish',
    raw: brokerAt('4.2.1')
      .queue('buf', {
        args: { 'x-max-length': 10, 'x-overflow': 'reject-publish' },
      })
      .build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'T3',
    kind: 'anti',
    title: 'no length limit',
    raw: brokerAt('4.2.1').queue('buf').build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'T3',
    kind: 'anti',
    title: 'policies cannot be read',
    raw: limited().httpError('policies', 403).build(),
    expect: [{ object: Q, result: 'not_checked', path: 'queue.effective' }],
  }),
];
