import { brokerAt } from '../builder';
import { declared, fixture, ref } from '../fixture';

const CH = ref.channel('c1', 1);
const publishing = (confirm: boolean, publish = 5) =>
  brokerAt('4.2.1')
    .queue('q')
    .connection('c1', { user: 'app' })
    .channel('c1', 1, { confirm, publish });
const service = (tolerance: 'strict' | 'loose') =>
  declared(
    { f: { queue: 'q', tolerance } },
    { app: { user: 'app', flows: ['f'] } },
  );

export default [
  fixture({
    rule: 'R1',
    kind: 'fail',
    title: 'channel published without confirms, undeclared',
    raw: publishing(false).build(),
    expect: [
      {
        object: CH,
        result: 'fail',
        severity: 'S3',
        urgency: 'at_risk',
        params: { connection: 'c1', user: 'app', publishCount: 5 },
        evidence: ['observed channel.publishCount', 'observed channel.confirm'],
      },
    ],
  }),
  fixture({
    rule: 'R1',
    kind: 'fail',
    title: 'user serves a strict flow',
    raw: publishing(false).build(),
    desired: service('strict'),
    expect: [{ object: CH, result: 'fail', severity: 'S1' }],
  }),
  fixture({
    rule: 'R1',
    kind: 'near',
    title: 'user serves only loose flows',
    raw: publishing(false).build(),
    desired: service('loose'),
    expect: [{ object: CH, result: 'pass', note: 'loose_by_declaration' }],
  }),
  fixture({
    rule: 'R1',
    kind: 'near',
    title: 'channel publishes with confirms',
    raw: publishing(true).build(),
    expect: [{ object: CH, result: 'pass' }],
  }),
  fixture({
    rule: 'R1',
    kind: 'anti',
    title: 'channel never published',
    raw: publishing(false, 0).build(),
    expect: [{ object: CH, result: 'pass' }],
  }),
  fixture({
    rule: 'R1',
    kind: 'anti',
    title: 'statistics disabled: channels cannot be listed',
    raw: publishing(false).statsOff().build(),
    expect: [{ object: ref.broker, result: 'not_checked', path: 'channel' }],
  }),
];
