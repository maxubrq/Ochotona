import { describe, expect, it } from 'vitest';
import { ENDPOINT_IDS, planRead } from '../src';
import { reasonOf } from '../src/ingest/raw';

describe('planRead', () => {
  it('kế hoạch mặc định: bốn endpoint nhận diện, mười endpoint kiểm kê theo thứ tự', () => {
    const p = planRead();
    expect(p.identify.map((r) => r.id)).toEqual([
      'overview',
      'whoami',
      'featureFlags',
      'nodes',
    ]);
    expect(p.inventory.map((r) => r.id)).toEqual([
      'vhosts',
      'policies',
      'operatorPolicies',
      'deprecatedUsed',
      'exchanges',
      'queues',
      'bindings',
      'connections',
      'channels',
      'consumers',
    ]);
    expect(p.prometheus).toBe(true);
    expect(p.scope).toEqual({ vhosts: 'all' });
  });

  it('tham số và cột', () => {
    const byId = Object.fromEntries(planRead().inventory.map((r) => [r.id, r]));
    expect(byId.exchanges.query).toEqual({
      sort: 'name',
      sort_reverse: 'false',
      disable_stats: 'true',
    });
    expect(byId.queues).toMatchObject({
      paginated: true,
      query: { sort: 'name', sort_reverse: 'false' },
    });
    expect(byId.queues.columns).toContain('effective_policy_definition');
    expect(byId.channels.columns).toContain('message_stats.publish');
    expect(byId.bindings).toMatchObject({
      paginated: false,
      splitByVhost: true,
    });
    expect(byId.deprecatedUsed).toMatchObject({
      segments: ['deprecated-features', 'used'],
      requiresCapability: 'deprecatedFeaturesUsed',
    });
    expect(byId.policies.columns).toBeNull();
  });

  it('phạm vi theo vhost', () => {
    const p = planRead({ scope: { vhosts: ['/', 'b'] } });
    const segs = (id: string) =>
      p.inventory.filter((r) => r.id === id).map((r) => r.segments);
    expect(segs('queues')).toEqual([
      ['queues', '/'],
      ['queues', 'b'],
    ]);
    expect(segs('connections')).toEqual([
      ['vhosts', '/', 'connections'],
      ['vhosts', 'b', 'connections'],
    ]);
    expect(segs('operatorPolicies')).toEqual([
      ['operator-policies', '/'],
      ['operator-policies', 'b'],
    ]);
    expect(segs('vhosts')).toEqual([['vhosts']]);
    expect(p.inventory.some((r) => r.splitByVhost)).toBe(false);
  });

  it('requires lọc kiểm kê và Prometheus', () => {
    const p = planRead({ requires: new Set(['queues']) });
    expect(p.inventory.map((r) => r.id)).toEqual(['queues']);
    expect(p.prometheus).toBe(false);
    expect(planRead({ prometheus: false }).prometheus).toBe(false);
  });

  it('ENDPOINT_IDS là các khoá bắt buộc của RawResponses', () => {
    expect(ENDPOINT_IDS).toHaveLength(16);
    expect(ENDPOINT_IDS).not.toContain('users');
  });

  it('chỉ đọc /api/users khi được bật', () => {
    expect(planRead().inventory.map((r) => r.id)).not.toContain('users');
    const p = planRead({ users: true, scope: { vhosts: ['/'] } });
    expect(p.inventory.filter((r) => r.id === 'users')).toEqual([
      {
        id: 'users',
        segments: ['users'],
        paginated: false,
        columns: null,
        query: {},
      },
    ]);
  });
});

describe('reasonOf với trường mới của RawResult', () => {
  it('not_attempted vì capability → endpoint_missing', () => {
    expect(reasonOf({ status: 'not_attempted', reason: 'capability' })).toEqual(
      {
        kind: 'endpoint_missing',
        status: 404,
      },
    );
    expect(reasonOf({ status: 'not_attempted', reason: 'off' })).toEqual({
      kind: 'source_unavailable',
    });
  });
  it('http_error có note', () => {
    expect(
      reasonOf({ status: 'http_error', code: 200, note: 'pagination_runaway' }),
    ).toEqual({
      kind: 'error',
      message: 'pagination_runaway (HTTP 200)',
    });
  });
});
