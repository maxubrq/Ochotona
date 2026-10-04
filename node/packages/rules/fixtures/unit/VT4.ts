import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

export default [
  fixture({
    rule: 'VT4',
    kind: 'fail',
    title: 'rolling upgrade left two versions',
    raw: brokerAt('4.2.0')
      .node('rabbit@a', { version: '4.2.1' })
      .node('rabbit@b', { version: '4.2.0' })
      .build(),
    expect: [{ object: ref.broker, result: 'fail', severity: 'S3' }],
  }),
  fixture({
    rule: 'VT4',
    kind: 'near',
    title: 'only a stopped node differs',
    raw: brokerAt('4.2.1')
      .node('rabbit@a')
      .node('rabbit@b')
      .node('rabbit@c', { version: '4.1.0', running: false })
      .build(),
    expect: [{ object: ref.broker, result: 'pass' }],
  }),
  fixture({
    rule: 'VT4',
    kind: 'anti',
    title: 'single node',
    raw: brokerAt('4.2.1').build(),
    expect: [{ object: ref.broker, result: 'pass' }],
  }),
  fixture({
    rule: 'VT4',
    kind: 'anti',
    title: 'nodes cannot be read',
    raw: brokerAt('4.2.1').httpError('nodes', 403).build(),
    expect: [
      { object: ref.broker, result: 'not_checked', path: 'node.running' },
    ],
  }),
];
