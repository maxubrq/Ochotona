// Tầng tích hợp trên bản ghi thô của ma trận SUT (`SUT/common/definitions.json`,
// ghi bằng `SUT/record.sh` vào `node/fixtures/raw`). Cùng định dạng `expect`
// với tầng đơn vị; `recordings` lọc theo `<phiên bản>/<biến thể>`.
import type { RuleCode } from '@ochotona/spec';
import type { Expect } from '../fixture';
import { ref } from '../fixture';

export interface RecordedCase {
  readonly rule: RuleCode;
  readonly kind: 'fail' | 'near' | 'anti';
  readonly title: string;
  readonly recordings: (rec: string) => boolean;
  readonly targetVersion?: string;
  readonly expect: readonly Expect[];
}

const any = () => true;
const is313 = (rec: string) => rec.startsWith('rabbitmq-3.13/');
const statsOff = (rec: string) => /\/(nostats|listonly)$/.test(rec);
const statsOn = (rec: string) => !statsOff(rec);
const P = 'payments';

export const recordedCases: readonly RecordedCase[] = [
  {
    rule: 'T2',
    kind: 'fail',
    title: 'topic exchange orders has a binding and no alternate exchange',
    recordings: any,
    expect: [
      {
        object: ref.exchange('orders', P),
        result: 'fail',
        severity: 'S3',
        variant: 'at_risk',
      },
    ],
  },
  {
    rule: 'T2',
    kind: 'near',
    title:
      'events has a bound alternate exchange; orders.dlx is a bound fanout',
    recordings: any,
    expect: [
      { object: ref.exchange('events'), result: 'pass' },
      { object: ref.exchange('orders.dlx', P), result: 'pass' },
    ],
  },
  {
    rule: 'T5',
    kind: 'fail',
    title: 'orders.created dead-letters with the default at-most-once',
    recordings: any,
    expect: [
      {
        object: ref.queue('orders.created', P),
        result: 'fail',
        severity: 'S1',
      },
    ],
  },
  {
    rule: 'T4',
    kind: 'fail',
    title: 'orders.parking has no dead-letter: drop from 4.0, loop on 3.13',
    recordings: (r) => !is313(r),
    expect: [
      {
        object: ref.queue('orders.parking', P),
        result: 'fail',
        severity: 'S1',
        variant: 'drop',
      },
    ],
  },
  {
    rule: 'T4',
    kind: 'fail',
    title: 'orders.parking loops on 3.13',
    recordings: is313,
    expect: [
      {
        object: ref.queue('orders.parking', P),
        result: 'fail',
        severity: 'S3',
        variant: 'loop',
      },
    ],
  },
  {
    rule: 'T4',
    kind: 'near',
    title: 'orders.created has a delivery limit and a dead-letter exchange',
    recordings: any,
    expect: [{ object: ref.queue('orders.created', P), result: 'pass' }],
  },
  {
    rule: 'T3',
    kind: 'fail',
    title: 'max-length from policy orders-limit, overflow left at drop-head',
    recordings: any,
    expect: [
      {
        object: ref.queue('orders.created', P),
        result: 'fail',
        severity: 'S3',
      },
    ],
  },
  {
    rule: 'T3',
    kind: 'near',
    title: 'audit has max-length with reject-publish',
    recordings: any,
    expect: [{ object: ref.queue('audit'), result: 'pass' }],
  },
  {
    rule: 'T9',
    kind: 'fail',
    title: 'audit has message-ttl from a policy and no dead-letter',
    recordings: any,
    expect: [
      {
        object: ref.queue('audit'),
        result: 'fail',
        severity: 'S3',
        variant: 'ttl',
      },
    ],
  },
  {
    rule: 'T9',
    kind: 'near',
    title: 'events.unrouted has neither TTL nor expires',
    recordings: any,
    expect: [{ object: ref.queue('events.unrouted'), result: 'pass' }],
  },
  {
    rule: 'VT2',
    kind: 'fail',
    title: 'orders.parking on 3.13 gets the default delivery limit after 4.2',
    recordings: is313,
    targetVersion: '4.2.0',
    expect: [
      {
        object: ref.queue('orders.parking', P),
        result: 'fail',
        severity: 'S1',
      },
    ],
  },
  {
    rule: 'VT2',
    kind: 'near',
    title: 'orders.created already dead-letters',
    recordings: is313,
    targetVersion: '4.2.0',
    expect: [{ object: ref.queue('orders.created', P), result: 'pass' }],
  },
  {
    rule: 'T5',
    kind: 'near',
    title: 'orders.safe dead-letters at-least-once with reject-publish',
    recordings: any,
    expect: [{ object: ref.queue('orders.safe', P), result: 'pass' }],
  },
  {
    rule: 'L3',
    kind: 'fail',
    title: 'overlap-b is ignored and carries dead-letter-exchange',
    recordings: any,
    expect: [
      {
        object: ref.queue('overlap'),
        result: 'fail',
        severity: 'S1',
        variant: 'keys',
      },
    ],
  },
  {
    rule: 'R1',
    kind: 'fail',
    title: 'the legacy perf-test publishes without confirms',
    recordings: statsOn,
    expect: [{ object: '*', result: 'fail', severity: 'S3' }],
  },
  {
    rule: 'R1',
    kind: 'near',
    title: 'the main perf-test publishes with confirms',
    recordings: statsOn,
    expect: [{ object: '*', result: 'pass' }],
  },
  {
    rule: 'C1',
    kind: 'fail',
    title: 'the legacy perf-test consumes with auto-ack',
    recordings: statsOn,
    expect: [{ object: '*', result: 'fail', severity: 'S3' }],
  },
  {
    rule: 'C1',
    kind: 'near',
    title: 'the main perf-test consumes with manual ack',
    recordings: statsOn,
    expect: [{ object: '*', result: 'pass' }],
  },
  {
    rule: 'T1',
    kind: 'fail',
    title: 'classic work.backlog has a consumer and a backlog',
    recordings: statsOn,
    expect: [
      { object: ref.queue('work.backlog'), result: 'fail', severity: 'S3' },
    ],
  },
  {
    rule: 'T1',
    kind: 'near',
    title: 'classic events.unrouted has no consumer',
    recordings: statsOn,
    expect: [{ object: ref.queue('events.unrouted'), result: 'pass' }],
  },
  {
    rule: 'VT1',
    kind: 'fail',
    title: 'legacy is mirrored by policy legacy-ha on 3.13',
    recordings: is313,
    targetVersion: '4.2.0',
    expect: [{ object: ref.queue('legacy'), result: 'fail', severity: 'S1' }],
  },
  {
    rule: 'VT1',
    kind: 'near',
    title: 'audit is a classic queue without ha-mode',
    recordings: is313,
    targetVersion: '4.2.0',
    expect: [{ object: ref.queue('audit'), result: 'pass' }],
  },
  {
    rule: 'Q3',
    kind: 'anti',
    title: 'Ocho runs as ocho-doctor: tags of ocho-admin cannot be read',
    recordings: (r) => statsOn(r) || !r.startsWith('rabbitmq-4.3/'),
    expect: [{ object: '*', result: 'not_checked', path: 'user.tags' }],
  },
  {
    rule: 'L3',
    kind: 'near',
    title: 'user policies of the SUT do not overlap',
    recordings: any,
    expect: [
      { object: ref.queue('audit'), result: 'pass' },
      { object: ref.queue('orders.created', P), result: 'pass' },
    ],
  },
  {
    rule: 'R1',
    kind: 'anti',
    title: 'statistics disabled: channels are not checked, never passed',
    recordings: statsOff,
    expect: [{ object: ref.broker, result: 'not_checked', path: 'channel' }],
  },
  {
    rule: 'C1',
    kind: 'anti',
    title: 'statistics disabled: consumers are not checked, never passed',
    recordings: statsOff,
    expect: [{ object: ref.broker, result: 'not_checked', path: 'consumer' }],
  },
];
