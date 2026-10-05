// Sinh bởi `pnpm examples` từ fixtures/unit; đừng sửa tay.
import type { RuleCode } from '@ochotona/spec';
import type { RuleExample } from '../examples';

export const EXAMPLES: Readonly<
  Partial<Record<RuleCode, readonly RuleExample[]>>
> = {
  C1: [
    {
      kind: 'fail',
      title: 'auto-ack consumer, undeclared queue',
      object: 'consumer ct on channel c1 (1)',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'auto-ack consumer on a loose queue',
      object: 'consumer ct on channel c1 (1)',
      result: 'pass',
    },
  ],
  C2: [
    {
      kind: 'fail',
      title: 'prefetch 0',
      object: 'consumer ct on channel c1 (1)',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'prefetch 1 on a slow queue',
      object: 'consumer ct on channel c1 (1)',
      result: 'pass',
    },
  ],
  DX1: [
    {
      kind: 'fail',
      title: 'two million ready messages',
      object: 'queue backlog',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'exactly at the threshold',
      object: 'queue backlog',
      result: 'pass',
    },
  ],
  DX2: [
    {
      kind: 'fail',
      title: 'disk_free_limit below memory',
      object: 'node rabbit@a',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'disk_free_limit equal to memory',
      object: 'node rabbit@a',
      result: 'pass',
    },
  ],
  DX3: [
    {
      kind: 'fail',
      title: 'connections and queues are both churned',
      object: 'broker',
      result: 'fail',
      severity: 'S5',
      variant: 'connection',
    },
    {
      kind: 'near',
      title: 'exactly at the threshold',
      object: 'broker',
      result: 'pass',
    },
  ],
  F4: [
    {
      kind: 'fail',
      title: '80% of deliveries are redeliveries',
      object: 'queue work',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'ratio exactly at the threshold',
      object: 'queue work',
      result: 'pass',
    },
  ],
  L3: [
    {
      kind: 'fail',
      title: 'two policies match; the loser has no safety key',
      object: 'queue q',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'the loser carries a key that does not apply to this queue type',
      object: 'queue q',
      result: 'fail',
      severity: 'S3',
    },
  ],
  N1: [
    {
      kind: 'fail',
      title: 'one connection publishes on channel 1 and consumes on channel 2',
      object: 'connection c1',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'publishing and consuming on separate connections',
      object: 'connection c1',
      result: 'pass',
    },
  ],
  N2: [
    {
      kind: 'fail',
      title: 'unnamed connection with a known client',
      object: 'connection c1',
      result: 'fail',
      severity: 'S3',
      variant: 'product',
    },
    {
      kind: 'near',
      title: 'named connection',
      object: 'connection c1',
      result: 'pass',
    },
  ],
  N3: [
    {
      kind: 'fail',
      title: 'heartbeat 0',
      object: 'connection c1',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'heartbeat 1 second',
      object: 'connection c1',
      result: 'pass',
    },
  ],
  Q3: [
    {
      kind: 'fail',
      title: 'application connects as guest',
      object: 'connection c1',
      result: 'fail',
      severity: 'S3',
      variant: 'guest',
    },
    {
      kind: 'near',
      title:
        '/api/users read: the application user has only the management tag',
      object: 'connection c1',
      result: 'pass',
    },
  ],
  R1: [
    {
      kind: 'fail',
      title: 'channel published without confirms, undeclared',
      object: 'channel c1 (1)',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'user serves only loose flows',
      object: 'channel c1 (1)',
      result: 'pass',
    },
  ],
  T1: [
    {
      kind: 'fail',
      title: 'undeclared classic queue in use',
      object: 'queue store',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'undeclared classic queue with a backlog but no consumer',
      object: 'queue store',
      result: 'pass',
    },
  ],
  T2: [
    {
      kind: 'fail',
      title: 'no alternate exchange, nothing dropped yet, undeclared',
      object: 'exchange orders',
      result: 'fail',
      severity: 'S3',
      variant: 'at_risk',
    },
    {
      kind: 'near',
      title: 'loose flow accepts the risk by declaration',
      object: 'exchange orders',
      result: 'pass',
    },
  ],
  T3: [
    {
      kind: 'fail',
      title: 'max-length with the default drop-head, undeclared',
      object: 'queue buf',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'loose queue',
      object: 'queue buf',
      result: 'pass',
    },
  ],
  T4: [
    {
      kind: 'fail',
      title: '4.2 quorum queue without dead-letter gets the default limit 20',
      object: 'queue jobs',
      result: 'fail',
      severity: 'S1',
      variant: 'drop',
    },
    {
      kind: 'near',
      title: 'limit with a dead-letter exchange',
      object: 'queue jobs',
      result: 'pass',
    },
  ],
  T5: [
    {
      kind: 'fail',
      title: 'dead-letter argument, strategy and overflow left at defaults',
      object: 'queue orders',
      result: 'fail',
      severity: 'S1',
    },
    {
      kind: 'near',
      title: 'at-least-once and reject-publish set through a policy',
      object: 'queue orders',
      result: 'pass',
    },
  ],
  T9: [
    {
      kind: 'fail',
      title: 'message-ttl without dead-letter, undeclared',
      object: 'queue cache',
      result: 'fail',
      severity: 'S3',
      variant: 'ttl',
    },
    {
      kind: 'near',
      title: 'loose queue',
      object: 'queue cache',
      result: 'pass',
    },
  ],
  VT1: [
    {
      kind: 'fail',
      title: 'mirrored classic queue before an upgrade to 4.2',
      object: 'queue legacy',
      result: 'fail',
      severity: 'S1',
    },
    {
      kind: 'near',
      title: 'upgrade within 3.13',
      object: 'queue legacy',
      result: 'pass',
    },
  ],
  VT2: [
    {
      kind: 'fail',
      title: 'quorum queue without dead-letter or limit, upgrading to 4.2',
      object: 'queue jobs',
      result: 'fail',
      severity: 'S1',
    },
    {
      kind: 'near',
      title: 'dead-letter already set',
      object: 'queue jobs',
      result: 'pass',
    },
  ],
  VT3: [
    {
      kind: 'fail',
      title: 'two deprecated features in use, one result each',
      object: 'broker',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'endpoint answers with an empty list on 3.13',
      object: 'broker',
      result: 'pass',
    },
  ],
  VT4: [
    {
      kind: 'fail',
      title: 'rolling upgrade left two versions',
      object: 'broker',
      result: 'fail',
      severity: 'S3',
    },
    {
      kind: 'near',
      title: 'only a stopped node differs',
      object: 'broker',
      result: 'pass',
    },
  ],
};
