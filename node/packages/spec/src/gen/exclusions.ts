// Sinh bởi scripts/codegen.ts từ data/. Không sửa tay.

import type { Exclusion } from '../types';

export const EXCLUSIONS = [
  {
    id: 'EX1',
    kind: 'exchange',
    match: { nameEquals: '' },
    scopes: ['topology', 'rules'],
    rulesOutcome: 'skip',
  },
  {
    id: 'EX2',
    kind: 'exchange',
    match: { namePrefix: 'amq.' },
    scopes: ['topology'],
  },
  {
    id: 'EX3',
    kind: 'exchange',
    match: { namePrefix: 'amq.', hasOutgoingBindings: false },
    scopes: ['rules'],
    rulesOutcome: 'skip',
  },
  {
    id: 'EX4',
    kind: 'queue',
    match: { exclusive: true },
    scopes: ['topology', 'rules'],
    rulesOutcome: 'skip',
  },
  {
    id: 'EX5',
    kind: 'queue',
    match: { namePrefix: 'amq.gen-' },
    scopes: ['topology', 'rules'],
    rulesOutcome: 'skip',
  },
  {
    id: 'EX6',
    kind: 'queue',
    match: { namePrefix: 'mqtt-subscription-' },
    scopes: ['topology', 'rules'],
    rulesOutcome: 'not_applicable_with_note',
  },
  {
    id: 'EX7',
    kind: 'queue',
    match: { namePrefix: 'ocho.' },
    scopes: ['rules'],
    rulesOutcome: 'skip',
  },
  {
    id: 'EX8',
    kind: 'binding',
    match: { sourceEquals: '' },
    scopes: ['topology', 'rules'],
    rulesOutcome: 'skip',
  },
  {
    id: 'EX9',
    kind: 'consumer',
    match: { queueEquals: 'amq.rabbitmq.reply-to' },
    scopes: ['rules'],
    rulesOutcome: 'skip',
  },
] as const satisfies readonly Exclusion[];
