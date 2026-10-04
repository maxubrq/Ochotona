import { describe, expect, it } from 'vitest';
import { Broker, T0, scanBroker } from './fixtures';
import { nonInteractive, run, session } from './helpers';

const T_LATER = '2026-10-05T02:00:00.000Z' as typeof T0;

function before(): Broker {
  return new Broker()
    .exchange('scan.request', 'direct')
    .bound('scan.request', 'request_clamav_q', 'request_clamav', {
      type: 'quorum',
      rate: 120,
    })
    .bound('scan.request', 'request_yara_q', 'request_yara', {
      type: 'quorum',
      rate: 40,
    })
    .bound('scan.request', 'request_pdf_q', 'request_pdf', {
      type: 'quorum',
      rate: 10,
    })
    .exchange('billing', 'topic')
    .bound(
      'billing',
      'billing.invoice.created.email',
      'billing.invoice.created',
      { rate: 5 },
    )
    .exchange('audit', 'fanout')
    .bound('audit', 'audit.log', '');
}

/** Broker sau khi đổi: thêm thành viên office, mất pdf, mất audit, thêm luồng paid, đổi argument. */
function after(): Broker {
  return new Broker()
    .exchange('scan.request', 'direct')
    .bound('scan.request', 'request_clamav_q', 'request_clamav', {
      type: 'quorum',
      rate: 120,
    })
    .bound('scan.request', 'request_yara_q', 'request_yara', {
      type: 'quorum',
      rate: 40,
    })
    .bound('scan.request', 'request_office_q', 'request_office', {
      type: 'quorum',
      rate: 40,
    })
    .exchange('billing', 'topic')
    .bound(
      'billing',
      'billing.invoice.created.email',
      'billing.invoice.created',
      {
        rate: 5,
        args: { 'x-max-length': 5000 },
      },
    )
    .bound('billing', 'billing.invoice.paid.ledger', 'billing.invoice.paid', {
      rate: 5,
    });
}

/** File vàng: import lần đầu, rồi người dùng thêm chú thích ở mọi cấp, service và waiver. */
function golden(): string {
  const r = run(session(before().actual()), (q) =>
    q.kind === 'family'
      ? { kind: 'family', action: 'rename', param: 'engine' }
      : {
          kind: 'tolerance',
          value:
            q.kind === 'tolerance' && q.flow.name === 'audit'
              ? 'loose'
              : 'strict',
          scope: 'flow',
        },
  );
  return r.yaml
    .replace('spec: "0.4"', '# team: payments\nspec: "0.4" # do not bump')
    .replace('families:\n', 'families:\n  # scanners register here\n')
    .replace('    members:', '    # one per engine\n    members:')
    .replace('flows:\n', 'flows:\n  # owned by the billing team\n')
    .replace(
      '    tolerance: loose\n',
      '    tolerance: loose # audit can lose messages\n',
    )
    .replace(
      '\ntopology:',
      [
        '',
        'services:',
        '  # the API',
        '  billing-api: { user: billing, flows: [billing.invoice.created] }',
        '',
        'waivers:',
        '  - { rule: T1, object: queue audit.log, reason: legacy, by: max, until: "2026-01-01" }',
        '  - { rule: T2, object: exchange audit, reason: ok, by: max, until: "2027-01-01" }',
        '',
        '# trailing note',
        'topology:',
      ].join('\n'),
    );
}

describe('import lại', () => {
  const text = golden();
  const s = session(after().actual(), text, T_LATER);
  const asked = s.questions();
  const r = run(s, (q) =>
    q.kind === 'family_members'
      ? { kind: 'family_members', action: 'add' }
      : { kind: 'tolerance', value: 'strict', scope: 'flow' },
  );

  it('spec, broker.min_version: giữ', () => {
    expect(r.desired.spec).toBe('0.4');
    expect(r.desired.broker.minVersion.raw).toBe('4.2');
    expect(r.yaml).toContain('spec: "0.4" # do not bump');
  });

  it('thành viên tĩnh: queue mới khớp mẫu → câu hỏi family_members', () => {
    expect(asked.map((q) => q.kind)).toEqual(['family_members']);
    expect(asked[0]).toMatchObject({
      family: 'scan.request/request_{engine}',
      queue: 'request_office_q',
      member: 'office',
    });
    expect(r.desired.families['scan.request/request_{engine}'].members).toEqual(
      ['clamav', 'pdf', 'yara', 'office'],
    );
    expect(r.summary.membersAdded).toBe(1);
  });

  it('thành viên không còn trong broker: giữ, thêm chú thích Ocho', () => {
    expect(r.yaml).toContain(
      '    # ocho: not found in broker at 2026-10-05T02:00:00.000Z: pdf\n    # one per engine\n    members:',
    );
  });

  it('flows: giữ nguyên kể cả dung sai; luồng mất đối tượng thêm chú thích', () => {
    expect(r.desired.flows.audit.tolerance).toBe('loose');
    expect(r.desired.flows['billing.invoice.created'].tolerance).toBe('strict');
    expect(r.yaml).toMatch(
      /# ocho: not found in broker at 2026-10-05T02:00:00.000Z\n {2}audit:/,
    );
    expect(r.summary.vanishedFlows).toBe(1);
  });

  it('ứng viên mới chưa được phủ: hỏi dung sai, thêm vào cuối', () => {
    expect(r.desired.flows['billing.invoice.paid']).toMatchObject({
      tolerance: 'strict',
    });
    const flows = r.yaml.slice(
      r.yaml.indexOf('\nflows:'),
      r.yaml.indexOf('\nservices:'),
    );
    const order = [...flows.matchAll(/^ {2}("?[\w.{}/-]+"?):\n/gm)].map(
      (m) => m[1],
    );
    expect(order).toEqual([
      'audit',
      'billing.invoice.created',
      '"scan.request/request_{engine}"',
      'billing.invoice.paid',
    ]);
  });

  it('services, waivers: không đụng tới, kể cả waiver đã hết hạn', () => {
    expect(r.yaml).toContain('  # the API\n  billing-api:');
    expect(r.yaml).toContain('until: "2026-01-01"');
    expect(r.desired.waivers.map((w) => w.rule)).toEqual(['T2']);
  });

  it('chú thích của người dùng trong lớp ngữ nghĩa giữ nguyên vị trí', () => {
    for (const c of [
      '# team: payments\nspec:',
      'families:\n  # scanners register here\n',
      '# owned by the billing team',
      'tolerance: loose # audit can lose messages',
      '# trailing note',
    ])
      expect(r.yaml).toContain(c);
  });

  it('topology sinh lại toàn bộ; thay đổi in dạng diff', () => {
    expect(r.yaml).not.toContain('audit.log, type');
    expect(r.changes?.lines).toEqual([
      '- exchange audit',
      '- queue audit.log',
      '~ queue billing.invoice.created.email: arguments.x-max-length (none) → 5000',
      '+ queue billing.invoice.paid.ledger',
      '+ queue request_office_q',
      '- queue request_pdf_q',
      '- binding audit → queue audit.log',
      '+ binding billing → queue billing.invoice.paid.ledger key billing.invoice.paid',
      '+ binding scan.request → queue request_office_q key request_office',
      '- binding scan.request → queue request_pdf_q key request_pdf',
    ]);
  });

  it('chú thích của Ocho được xoá rồi sinh lại, không nhân đôi', () => {
    const again = run(
      session(after().actual(), r.yaml, T_LATER),
      () => undefined,
    );
    expect(again.yaml).toBe(r.yaml);
    expect(again.yaml.match(/not found in broker/g)).toHaveLength(2);
    const fixedBroker = before()
      .bound('scan.request', 'request_office_q', 'request_office', {
        type: 'quorum',
      })
      .bound('billing', 'billing.invoice.paid.ledger', 'billing.invoice.paid');
    const back = run(
      session(fixedBroker.actual(), r.yaml, T_LATER),
      () => undefined,
    );
    expect(back.yaml).not.toContain('# ocho: not found');
  });

  it('import lại trên broker không đổi cho đúng file cũ (diff git rỗng)', () => {
    const r0 = nonInteractive(before().actual());
    const r1 = nonInteractive(before().actual(), r0.yaml);
    expect(r1.yaml).toBe(r0.yaml);
    expect(r1.changes?.lines).toEqual([]);
  });

  it('không tương tác: queue mới khớp family tĩnh không thêm, thành luồng riêng', () => {
    const r2 = run(session(after().actual(), text, T_LATER), () => undefined);
    expect(
      r2.desired.families['scan.request/request_{engine}'].members,
    ).toEqual(['clamav', 'pdf', 'yara']);
    expect(r2.desired.flows['scan.request/request_office']).toMatchObject({
      tolerance: 'undeclared',
      target: { kind: 'binding', groups: ['request_office_q'] },
    });
    expect(r2.yaml).toContain(
      '# ocho: new queues match this family: request_office_q',
    );
  });

  it('luồng direct và fanout đã có không bị sinh lại khi import lại', () => {
    const r0 = nonInteractive(scanBroker().actual());
    const r1 = nonInteractive(scanBroker().actual(), r0.yaml);
    expect(r1.summary.newFlows).toBe(0);
    expect(r1.yaml).toBe(r0.yaml);
  });

  it('ứng viên family mới không chồng family đã có thì hỏi như lần đầu', () => {
    const b = after();
    b.exchange('jobs', 'direct');
    for (const m of ['a', 'b', 'c']) b.bound('jobs', `job-${m}`, `job-${m}`);
    const q = session(b.actual(), r.yaml, T_LATER).questions();
    expect(
      q
        .filter((x) => x.kind === 'family')
        .map((x) => x.kind === 'family' && x.proposal.queueTemplate),
    ).toEqual(['job-{p1}']);
  });
});

describe('import lại: file cũ không dùng được', () => {
  const ok = nonInteractive(before().actual()).yaml;

  it.each([
    ['lỗi cú pháp YP', ok.replace('flows:', 'flows: [')],
    [
      'lỗi ngữ nghĩa Y',
      ok.replace('tolerance: undeclared', 'tolerance: maybe'),
    ],
    ['spec khác major', ok.replace('spec: "0.4"', 'spec: "1.0"')],
  ])('%s → IM2, không có câu hỏi, không có yaml', (_, text) => {
    const s = session(before().actual(), text);
    expect(s.questions()).toEqual([]);
    s.answerDefaults();
    const res = s.result();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('IM2');
    if (res.error.code === 'IM2')
      expect(res.error.diagnostics[0].line).toBeGreaterThan(0);
  });

  it('broker thật thấp hơn broker.min_version → cảnh báo', () => {
    const text = ok.replace('min_version: "4.2"', 'min_version: "4.3"');
    const r = nonInteractive(before().actual(), text);
    expect(r.warnings).toEqual([
      { kind: 'broker_below_min_version', actual: '4.2.1', min: '4.3' },
    ]);
    expect(r.desired.broker.minVersion.raw).toBe('4.3');
  });
});

describe('import lại với family registry', () => {
  it('queue khớp mẫu đã được phủ; không hỏi thành viên, không đề xuất lại', () => {
    const b = new Broker().exchange('jobs', 'direct');
    for (const m of ['mail', 'sms', 'push'])
      b.bound('jobs', `job-${m}`, `job.${m}`);
    const first = nonInteractive(b.actual());
    const text = first.yaml
      .replace(
        'families: {}',
        'families:\n  jobs:\n    exchange: jobs\n    routing_key: "job.{kind}"\n    queue: "job-{kind}"\n    members: registry',
      )
      .replace(
        /\nflows:\n[\s\S]*?\n\ntopology:/,
        '\nflows:\n  jobs:\n    tolerance: strict\n    family: jobs\n\ntopology:',
      );
    const later = b.bound('jobs', 'job-fax', 'job.fax');
    const s = session(later.actual(), text);
    expect(s.questions()).toEqual([]);
    const r = run(s, () => undefined);
    expect(Object.keys(r.desired.flows)).toEqual(['jobs']);
    expect(r.yaml).not.toContain('# ocho:');
    expect(r.summary).toMatchObject({
      newFlows: 0,
      newFamilies: 0,
      vanishedFlows: 0,
    });
  });
});
