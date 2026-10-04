// Sinh bởi scripts/codegen.ts từ data/. Không sửa tay.

import type { FixTemplate } from '../types';

export const FIX_TEMPLATES = [
  {
    id: 'policy.declare',
    tool: 'rabbitmqadmin',
    command:
      'rabbitmqadmin --vhost {vhost} policies declare --name {name} --pattern {pattern} --apply-to {applyTo} --priority {priority} --definition {definition}',
    params: ['vhost', 'name', 'pattern', 'applyTo', 'priority', 'definition'],
    assumption: 'GC25',
  },
] as const satisfies readonly FixTemplate[];
