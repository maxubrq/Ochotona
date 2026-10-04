import { describe, expect, it } from 'vitest';
import {
  type Instant,
  all,
  argsKey,
  compareVersion,
  derive,
  displayOr,
  firstKnown,
  known,
  map,
  parseObjectSelector,
  parseVersion,
  refKey,
  refLabel,
  rootReason,
  stableJson,
  unknown,
} from '../src';

const at = (s: string) => s as Instant;
const prov = (t: string) => ({
  source: 'http.list' as const,
  path: 'http:/x',
  observedAt: at(t),
});

describe('Observed', () => {
  const a = known(1, prov('2026-01-01T00:00:01.000Z'));
  const b = known('x', prov('2026-01-01T00:00:03.000Z'));
  const u = unknown(
    { kind: 'forbidden', status: 403 },
    'http.list',
    'http:/api/policies',
  );

  it('map giữ prov, unknown đi qua', () => {
    expect(map(a, (v) => v + 1)).toEqual(known(2, a.prov));
    expect(map(u, () => 1)).toBe(u);
  });

  it('all lấy unknown đầu tiên, bọc depends_on', () => {
    const r = all([a, u, b]);
    expect(r.state).toBe('unknown');
    if (r.state === 'unknown') {
      expect(r.reason).toEqual({
        kind: 'depends_on',
        path: 'http:/api/policies',
        reason: u.reason,
      });
      expect(rootReason(r)).toEqual({ kind: 'forbidden', status: 403 });
    }
  });

  it('derive lấy observedAt muộn nhất, source derived', () => {
    const r = derive([a, b], ([n, s]) => `${s}${n}`, 'derived:t');
    expect(r).toEqual(
      known('x1', {
        source: 'derived',
        path: 'derived:t',
        observedAt: b.prov.observedAt,
      }),
    );
  });

  it('firstKnown', () => {
    expect(firstKnown(u, a)).toBe(a);
    expect(firstKnown<number>(u, u)).toBe(u);
  });

  it('displayOr', () => {
    expect(displayOr(u, 'n/a')).toBe('n/a');
    expect(displayOr(b, 'n/a')).toBe('x');
  });
});

describe('Version', () => {
  it('parse', () => {
    expect(parseVersion('3.13')).toEqual({
      major: 3,
      minor: 13,
      patch: 0,
      raw: '3.13',
    });
    expect(parseVersion('4.3.0-rc.1')).toEqual({
      major: 4,
      minor: 3,
      patch: 0,
      pre: 'rc.1',
      raw: '4.3.0-rc.1',
    });
    expect(parseVersion('4.x')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });

  it('so sánh theo semver', () => {
    const v = (s: string) => parseVersion(s)!;
    expect(compareVersion(v('4.0.0-rc.1'), v('4.0.0'))).toBe(-1);
    expect(compareVersion(v('4.0.0-rc.2'), v('4.0.0-rc.10'))).toBe(-1);
    expect(compareVersion(v('3.13.7'), v('3.13.7'))).toBe(0);
    expect(compareVersion(v('4.10.0'), v('4.9.9'))).toBe(1);
  });
});

describe('Định danh', () => {
  it('refKey theo bảng ví dụ của spec', () => {
    expect(
      refKey({ kind: 'queue', vhost: '/', name: 'request_clamav_q' }),
    ).toBe('queue:%2F:request_clamav_q');
    expect(
      refKey({
        kind: 'binding',
        vhost: '/',
        source: 'scan.request',
        destinationType: 'queue',
        destination: 'request_clamav_q',
        routingKey: 'request_clamav',
        argsKey: '',
      }),
    ).toBe('binding:%2F:scan.request:queue:request_clamav_q:request_clamav:');
    expect(
      refKey({
        kind: 'consumer',
        channel: '10.0.0.5:51234 -> 10.0.0.9:5672 (1)',
        tag: 'ctag-1',
      }),
    ).toBe('consumer:10.0.0.5%3A51234%20-%3E%2010.0.0.9%3A5672%20(1):ctag-1');
  });

  it('refLabel', () => {
    expect(refLabel({ kind: 'queue', vhost: '/', name: 'q' })).toBe('queue q');
    expect(refLabel({ kind: 'queue', vhost: 'billing', name: 'q' })).toBe(
      'queue q (vhost billing)',
    );
  });

  it('stableJson sắp khoá ở mọi cấp, giữ thứ tự mảng', () => {
    expect(stableJson({ b: 1, a: { d: [3, 1], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,1]},"b":1}',
    );
  });

  it('argsKey', () => {
    expect(argsKey({})).toBe('');
    expect(argsKey({ a: 1, b: 2 })).toMatch(/^[0-9a-f]{12}$/);
    expect(argsKey({ a: 1, b: 2 })).toBe(argsKey({ b: 2, a: 1 }));
  });

  it('parseObjectSelector', () => {
    expect(parseObjectSelector('queue my queue')).toEqual({
      ok: true,
      value: { kind: 'queue', vhost: '/', name: 'my queue' },
    });
    expect(
      parseObjectSelector({ kind: 'exchange', vhost: 'b', name: 'x' }),
    ).toEqual({
      ok: true,
      value: { kind: 'exchange', vhost: 'b', name: 'x' },
    });
    expect(parseObjectSelector('connection c1')).toEqual({
      ok: true,
      value: { kind: 'connection', name: 'c1' },
    });
    expect(parseObjectSelector('broker')).toEqual({
      ok: true,
      value: { kind: 'broker' },
    });
    for (const bad of [
      'queue',
      'nope x',
      42,
      { kind: 'queue' },
      { kind: 'queue', name: 'q', extra: 1 },
    ]) {
      const r = parseObjectSelector(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('Y11');
    }
  });
});
