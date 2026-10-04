import { describe, expect, it } from 'vitest';
import { inferFamilies, tokenize } from '../src';
import { Broker, scanBroker, topologyOf } from './fixtures';

const infer = (b: Broker) => inferFamilies(topologyOf(b.actual()));

/** Ba queue `request_<m>_q`, key `request_<m>`, cùng exchange. */
const family = (
  b: Broker,
  members: readonly string[],
  o: Parameters<Broker['queue']>[1] = {},
) => {
  b.exchange('scan.request', 'direct');
  for (const m of members)
    b.bound('scan.request', `request_${m}_q`, `request_${m}`, {
      type: 'quorum',
      ...o,
    });
  return b;
};

describe('inferFamilies', () => {
  it('tách tên thành từ và dấu phân cách', () => {
    expect(tokenize('request_clamav_q')).toEqual({
      words: ['request', 'clamav', 'q'],
      seps: ['_', '_'],
    });
    expect(tokenize('a.b-c')).toEqual({
      words: ['a', 'b', 'c'],
      seps: ['.', '-'],
    });
  });

  it('ca dương: request_{p1}_q, ba thành viên', () => {
    const [p, ...rest] = infer(scanBroker());
    expect(rest).toEqual([]);
    expect(p).toMatchObject({
      vhost: '/',
      exchange: 'scan.request',
      queueTemplate: 'request_{p1}_q',
      routingKeyTemplate: 'request_{p1}',
      members: ['clamav', 'pdf', 'yara'],
      evidence: ['request_clamav_q', 'request_pdf_q', 'request_yara_q'],
    });
    expect(p.id).toMatch(/^[0-9a-f]{12}$/);
    expect(infer(scanBroker())[0].id).toBe(p.id);
  });

  it('ca âm: hai thành viên', () => {
    expect(infer(family(new Broker(), ['a', 'b']))).toEqual([]);
  });

  it('ca âm: chữ ký khác nhau (loại queue, argument, policy)', () => {
    const b = new Broker()
      .exchange('scan.request', 'direct')
      .bound('scan.request', 'request_a_q', 'request_a', { type: 'quorum' })
      .bound('scan.request', 'request_b_q', 'request_b', { type: 'classic' })
      .bound('scan.request', 'request_c_q', 'request_c', { type: 'quorum' });
    expect(infer(b)).toEqual([]);
    const args = new Broker()
      .exchange('scan.request', 'direct')
      .bound('scan.request', 'request_a_q', 'request_a', {
        args: { 'x-max-length': 1 },
      })
      .bound('scan.request', 'request_b_q', 'request_b')
      .bound('scan.request', 'request_c_q', 'request_c');
    expect(infer(args)).toEqual([]);
    const policy = family(new Broker(), ['a', 'b', 'c']).policy(
      'only-a',
      '^request_a_q$',
      { 'max-length': 5 },
    );
    expect(infer(policy)).toEqual([]);
    const all = family(new Broker(), ['a', 'b', 'c']).policy(
      'all',
      '^request_',
      { 'max-length': 5 },
    );
    expect(infer(all)).toHaveLength(1);
  });

  it('chữ ký tách nhóm; nhóm con còn ≥ 3 thì giữ', () => {
    const b = family(new Broker(), ['a', 'b', 'c']).bound(
      'scan.request',
      'request_d_q',
      'request_d',
      {
        type: 'classic',
      },
    );
    expect(infer(b)[0].members).toEqual(['a', 'b', 'c']);
  });

  it('ca âm: routing key lệch', () => {
    const b = new Broker()
      .exchange('scan.request', 'direct')
      .bound('scan.request', 'request_a_q', 'request_a')
      .bound('scan.request', 'request_b_q', 'request_b')
      .bound('scan.request', 'request_c_q', 'request_x');
    expect(infer(b)).toEqual([]);
    const two = new Broker()
      .exchange('e1', 'direct')
      .exchange('e2', 'direct')
      .bound('e1', 'request_a_q', 'request_a')
      .bound('e1', 'request_b_q', 'request_b')
      .bound('e2', 'request_c_q', 'request_c');
    expect(infer(two)).toEqual([]);
    const extra = family(new Broker(), ['a', 'b', 'c']).bind(
      'scan.request',
      'request_a_q',
      'other',
    );
    expect(infer(extra)).toEqual([]);
  });

  it('ca âm: vi phạm H2 làm thành viên bị loại', () => {
    const b = new Broker()
      .exchange('e', 'topic')
      .bound('e', 'req_a_q', 'req_a')
      .bound('e', 'req_b_q', 'req_b')
      .bound('e', 'req_*_q', 'req_*')
      .bound('e', 'req_#_q', 'req_#');
    expect(infer(b)).toEqual([]);
    const ok = b.bound('e', 'req_c_q', 'req_c');
    expect(infer(ok)[0].members).toEqual(['a', 'b', 'c']);
  });

  it('ca âm: chồng lấn hai ứng viên, giữ ứng viên nhiều thành viên hơn', () => {
    // Bốn queue a.x.q, b.x.q, c.x.q, d.x.q (tham số ở 0) và a.x.q, a.y.q, a.z.q (tham số ở 1).
    const b = new Broker().exchange('e', 'topic');
    for (const m of ['a', 'b', 'c', 'd']) b.bound('e', `${m}.x.q`, `k.${m}`);
    for (const m of ['y', 'z']) b.bound('e', `a.${m}.q`, `j.${m}`);
    const ps = infer(b);
    expect(ps.map((p) => [p.queueTemplate, p.members])).toEqual([
      ['{p1}.x.q', ['a', 'b', 'c', 'd']],
    ]);
  });

  it('hoà số thành viên: vị trí tham số nhỏ hơn thắng', () => {
    const b = new Broker().exchange('e', 'topic');
    for (const m of ['a', 'b', 'c']) b.bound('e', `${m}_x_q`, `k.${m}`);
    for (const m of ['y', 'z']) b.bound('e', `a_${m}_q`, `j.${m}`);
    b.bound('e', 'a_w_q', 'j.w');
    // a_x_q nằm trong cả hai; {p1}_x_q (vị trí 0) giữ, a_{p1}_q còn y, z, w nhưng mất a_x_q.
    expect(infer(b).map((p) => p.queueTemplate)).toEqual(['{p1}_x_q']);
  });
});

describe('inferFamilies: nhánh biên', () => {
  it('policy không kết luận được (regex ngoài tập hỗ trợ, hoà priority) vẫn cho chữ ký chung', () => {
    const odd = family(new Broker(), ['a', 'b', 'c']).policy(
      'lookahead',
      '^(?=request)',
      { 'max-length': 1 },
    );
    expect(infer(odd)).toHaveLength(1);
    const tie = family(new Broker(), ['a', 'b', 'c'])
      .policy('p1', '^request_', { 'max-length': 1 }, 5)
      .policy('p2', '^request_', { 'max-length': 2 }, 5);
    expect(infer(tie)).toHaveLength(1);
  });

  it('hai ứng viên thật sự chồng lấn: giữ ứng viên nhiều thành viên hơn', () => {
    const b = new Broker().exchange('e', 'topic');
    for (const m of ['a', 'b', 'c', 'd']) b.bound('e', `${m}_x_q`, `${m}.x`);
    for (const m of ['y', 'z']) b.bound('e', `a_${m}_q`, `a.${m}`);
    expect(infer(b).map((p) => p.queueTemplate)).toEqual(['{p1}_x_q']);
  });

  it('cùng family ở hai vhost, hai family cùng exchange: thứ tự tất định', () => {
    const b = new Broker();
    for (const v of ['/', 'v2']) {
      b.exchange('e', 'direct', v);
      for (const m of ['a', 'b', 'c']) {
        b.bound('e', `in_${m}_q`, `in_${m}`, { vhost: v });
        b.bound('e', `out-${m}-q`, `out-${m}`, { vhost: v });
      }
    }
    expect(infer(b).map((p) => [p.vhost, p.queueTemplate])).toEqual([
      ['/', 'in_{p1}_q'],
      ['/', 'out-{p1}-q'],
      ['v2', 'in_{p1}_q'],
      ['v2', 'out-{p1}-q'],
    ]);
  });

  it('ca âm: không binding, exchange fanout, key khác dấu phân cách, ngoặc nhọn trong tên', () => {
    const none = new Broker()
      .queue('request_a_q')
      .queue('request_b_q')
      .queue('request_c_q');
    expect(infer(none)).toEqual([]);
    const fan = new Broker().exchange('f', 'fanout');
    for (const m of ['a', 'b', 'c'])
      fan.bound('f', `request_${m}_q`, `request_${m}`);
    expect(infer(fan)).toEqual([]);
    const seps = new Broker()
      .exchange('e', 'direct')
      .bound('e', 'request_a_q', 'request_a')
      .bound('e', 'request_b_q', 'request_b')
      .bound('e', 'request_c_q', 'request-c');
    expect(infer(seps)).toEqual([]);
    const braces = new Broker().exchange('e', 'direct');
    for (const m of ['a', 'b', 'c']) braces.bound('e', `{x}_${m}_q`, `k_${m}`);
    expect(infer(braces)).toEqual([]);
  });
});

describe('inferFamilies: ca do mutation testing chỉ ra', () => {
  it('policy hoà priority là chữ ký riêng, khác policy thắng rõ', () => {
    // a, b, c khớp hai policy cùng priority (không kết luận); d chỉ khớp p1.
    const b = family(new Broker(), ['a', 'b', 'c', 'd'])
      .policy('p1', '^request_', { 'max-length': 1 }, 5)
      .policy('p2', '^request_[abc]_', { 'max-length': 2 }, 5);
    expect(infer(b)[0].members).toEqual(['a', 'b', 'c']);
  });

  it('policy thắng rõ (priority cao hơn) là chữ ký; hoà khác không có policy', () => {
    const win = family(new Broker(), ['a', 'b', 'c', 'd'])
      .policy('p1', '^request_', { 'max-length': 1 }, 5)
      .policy('p2', '^request_[abc]_', { 'max-length': 2 }, 1);
    expect(infer(win)[0].members).toEqual(['a', 'b', 'c', 'd']);
    const tie = family(new Broker(), ['a', 'b', 'c', 'd'])
      .policy('p1', '^request_[abc]_', { 'max-length': 1 }, 5)
      .policy('p2', '^request_[abc]_', { 'max-length': 2 }, 5);
    expect(infer(tie)[0].members).toEqual(['a', 'b', 'c']);
  });

  it('một thành viên có hai binding thì không có family, dù binding đầu khớp', () => {
    const b = family(new Broker(), ['a', 'b', 'c']).bind(
      'scan.request',
      'request_a_q',
      'zzz',
    );
    expect(infer(b)).toEqual([]);
  });

  it('policy regex ngoài tập hỗ trợ: mọi queue cùng chữ ký, vẫn đề xuất', () => {
    const b = family(new Broker(), ['a', 'b', 'c']).policy(
      'pcre',
      '\\Arequest',
      { 'max-length': 1 },
    );
    expect(infer(b)).toHaveLength(1);
  });

  it('binding tới exchange trùng tên queue không tính là binding của queue', () => {
    const b = family(new Broker(), ['a', 'b', 'c'])
      .exchange('request_a_q', 'fanout')
      .bind('scan.request', 'request_a_q', 'x', { toExchange: true });
    expect(infer(b)[0].members).toEqual(['a', 'b', 'c']);
  });

  it('tên một từ không thành family', () => {
    const b = new Broker().exchange('e', 'direct');
    for (const m of ['alpha', 'beta', 'gamma']) b.bound('e', m, m);
    expect(infer(b)).toEqual([]);
  });

  it('ứng viên nhiều thành viên hơn thắng kể cả khi sinh sau', () => {
    // a_{p1}_q (vị trí 1, 4 thành viên) và {p1}_x_q (vị trí 0, 3 thành viên) chồng ở a_x_q.
    const b = new Broker().exchange('e', 'topic');
    for (const m of ['x', 'y', 'z', 'w']) b.bound('e', `a_${m}_q`, `a.${m}`);
    for (const m of ['b', 'c']) b.bound('e', `${m}_x_q`, `${m}.x`);
    expect(infer(b).map((p) => [p.queueTemplate, p.members])).toEqual([
      ['a_{p1}_q', ['w', 'x', 'y', 'z']],
    ]);
  });

  it('exchange dựng sẵn (loại không có trong topology) vẫn cho family', () => {
    const b = new Broker();
    for (const m of ['a', 'b', 'c'])
      b.bound('amq.direct', `request_${m}_q`, `request_${m}`);
    expect(infer(b)[0]).toMatchObject({
      exchange: 'amq.direct',
      routingKeyTemplate: 'request_{p1}',
    });
  });

  it('routing key khác nhau ở hai vị trí thì không có family', () => {
    const b = new Broker().exchange('e', 'topic');
    for (const [m, n] of [
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
    ])
      b.bound('e', `req_${m}_q`, `${m}.x${n}`);
    expect(infer(b)).toEqual([]);
  });

  it('giá trị rỗng bị loại như vi phạm H2', () => {
    const b = family(new Broker(), ['a', 'b', 'c']).bound(
      'scan.request',
      'request__q',
      'request_',
      { type: 'quorum' },
    );
    expect(infer(b)[0].members).toEqual(['a', 'b', 'c']);
  });

  it('ngoặc nhọn trong giá trị tham số thì được, trong phần cố định của key thì không', () => {
    const inMember = family(new Broker(), ['{a}', 'b', 'c']);
    expect(infer(inMember)[0].members).toEqual(['b', 'c', '{a}']);
    const inKey = new Broker().exchange('e', 'direct');
    for (const m of ['a', 'b', 'c']) inKey.bound('e', `req_${m}_q`, `{k}_${m}`);
    expect(infer(inKey)).toEqual([]);
  });

  it('thành viên sắp theo giá trị tham số, không theo tên queue', () => {
    // Tên: q.a!.x < q.a.x ('!' < '.'), nhưng giá trị: a < a!.
    const b = new Broker().exchange('e', 'topic');
    for (const m of ['a', 'a!', 'b']) b.bound('e', `q.${m}.x`, `k.${m}`);
    expect(infer(b)[0]).toMatchObject({
      members: ['a', 'a!', 'b'],
      evidence: ['q.a.x', 'q.a!.x', 'q.b.x'],
    });
  });
});
