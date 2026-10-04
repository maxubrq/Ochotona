import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

export default [
  fixture({
    rule: 'VT3',
    kind: 'fail',
    title: 'two deprecated features in use, one result each',
    raw: brokerAt('4.2.1')
      .deprecatedInUse('transient_nonexcl_queues', 'global_qos')
      .build(),
    expect: [
      { object: ref.broker, result: 'fail', severity: 'S3' },
      { object: ref.broker, result: 'fail', severity: 'S3' },
    ],
  }),
  fixture({
    rule: 'VT3',
    kind: 'near',
    title: 'endpoint answers with an empty list on 3.13',
    raw: brokerAt('3.13.7').build(),
    expect: [{ object: ref.broker, result: 'pass' }],
  }),
  fixture({
    rule: 'VT3',
    kind: 'anti',
    title: 'nothing deprecated in use',
    raw: brokerAt('4.2.1').build(),
    expect: [{ object: ref.broker, result: 'pass' }],
  }),
  fixture({
    rule: 'VT3',
    kind: 'anti',
    title: 'endpoint missing',
    raw: brokerAt('4.2.1').httpError('deprecatedUsed', 404).build(),
    expect: [
      {
        object: ref.broker,
        result: 'not_checked',
        path: 'broker.deprecatedInUse',
      },
    ],
  }),
];
