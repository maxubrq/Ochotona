import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const Q = ref.queue('legacy');
const mirrored = (version: string, type: 'classic' | 'quorum' = 'classic') =>
  brokerAt(version)
    .queue('legacy', { type })
    .policy('ha', {
      pattern: '^legacy$',
      applyTo: 'queues',
      definition: { 'ha-mode': 'all' },
    });

export default [
  fixture({
    rule: 'VT1',
    kind: 'fail',
    title: 'mirrored classic queue before an upgrade to 4.2',
    raw: mirrored('3.13.7').build(),
    targetVersion: '4.2.0',
    expect: [{ object: Q, result: 'fail', severity: 'S1' }],
  }),
  fixture({
    rule: 'VT1',
    kind: 'near',
    title: 'upgrade within 3.13',
    raw: mirrored('3.13.2').build(),
    targetVersion: '3.13.7',
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'VT1',
    kind: 'anti',
    title: 'classic queue without ha policy',
    raw: brokerAt('3.13.7').queue('legacy').build(),
    targetVersion: '4.2.0',
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'VT1',
    kind: 'anti',
    title: 'policies cannot be read',
    raw: mirrored('3.13.7').httpError('policies', 403).build(),
    targetVersion: '4.2.0',
    expect: [{ object: Q, result: 'not_checked', path: 'policy.definition' }],
  }),
];
