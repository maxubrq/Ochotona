import { describe, expect, it } from 'vitest';
import {
  type Instant,
  buildActual,
  buildDesired,
  buildFlowMap,
  validateDesired,
} from '../src';
import { CONN, ctx, okRaw, queue, rawBroker } from './fixtures';

const NOW = '2026-10-04T01:00:00.000Z' as Instant;

const base = () => ({
  spec: '0.4',
  broker: { min_version: '3.13' },
  families: {
    scan: {
      exchange: 'scan.request',
      routing_key: 'request_{engine}',
      queue: 'request_{engine}_q',
      members: ['clamav', 'yara'],
    },
  },
  flows: {
    scans: { family: 'scan', tolerance: 'strict' },
    audit: { exchange: 'audit', groups: ['audit_q'], tolerance: 'loose' },
  },
  services: { scanner: { user: 'scanner', flows: ['scans'] } },
  waivers: [
    {
      rule: 'T2',
      object: 'queue request_yara_q',
      reason: 'migrating',
      by: 'max',
      until: '2026-12-31',
    },
  ],
});

const codes = (obj: unknown) =>
  validateDesired(obj, NOW).errors.map((e) => e.code);

describe('validateDesired', () => {
  it('đầu vào hợp lệ không có lỗi', () => {
    expect(validateDesired(base(), NOW)).toEqual({ errors: [], warnings: [] });
    const r = buildDesired(base(), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.broker.minVersion.raw).toBe('3.13');
      expect(r.value.flows.audit.target).toEqual({
        kind: 'fanout',
        exchange: 'audit',
        groups: ['audit_q'],
      });
      expect(r.value.waivers[0].object).toEqual({
        kind: 'queue',
        vhost: '/',
        name: 'request_yara_q',
      });
    }
  });

  const cases: [
    string,
    (o: ReturnType<typeof base>) => unknown,
    string,
    (string | number)[],
  ][] = [
    ['Y1 khoá lạ', (o) => ({ ...o, extra: 1 }), 'Y1', ['extra']],
    [
      'Y1 khoá lạ ở cấp sâu',
      (o) => ({
        ...o,
        flows: { ...o.flows, audit: { ...o.flows.audit, foo: 1 } },
      }),
      'Y1',
      ['flows', 'audit', 'foo'],
    ],
    ['Y2 sai kiểu', (o) => ({ ...o, spec: 4 }), 'Y2', ['spec']],
    [
      'Y2 tolerance lạ',
      (o) => ({
        ...o,
        flows: { audit: { ...o.flows.audit, tolerance: 'meh' } },
        services: {},
      }),
      'Y2',
      ['flows', 'audit', 'tolerance'],
    ],
    [
      'Y3 thiếu khoá',
      (o) => ({ ...o, broker: {} }),
      'Y3',
      ['broker', 'min_version'],
    ],
    [
      'Y4 không đúng một dạng đích',
      (o) => ({
        ...o,
        flows: { x: { family: 'scan', queue: 'q' } },
        services: {},
      }),
      'Y4',
      ['flows', 'x'],
    ],
    [
      'Y4 không có dạng nào',
      (o) => ({ ...o, flows: { x: { tolerance: 'strict' } }, services: {} }),
      'Y4',
      ['flows', 'x'],
    ],
    [
      'Y5 family không tồn tại',
      (o) => ({ ...o, flows: { scans: { family: 'nope' } } }),
      'Y5',
      ['flows', 'scans', 'family'],
    ],
    [
      'Y6 mẫu sai cú pháp',
      (o) => ({
        ...o,
        families: { scan: { ...o.families.scan, queue: 'request_{engine' } },
      }),
      'Y6',
      ['families', 'scan', 'queue'],
    ],
    [
      'Y6 tham số khác nhau',
      (o) => ({
        ...o,
        families: { scan: { ...o.families.scan, queue: 'request_{kind}_q' } },
      }),
      'Y6',
      ['families', 'scan', 'queue'],
    ],
    [
      'Y6 hai tham số sát nhau',
      (o) => ({
        ...o,
        families: {
          scan: { ...o.families.scan, queue: '{a}{b}', routing_key: '{a}.{b}' },
        },
      }),
      'Y6',
      ['families', 'scan', 'queue'],
    ],
    [
      'Y7 thành viên có ký tự dành riêng',
      (o) => ({
        ...o,
        families: { scan: { ...o.families.scan, members: ['cl.av'] } },
      }),
      'Y7',
      ['families', 'scan', 'members', 0],
    ],
    [
      'Y8 service tham chiếu luồng lạ',
      (o) => ({ ...o, services: { s: { user: 'u', flows: ['nope'] } } }),
      'Y8',
      ['services', 's', 'flows', 0],
    ],
    [
      'Y9 waiver thiếu reason',
      (o) => ({ ...o, waivers: [{ ...o.waivers[0], reason: undefined }] }),
      'Y9',
      ['waivers', 0, 'reason'],
    ],
    [
      'Y9 until sai định dạng',
      (o) => ({ ...o, waivers: [{ ...o.waivers[0], until: '2026-02-30' }] }),
      'Y9',
      ['waivers', 0, 'until'],
    ],
    [
      'Y11 object sai',
      (o) => ({ ...o, waivers: [{ ...o.waivers[0], object: 'teapot x' }] }),
      'Y11',
      ['waivers', 0, 'object'],
    ],
    ['Y12 khác major', (o) => ({ ...o, spec: '1.0' }), 'Y12', ['spec']],
    [
      'Y13 hai luồng cùng nhận một bộ',
      (o) => ({
        ...o,
        flows: {
          ...o.flows,
          dup: {
            exchange: 'scan.request',
            routing_key: 'request_clamav',
            groups: ['request_clamav_q'],
          },
        },
      }),
      'Y13',
      ['flows', 'dup'],
    ],
    [
      'Y14 min_version hỏng',
      (o) => ({ ...o, broker: { min_version: 'latest' } }),
      'Y14',
      ['broker', 'min_version'],
    ],
  ];

  for (const [name, mutate, code, path] of cases) {
    it(name, () => {
      const errors = validateDesired(mutate(base()), NOW).errors;
      expect(errors.map((e) => e.code)).toContain(code);
      expect(errors.find((e) => e.code === code)?.path).toEqual(path);
      expect(buildDesired(mutate(base()), NOW).ok).toBe(false);
    });
  }

  it('Y10 waiver hết hạn là cảnh báo; waiver bị bỏ', () => {
    const o = {
      ...base(),
      waivers: [{ ...base().waivers[0], until: '2026-10-03' }],
    };
    const r = validateDesired(o, NOW);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toEqual(['Y10']);
    const d = buildDesired(o, NOW);
    expect(d.ok && d.value.waivers).toEqual([]);
  });

  it('waiver còn hiệu lực trọn ngày until (UTC)', () => {
    const o = {
      ...base(),
      waivers: [{ ...base().waivers[0], until: '2026-10-04' }],
    };
    expect(
      validateDesired(o, '2026-10-04T23:59:59.999Z' as Instant).warnings,
    ).toEqual([]);
    expect(
      validateDesired(o, '2026-10-05T00:00:00.000Z' as Instant).warnings.map(
        (w) => w.code,
      ),
    ).toEqual(['Y10']);
  });

  it('đầu vào gần giống hợp lệ không sinh lỗi', () => {
    expect(
      codes({ ...base(), flows: { d: { queue: 'only_q' } }, services: {} }),
    ).toEqual([]);
    expect(
      codes({
        ...base(),
        families: {
          reg: {
            exchange: 'x',
            routing_key: 'k.{a}',
            queue: 'q_{a}',
            members: 'registry',
          },
        },
        flows: {},
        services: {},
      }),
    ).toEqual([]);
  });
});

describe('buildFlowMap', () => {
  const actual = buildActual(
    rawBroker({
      queues: okRaw([
        queue('request_clamav_q'),
        queue('request_yara_q'),
        queue('audit_q'),
      ]),
    }),
    ctx(),
  );
  const desired = (() => {
    const r = buildDesired(base(), NOW);
    if (!r.ok) throw new Error('invalid');
    return r.value;
  })();
  const fm = buildFlowMap(desired, actual);
  const Q = (name: string) => ({ kind: 'queue' as const, vhost: '/', name });

  it('đối tượng thuộc luồng và dung sai', () => {
    expect(fm.flowsOf(Q('request_clamav_q'))).toEqual(['scans']);
    expect(fm.toleranceOf(Q('request_clamav_q'))).toBe('strict');
    expect(fm.toleranceOf(Q('audit_q'))).toBe('loose');
    expect(fm.toleranceOf(Q('nobody_q'))).toBe('undeclared');
  });

  it('consumer, binding, connection theo queue và service', () => {
    expect(
      fm.toleranceOf({
        kind: 'consumer',
        channel: `${CONN} (2)`,
        tag: 'ctag-1',
      }),
    ).toBe('strict');
    expect(
      fm.toleranceOf({
        kind: 'binding',
        vhost: '/',
        source: 'scan.request',
        destinationType: 'queue',
        destination: 'request_yara_q',
        routingKey: 'request_yara',
        argsKey: '',
      }),
    ).toBe('strict');
    expect(fm.flowsOf({ kind: 'connection', name: CONN })).toEqual(['scans']);
    expect(fm.toleranceOf({ kind: 'channel', name: `${CONN} (1)` })).toBe(
      'strict',
    );
  });

  it('missing: exchange audit và binding fanout không có trên broker', () => {
    expect(fm.missing.map((r) => r.kind)).toEqual(['binding', 'exchange']);
    expect(fm.incomplete).toBeNull();
  });

  it('family registry tách tham số từ tên queue', () => {
    const o = {
      ...base(),
      families: {
        scan: {
          exchange: 'scan.request',
          routing_key: 'request_{engine}',
          queue: 'request_{engine}_q',
          members: 'registry',
        },
      },
      flows: { scans: { family: 'scan', tolerance: 'strict' } },
    };
    const r = buildDesired(o, NOW);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const m = buildFlowMap(r.value, actual).membersOf('scans');
    expect(m.queues.map((q) => (q as { name: string }).name)).toEqual([
      'request_clamav_q',
      'request_yara_q',
    ]);
    expect(
      m.bindings.map((b) => (b as { routingKey: string }).routingKey),
    ).toEqual(['request_clamav', 'request_yara']);
  });

  it('gộp dung sai: strict > undeclared > loose', () => {
    const o = {
      ...base(),
      flows: {
        a: { queue: 'audit_q', tolerance: 'loose' },
        b: { exchange: 'audit', groups: ['audit_q'] },
      },
      services: {},
    };
    const r = buildDesired(o, NOW);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(buildFlowMap(r.value, actual).toleranceOf(Q('audit_q'))).toBe(
      'undeclared',
    );
  });

  it('không có ocho.yaml thì mọi thứ undeclared', () => {
    const m = buildFlowMap(null, actual);
    expect(m.toleranceOf(Q('request_clamav_q'))).toBe('undeclared');
    expect(m.missing).toEqual([]);
  });
});
