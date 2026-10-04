import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const N = ref.node('rabbit@a');
const limits = (memLimit: number, diskFreeLimit: number) =>
  brokerAt('4.2.1').node('rabbit@a', { memLimit, diskFreeLimit });

export default [
  fixture({
    rule: 'DX2',
    kind: 'fail',
    title: 'disk_free_limit below memory',
    raw: limits(2000, 1000).build(),
    expect: [{ object: N, result: 'fail', severity: 'S3' }],
  }),
  fixture({
    rule: 'DX2',
    kind: 'near',
    title: 'disk_free_limit equal to memory',
    raw: limits(2000, 2000).build(),
    expect: [{ object: N, result: 'pass' }],
  }),
  fixture({
    rule: 'DX2',
    kind: 'anti',
    title: 'plenty of disk headroom',
    raw: limits(1000, 5000).build(),
    expect: [{ object: N, result: 'pass' }],
  }),
  fixture({
    rule: 'DX2',
    kind: 'anti',
    title: 'nodes cannot be read',
    raw: limits(2000, 1000).httpError('nodes', 403).build(),
    expect: [{ object: ref.broker, result: 'not_checked', path: 'node' }],
  }),
];
