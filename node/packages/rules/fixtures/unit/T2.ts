import { brokerAt } from '../builder';
import { declared, fixture, ref } from '../fixture';

const orders = () =>
  brokerAt('4.2.1').exchange('orders').queue('q').bind('orders', 'q');
const X = ref.exchange('orders');

export default [
  fixture({
    rule: 'T2',
    kind: 'fail',
    title: 'no alternate exchange, nothing dropped yet, undeclared',
    raw: orders().build(),
    expect: [
      {
        object: X,
        result: 'fail',
        severity: 'S3',
        variant: 'at_risk',
        urgency: 'at_risk',
        params: { reason: 'missing' },
        evidence: [
          'observed exchange.effective key:alternate-exchange',
          'inferred binding.destination',
        ],
        fixSet: { 'alternate-exchange': 'ocho.unroutable' },
      },
    ],
  }),
  fixture({
    rule: 'T2',
    kind: 'fail',
    title: 'cluster counter shows drops: S1 even when undeclared',
    raw: orders().droppedUnroutable(7).build(),
    expect: [
      {
        object: X,
        result: 'fail',
        severity: 'S1',
        variant: 'dropped',
        urgency: 'loss_occurred',
        params: {
          reason: 'missing',
          count: 7,
          since: '2026-10-04T00:00:00.000Z',
        },
        evidence: [
          'observed exchange.effective key:alternate-exchange',
          'inferred binding.destination',
          'observed broker.counters.unroutableDropped',
        ],
      },
    ],
  }),
  fixture({
    rule: 'T2',
    kind: 'fail',
    title: 'only one node reports drops through Prometheus',
    raw: orders()
      .node('rabbit@a')
      .node('rabbit@b')
      .promDropped(3, 'rabbit@b')
      .build(),
    expect: [
      {
        object: X,
        result: 'fail',
        severity: 'S1',
        variant: 'dropped_node',
        params: { node: 'rabbit@b', count: 3 },
      },
    ],
  }),
  fixture({
    rule: 'T2',
    kind: 'fail',
    title: 'strict flow through the exchange',
    raw: orders().build(),
    desired: declared({
      f: { exchange: 'orders', groups: ['q'], tolerance: 'strict' },
    }),
    expect: [
      {
        object: X,
        result: 'fail',
        severity: 'S1',
        variant: 'at_risk',
        urgency: 'active_loss_path',
      },
    ],
  }),
  fixture({
    rule: 'T2',
    kind: 'fail',
    title: 'alternate exchange points to an exchange that does not exist',
    raw: brokerAt('4.2.1')
      .exchange('orders', { args: { 'alternate-exchange': 'gone' } })
      .queue('q')
      .bind('orders', 'q')
      .build(),
    expect: [
      {
        object: X,
        result: 'fail',
        severity: 'S3',
        params: { reason: 'dangling' },
      },
    ],
  }),
  fixture({
    rule: 'T2',
    kind: 'near',
    title: 'loose flow accepts the risk by declaration',
    raw: orders().droppedUnroutable(7).build(),
    desired: declared({
      f: { exchange: 'orders', groups: ['q'], tolerance: 'loose' },
    }),
    expect: [{ object: X, result: 'pass', note: 'loose_by_declaration' }],
  }),
  fixture({
    rule: 'T2',
    kind: 'near',
    title: 'alternate exchange set through a policy, bound to a queue',
    raw: orders()
      .exchange('ocho.unroutable', { type: 'fanout' })
      .queue('unroutable')
      .bind('ocho.unroutable', 'unroutable')
      .policy('ae', {
        pattern: '^orders$',
        applyTo: 'exchanges',
        definition: { 'alternate-exchange': 'ocho.unroutable' },
      })
      .build(),
    expect: [
      { object: X, result: 'pass' },
      { object: ref.exchange('ocho.unroutable'), result: 'pass' },
    ],
  }),
  fixture({
    rule: 'T2',
    kind: 'near',
    title: 'alternate exchange exists but has no binding',
    raw: brokerAt('4.2.1')
      .exchange('orders', { args: { 'alternate-exchange': 'ae' } })
      .exchange('ae', { type: 'fanout' })
      .queue('q')
      .bind('orders', 'q')
      .build(),
    expect: [
      {
        object: X,
        result: 'fail',
        severity: 'S3',
        params: { reason: 'unbound' },
      },
      { object: ref.exchange('ae'), result: 'pass' },
    ],
  }),
  fixture({
    rule: 'T2',
    kind: 'anti',
    title: 'exchange with no outgoing binding, and amq. exchanges are skipped',
    raw: brokerAt('4.2.1').exchange('idle').exchange('amq.direct').build(),
    expect: [
      { object: ref.exchange('idle'), result: 'pass' },
      { object: ref.exchange('amq.direct'), result: 'none' },
    ],
  }),
  fixture({
    rule: 'T2',
    kind: 'anti',
    title: 'bindings cannot be read',
    raw: orders().httpError('bindings', 403).build(),
    expect: [{ object: X, result: 'not_checked', path: 'binding.destination' }],
  }),
];
