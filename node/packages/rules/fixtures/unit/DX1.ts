import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const Q = ref.queue('backlog');
const ready = (n: number) => brokerAt('4.2.1').queue('backlog', { ready: n });

export default [
  fixture({
    rule: 'DX1',
    kind: 'fail',
    title: 'two million ready messages',
    raw: ready(2_000_000).build(),
    expect: [{ object: Q, result: 'fail', severity: 'S3' }],
  }),
  fixture({
    rule: 'DX1',
    kind: 'near',
    title: 'exactly at the threshold',
    raw: ready(1_000_000).build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'DX1',
    kind: 'anti',
    title: 'empty queue',
    raw: ready(0).build(),
    expect: [{ object: Q, result: 'pass' }],
  }),
  fixture({
    rule: 'DX1',
    kind: 'anti',
    title: 'statistics disabled',
    raw: ready(2_000_000).statsOff().build(),
    expect: [{ object: Q, result: 'not_checked', path: 'queue.ready' }],
  }),
];
