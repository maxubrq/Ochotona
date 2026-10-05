// FieldPath → endpoint của `model.planRead`. Pha nhận diện (overview, whoami,
// nodes, feature flags) luôn được đọc, nên trường của broker, node, whoami
// không thêm endpoint kiểm kê nào.
import type { EndpointId, ObjectKind, PlanOptions } from '@ochotona/model';
import { type Entity, type FieldPath, entityOf } from './paths';
import type { AnyRuleDef } from './types';

const EFFECTIVE: readonly EndpointId[] = [
  'policies',
  'operatorPolicies',
  'vhosts',
];

const BY_ENTITY: Readonly<
  Partial<Record<Entity | ObjectKind, readonly EndpointId[]>>
> = {
  exchange: ['exchanges'],
  queue: ['queues'],
  binding: ['bindings'],
  channel: ['channels'],
  connection: ['connections'],
  consumer: ['consumers'],
  policy: ['policies'],
  vhost: ['vhosts'],
};

/** Endpoint riêng của một trường, ngoài endpoint của thực thể. */
const BY_PATH: Readonly<Partial<Record<FieldPath, readonly EndpointId[]>>> = {
  'exchange.effective': EFFECTIVE,
  'exchange.effectiveCheck': EFFECTIVE,
  'queue.effective': EFFECTIVE,
  'queue.effectiveCheck': EFFECTIVE,
  'broker.deprecatedInUse': ['deprecatedUsed'],
  // Quan hệ consumer → queue (C2 đọc tốc độ của queue).
  'consumer.queue': ['queues'],
};

/**
 * Tham số cho `model.planRead` từ các luật đã chọn: endpoint kiểm kê cần đọc,
 * có cần Prometheus không, và có luật muốn `/api/users` không. `planRead` chỉ đọc
 * `users` khi CLI bật `users: true`, tức khi chạy bằng user quản trị.
 * @example planRead({ ...readNeeds(rules), users: isAdmin, scope })
 */
export function readNeeds(defs: readonly AnyRuleDef[]): Required<
  Pick<PlanOptions, 'requires' | 'prometheus'>
> & {
  wantsUsers: boolean;
} {
  const ids = new Set<EndpointId>();
  let prometheus = false;
  let wantsUsers = false;
  const add = (xs: readonly EndpointId[] | undefined) =>
    xs?.forEach((x) => ids.add(x));
  for (const d of defs) {
    add(BY_ENTITY[d.appliesTo as ObjectKind]);
    for (const p of [...d.requires, ...d.optional]) {
      const e = entityOf(p);
      add(BY_ENTITY[e]);
      add(BY_PATH[p]);
      if (p === 'broker.counters.unroutableDropped') {
        // planRead chỉ đọc Prometheus khi `requires` có 'prometheus' và cờ bật.
        prometheus = true;
        ids.add('prometheus');
      }
      if (e === 'user') {
        wantsUsers = true;
        ids.add('users');
      }
    }
  }
  return { requires: ids, prometheus, wantsUsers };
}
