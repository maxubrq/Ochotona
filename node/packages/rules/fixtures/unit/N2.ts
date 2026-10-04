import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const C = ref.connection('c1');

export default [
  fixture({
    rule: 'N2',
    kind: 'fail',
    title: 'unnamed connection with a known client',
    raw: brokerAt('4.2.1')
      .connection('c1', { connectionName: null, product: 'pika' })
      .build(),
    expect: [{ object: C, result: 'fail', severity: 'S3', variant: 'product' }],
  }),
  fixture({
    rule: 'N2',
    kind: 'fail',
    title: 'unnamed connection, client sends no product',
    raw: brokerAt('4.2.1')
      .connection('c1', { connectionName: null, product: null })
      .build(),
    expect: [{ object: C, result: 'fail', severity: 'S3' }],
  }),
  fixture({
    rule: 'N2',
    kind: 'near',
    title: 'named connection',
    raw: brokerAt('4.2.1')
      .connection('c1', { connectionName: 'billing-worker' })
      .build(),
    expect: [{ object: C, result: 'pass' }],
  }),
  fixture({
    rule: 'N2',
    kind: 'anti',
    title: 'MQTT connection without a name',
    raw: brokerAt('4.2.1')
      .connection('c1', { protocol: 'MQTT 3-1-1', connectionName: null })
      .build(),
    expect: [{ object: C, result: 'not_applicable', note: 'protocol' }],
  }),
  fixture({
    rule: 'N2',
    kind: 'anti',
    title: 'statistics disabled: protocol not reported',
    raw: brokerAt('4.2.1')
      .connection('c1', { protocol: '', connectionName: null })
      .build(),
    expect: [{ object: C, result: 'not_checked', path: 'connection.protocol' }],
  }),
  fixture({
    rule: 'N2',
    kind: 'anti',
    title: 'connections cannot be read',
    raw: brokerAt('4.2.1')
      .connection('c1')
      .httpError('connections', 403)
      .build(),
    expect: [{ object: ref.broker, result: 'not_checked', path: 'connection' }],
  }),
];
