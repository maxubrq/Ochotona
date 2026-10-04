import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const C = ref.connection('c1');

export default [
  fixture({
    rule: 'N3',
    kind: 'fail',
    title: 'heartbeat 0',
    raw: brokerAt('4.2.1').connection('c1', { heartbeat: 0 }).build(),
    expect: [{ object: C, result: 'fail', severity: 'S3' }],
  }),
  fixture({
    rule: 'N3',
    kind: 'near',
    title: 'heartbeat 1 second',
    raw: brokerAt('4.2.1').connection('c1', { heartbeat: 1 }).build(),
    expect: [{ object: C, result: 'pass' }],
  }),
  fixture({
    rule: 'N3',
    kind: 'anti',
    title: 'STOMP connection with heartbeat 0',
    raw: brokerAt('4.2.1')
      .connection('c1', { protocol: 'STOMP 1.2', heartbeat: 0 })
      .build(),
    expect: [{ object: C, result: 'not_applicable', note: 'protocol' }],
  }),
  fixture({
    rule: 'N3',
    kind: 'anti',
    title: 'connections cannot be read',
    raw: brokerAt('4.2.1')
      .connection('c1')
      .httpError('connections', 403)
      .build(),
    expect: [{ object: ref.broker, result: 'not_checked', path: 'connection' }],
  }),
];
