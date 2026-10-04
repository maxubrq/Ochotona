import { describe, expect, it } from 'vitest';
import { Broker, scanBroker } from './fixtures';
import { nonInteractive, run, session } from './helpers';

describe('phiên import', () => {
  it('chuyển trạng thái families → tolerance → done', () => {
    const s = session(scanBroker().actual());
    expect(s.phase).toBe('families');
    const [q] = s.questions();
    expect(q).toMatchObject({
      kind: 'family',
      proposal: { queueTemplate: 'request_{p1}_q' },
    });
    expect(s.result()).toMatchObject({
      ok: false,
      error: { code: 'incomplete', remaining: 1 },
    });

    expect(s.answer(q.id, { kind: 'family', action: 'accept' }).ok).toBe(true);
    expect(s.phase).toBe('tolerance');
    // Tốc độ giảm dần, rồi số queue, rồi tên.
    expect(
      s
        .questions()
        .map((x) =>
          x.kind === 'tolerance'
            ? [x.flow.name, x.rate?.perSecond, x.queues]
            : x.id,
        ),
    ).toEqual([
      ['scan.request/request_{p1}', 120, 3],
      ['billing.invoice.created', 5, 2],
      ['direct:on', 1, 1],
      ['audit', 0, 1],
    ]);
    for (const x of s.questions())
      s.answer(x.id, { kind: 'tolerance', value: 'strict', scope: 'flow' });
    expect(s.phase).toBe('done');
    expect(s.questions()).toEqual([]);
    const r = s.result();
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.summary).toMatchObject({
      flows: 4,
      families: 1,
      answered: 5,
      defaulted: 0,
      unmanaged: { headers_exchange: 1 },
    });
    expect(r.value.desired.flows['scan.request/request_{p1}']).toMatchObject({
      tolerance: 'strict',
      target: { kind: 'family', family: 'scan.request/request_{p1}' },
    });
    // Các luồng binding của thành viên đã gộp vào family.
    expect(Object.keys(r.value.desired.flows)).not.toContain(
      'scan.request/request_clamav',
    );
    expect(r.value.roundTrip).toBe('ok');
  });

  it('câu hỏi tolerance mang dòng hệ quả theo dạng đích', () => {
    const s = session(scanBroker().actual());
    s.answer(s.questions()[0].id, { kind: 'family', action: 'accept' });
    expect(
      s.questions().map((q) => q.kind === 'tolerance' && q.consequence),
    ).toEqual([
      'import.consequence.family',
      'import.consequence.binding',
      'import.consequence.direct',
      'import.consequence.fanout',
    ]);
  });

  it('rename: tên tham số sai mẫu bị từ chối, đúng mẫu thì như accept', () => {
    const s = session(scanBroker().actual());
    const id = s.questions()[0].id;
    expect(
      s.answer(id, { kind: 'family', action: 'rename', param: 'Engine' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalid_param' },
    });
    expect(
      s.answer(id, { kind: 'family', action: 'rename', param: '1x' }).ok,
    ).toBe(false);
    expect(s.phase).toBe('families');
    expect(
      s.answer(id, { kind: 'family', action: 'rename', param: 'engine_id' }).ok,
    ).toBe(true);
    const r = run(s, () => ({
      kind: 'tolerance',
      value: 'loose',
      scope: 'flow',
    }));
    const f = r.desired.families['scan.request/request_{engine_id}'];
    expect(f.queue.raw).toBe('request_{engine_id}_q');
    expect(f.routingKey.raw).toBe('request_{engine_id}');
    expect(f.members).toEqual(['clamav', 'pdf', 'yara']);
    expect(r.yaml).toContain('queue: "request_{engine_id}_q"');
  });

  it('skip giữ các luồng riêng', () => {
    const r = run(session(scanBroker().actual()), (q) =>
      q.kind === 'family'
        ? { kind: 'family', action: 'skip' }
        : { kind: 'tolerance', value: 'loose', scope: 'flow' },
    );
    expect(r.desired.families).toEqual({});
    expect(Object.keys(r.desired.flows)).toContain(
      'scan.request/request_clamav',
    );
    // Bỏ qua bằng tay thì không ghi chú thích đề xuất.
    expect(r.yaml).not.toContain('# ocho: proposal');
  });

  it("scope: 'exchange' áp cho mọi luồng còn lại của cùng exchange", () => {
    const b = new Broker()
      .exchange('orders', 'topic')
      .bound('orders', 'q1', 'orders.order.created', { rate: 9 })
      .bound('orders', 'q2', 'orders.order.paid', { rate: 8 })
      .bound('orders', 'q3', 'orders.order.shipped', { rate: 7 })
      .exchange('other', 'fanout')
      .bound('other', 'q4', '', { rate: 1 });
    const s = session(b.actual());
    expect(s.questions()).toHaveLength(4);
    s.answer('tolerance:orders.order.paid', {
      kind: 'tolerance',
      value: 'strict',
      scope: 'flow',
    });
    s.answer('tolerance:orders.order.created', {
      kind: 'tolerance',
      value: 'loose',
      scope: 'exchange',
    });
    expect(s.questions().map((q) => q.id)).toEqual(['tolerance:other']);
    s.answer('tolerance:other', {
      kind: 'tolerance',
      value: 'strict',
      scope: 'exchange',
    });
    const r = s.result();
    if (!r.ok) throw new Error();
    const tol = Object.fromEntries(
      Object.values(r.value.desired.flows).map((f) => [f.name, f.tolerance]),
    );
    expect(tol).toEqual({
      'orders.order.created': 'loose',
      'orders.order.paid': 'strict',
      'orders.order.shipped': 'loose',
      other: 'strict',
    });
    expect(r.value.summary.answered).toBe(4);
  });

  it('lỗi trả lời: câu không có, sai loại', () => {
    const s = session(scanBroker().actual());
    expect(
      s.answer('nope', { kind: 'family', action: 'accept' }),
    ).toMatchObject({ ok: false, error: { code: 'unknown_question' } });
    expect(
      s.answer(s.questions()[0].id, {
        kind: 'tolerance',
        value: 'strict',
        scope: 'flow',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'wrong_kind' },
    });
  });

  it('không tương tác: đề xuất thành chú thích dưới families, dung sai undeclared', () => {
    const r = nonInteractive(scanBroker().actual());
    expect(r.desired.families).toEqual({});
    expect(
      Object.values(r.desired.flows).every((f) => f.tolerance === 'undeclared'),
    ).toBe(true);
    expect(r.yaml).toContain(
      [
        '# ocho: proposal: request_{p1}_q via scan.request, key request_{p1}, members [clamav, pdf, yara]',
        '# ocho:   run `ocho import` interactively, or add the family by hand',
        'families: {}',
      ].join('\n'),
    );
    expect(r.summary).toMatchObject({ answered: 0, defaulted: 7 });
  });

  it('không tương tác khi đã có family khác: chú thích ngay dưới khoá families', () => {
    const b = scanBroker();
    b.exchange('jobs', 'direct');
    for (const m of ['a', 'b', 'c']) b.bound('jobs', `job-${m}`, `job-${m}`);
    const s = session(b.actual());
    const r = run(s, (q) =>
      q.kind === 'family' && q.proposal.exchange === 'jobs'
        ? { kind: 'family', action: 'accept' }
        : undefined,
    );
    expect(r.yaml).toMatch(/families:\n {2}# ocho: proposal: request_\{p1\}_q/);
  });

  it('broker trống vẫn cho file hợp lệ', () => {
    const r = nonInteractive(new Broker().actual());
    expect(r.desired.flows).toEqual({});
    expect(r.yaml).toContain('families: {}\n\nflows: {}\n\ntopology: {}\n');
  });
});
