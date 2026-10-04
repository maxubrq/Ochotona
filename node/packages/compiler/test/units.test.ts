import {
  type Desired,
  type Family,
  type TopoQueue,
  buildDesired,
  parseTemplate,
} from '@ochotona/model';
import { describe, expect, it } from 'vitest';
import { formatChange, writeOchoYaml } from '../src';
import {
  familyTuples,
  missingMembers,
  targetExchange,
  targetTuples,
  uncovered,
} from '../src/import/merge';
import { selectorValue } from '../src/yaml/write';
import { T0 } from './fixtures';

const header = {
  context: 'prod',
  toolVersion: '0.1.0',
  at: T0,
  schemaUrl: 'u',
};

function desired(obj: unknown): Desired {
  const d = buildDesired(obj, T0);
  if (!d.ok) throw new Error(JSON.stringify(d.error));
  return d.value;
}

const base = {
  spec: '0.4',
  broker: { min_version: '4.2' },
  families: {
    jobs: {
      vhost: 'work',
      exchange: 'jobs',
      routing_key: 'job.{kind}.{id}',
      queue: 'job-{kind}-{id}',
      members: 'registry',
    },
    scan: {
      exchange: 'scan',
      routing_key: 'r_{e}',
      queue: 'r_{e}_q',
      members: ['a', 'b'],
    },
  },
  flows: {
    jobs: { vhost: 'work', tolerance: 'strict', family: 'jobs' },
    scan: { tolerance: 'loose', family: 'scan' },
  },
  services: { api: { user: 'api', flows: ['scan'] } },
  waivers: [
    {
      rule: 'T1',
      object: 'queue r_a_q',
      reason: 'x',
      by: 'max',
      until: '2027-01-01',
    },
    {
      rule: 'T2',
      object: { kind: 'exchange', vhost: 'work', name: 'jobs' },
      reason: 'y',
      by: 'max',
      until: '2027-01-01',
    },
    {
      rule: 'VT3',
      object: 'broker',
      reason: 'z',
      by: 'max',
      until: '2027-01-01',
    },
    {
      rule: 'R1',
      object: 'flow scan',
      reason: 'w',
      by: 'max',
      until: '2027-01-01',
    },
  ],
};

describe('writeOchoYaml: lớp ngữ nghĩa đầy đủ', () => {
  const d = desired(base);
  const text = writeOchoYaml(d, { header, ochoComments: [] });

  it('family có vhost và registry, services, waivers với mọi dạng bộ chọn', () => {
    expect(text).toContain(
      [
        '  jobs:',
        '    vhost: work',
        '    exchange: jobs',
        '    routing_key: "job.{kind}.{id}"',
        '    queue: "job-{kind}-{id}"',
        '    members: registry',
      ].join('\n'),
    );
    expect(text).toContain(
      'services:\n  api:\n    user: api\n    flows: [ scan ]\n',
    );
    expect(text).toContain('    object: queue r_a_q\n');
    expect(text).toContain(
      '    object: { kind: exchange, vhost: work, name: jobs }\n',
    );
    expect(text).toContain('    object: broker\n');
    expect(text).toContain('    object: flow scan\n');
    const again = desired(JSON.parse(JSON.stringify(base)));
    expect(writeOchoYaml(again, { header, ochoComments: [] })).toBe(text);
  });

  it('selectorValue cho binding, consumer dùng refKey', () => {
    expect(
      selectorValue({
        kind: 'binding',
        vhost: '/',
        source: 'a',
        destinationType: 'queue',
        destination: 'q',
        routingKey: '',
        argsKey: '',
      }),
    ).toBe('binding:%2F:a:queue:q::');
    expect(selectorValue({ kind: 'consumer', channel: 'c', tag: 't' })).toBe(
      'consumer:c:t',
    );
  });

  it('chú thích ocho: trên phần tử seq, trong map, trong seq, ở gốc, đường dẫn không có', () => {
    const out = writeOchoYaml(d, {
      header,
      ochoComments: [
        { path: ['waivers', 1], placement: 'before', lines: ['second waiver'] },
        { path: ['waivers'], placement: 'inside', lines: ['inside waivers'] },
        { path: [], placement: 'inside', lines: ['root'] },
        { path: [], placement: 'before', lines: ['nowhere'] },
        {
          path: ['flows', 'missing'],
          placement: 'before',
          lines: ['falls back to flows'],
        },
        { path: ['spec', 'x'], placement: 'before', lines: ['through scalar'] },
        {
          path: ['broker'],
          placement: 'inside',
          lines: ['flow map falls back'],
        },
        {
          path: ['flows', 'nope', 'x'],
          placement: 'inside',
          lines: ['missing inside'],
        },
        {
          path: ['waivers', 9],
          placement: 'inside',
          lines: ['seq index missing'],
        },
        { path: ['spec', 'x'], placement: 'inside', lines: ['scalar inside'] },
      ],
    });
    expect(out).toContain('  # ocho: inside waivers\n  - rule: T1');
    expect(out).toContain('  # ocho: second waiver\n  - rule: T2');
    expect(out).toMatch(
      /# ocho: root\n# ocho: through scalar\n# ocho: scalar inside\nspec:/,
    );
    expect(out).not.toContain('nowhere');
    expect(out).toMatch(
      /# ocho: falls back to flows\n# ocho: missing inside\nflows:/,
    );
    expect(out).toContain('# ocho: flow map falls back\nbroker:');
    expect(out).toContain('# ocho: seq index missing\nwaivers:');
  });
});

describe('writeOchoYaml: hợp nhất với file cũ', () => {
  const d = desired(base);
  const fresh = writeOchoYaml(d, { header, ochoComments: [] });
  const write = (text: string, dd = d, keep?: ('services' | 'waivers')[]) =>
    writeOchoYaml(dd, {
      header,
      ochoComments: [],
      base: { text },
      ...(keep ? { keep } : {}),
    });

  it('giá trị đổi: chú thích cuối dòng và dòng trống đi theo', () => {
    const user = fresh.replace(
      '    tolerance: loose\n',
      '\n    tolerance: loose # keep me\n',
    );
    const changed = desired({
      ...base,
      flows: { ...base.flows, scan: { tolerance: 'strict', family: 'scan' } },
    });
    const out = write(user, changed);
    expect(out).toContain('\n\n    tolerance: strict # keep me\n');
  });

  it('collection kiểu flow của người dùng: giữ kiểu flow khi đổi, vẫn vừa dòng', () => {
    const user = fresh.replace(
      '  scan:\n    tolerance: loose\n    family: scan\n',
      '  scan: { tolerance: loose, family: scan }\n',
    );
    const changed = desired({
      ...base,
      flows: { ...base.flows, scan: { tolerance: 'strict', family: 'scan' } },
    });
    expect(write(user, changed)).toContain(
      '  scan: { tolerance: strict, family: scan }\n',
    );
    const members = desired({
      ...base,
      families: {
        ...base.families,
        scan: { ...base.families.scan, members: ['a', 'b', 'c'] },
      },
    });
    expect(write(fresh, members)).toContain('    members: [ a, b, c ]\n');
  });

  it('khoá phức trong file cũ bị bỏ; chú thích cấp document và cuối file được giữ', () => {
    const user = fresh
      .replace('spec: "0.4"', '# about this file\n\nspec: "0.4"')
      .replace('families:\n', 'families:\n  ? [odd]\n  : 1\n')
      .concat('\n# end of file\n');
    const out = write(user);
    expect(out).not.toContain('odd');
    expect(out).toMatch(
      /ocho import rewrites it\.\n\n# about this file\n\nspec:/,
    );
    expect(out.endsWith('\n# end of file\n')).toBe(true);
    expect(write(out)).toBe(out);
  });

  it('keep: mục vắng trong file cũ thì không ghi; giá trị rỗng giữ nguyên', () => {
    const noServices = fresh.replace(/\nservices:\n {2}api:\n.*\n.*\n/, '\n');
    expect(write(noServices, d, ['services'])).not.toContain('services:');
    const nullServices = fresh.replace(
      /services:\n {2}api:\n.*\n.*\n/,
      'services:\n',
    );
    expect(write(nullServices, d, ['services'])).toContain(
      '\nservices:\n\nwaivers:',
    );
  });
});

describe('merge: hàm phụ', () => {
  const q = (name: string, vhost = 'work'): TopoQueue => ({
    vhost,
    name,
    type: 'classic',
    durable: true,
    autoDelete: false,
    arguments: {},
  });
  const fam = (members: Family['members']): Family => ({
    name: 'jobs',
    vhost: 'work',
    exchange: 'jobs',
    routingKey: (parseTemplate('job.{kind}.{id}') as { value: Family['queue'] })
      .value,
    queue: (parseTemplate('job-{kind}-{id}') as { value: Family['queue'] })
      .value,
    members,
  });

  it('registry nhiều tham số: mỗi queue khớp điền đúng giá trị của nó', () => {
    const t = familyTuples(fam('registry'), [
      q('job-mail-1'),
      q('job-sms-2'),
      q('job-push-3', '/'),
      q('other'),
    ]);
    expect(t).toEqual([
      {
        queue: 'job-mail-1',
        tuple: JSON.stringify(['work', 'jobs', 'job.mail.1', 'job-mail-1']),
      },
      {
        queue: 'job-sms-2',
        tuple: JSON.stringify(['work', 'jobs', 'job.sms.2', 'job-sms-2']),
      },
    ]);
  });

  it('family không tồn tại: không có bộ, exchange rỗng', () => {
    expect(targetTuples('/', { kind: 'family', family: 'x' }, {}, [])).toEqual(
      [],
    );
    expect(targetExchange({ kind: 'family', family: 'x' }, {})).toBe('');
    expect(
      targetExchange({ kind: 'family', family: 'jobs' }, { jobs: fam(['a']) }),
    ).toBe('jobs');
  });

  it('targetExchange theo từng dạng đích', () => {
    expect(
      targetExchange(
        { kind: 'binding', exchange: 'b', routingKey: 'k', groups: [] },
        {},
      ),
    ).toBe('b');
    expect(
      targetExchange({ kind: 'fanout', exchange: 'f', groups: [] }, {}),
    ).toBe('f');
    expect(targetExchange({ kind: 'direct', queue: 'q' }, {})).toBe('');
  });

  it('missingMembers chỉ xét queue cùng vhost của family; registry không có thành viên mất', () => {
    expect(missingMembers(fam(['mail']), [q('job-mail-mail', '/')])).toEqual([
      'mail',
    ]);
    expect(missingMembers(fam(['mail']), [q('job-mail-mail')])).toEqual([]);
    expect(missingMembers(fam('registry'), [])).toEqual([]);
  });

  it('uncovered: family đi qua nguyên vẹn; direct đã phủ thì null', () => {
    expect(uncovered('/', { kind: 'family', family: 'x' }, new Set())).toEqual({
      kind: 'family',
      family: 'x',
    });
    const covered = new Set([JSON.stringify(['/', '', 'q', 'q'])]);
    expect(uncovered('/', { kind: 'direct', queue: 'q' }, covered)).toBeNull();
    expect(
      uncovered(
        '/',
        { kind: 'fanout', exchange: 'e', groups: ['a'] },
        new Set([JSON.stringify(['/', 'e', '', 'a'])]),
      ),
    ).toBeNull();
  });

  it('formatChange: chuỗi viết trơn, giá trị khác dạng JSON, vắng là (none)', () => {
    expect(
      formatChange({
        op: 'update',
        ref: { kind: 'queue', vhost: 'v', name: 'q' },
        fields: [
          {
            path: ['arguments', 'x-overflow'],
            before: 'drop-head',
            after: 'reject-publish',
          },
          { path: ['arguments', 'x-args'], before: { a: 1 }, after: undefined },
        ],
      }),
    ).toBe(
      '~ queue q (vhost v): arguments.x-overflow drop-head → reject-publish, arguments.x-args {"a":1} → (none)',
    );
  });
});

describe('writeOchoYaml: ca do mutation testing chỉ ra', () => {
  const mk = (over: Record<string, unknown> = {}) =>
    desired({ ...base, ...over });
  const w = (d: Desired, b?: string) =>
    writeOchoYaml(d, {
      header,
      ochoComments: [],
      ...(b === undefined ? {} : { base: { text: b } }),
    });
  const flowsWith = (groups: string[]) => ({
    flows: {
      ...base.flows,
      f: { tolerance: 'loose', exchange: 'e', routing_key: 'k', groups },
    },
  });

  it('đầu file: header, dòng trống, spec và broker liền nhau, dòng trống trước families', () => {
    expect(w(mk()).split('\n').slice(3, 7)).toEqual([
      '',
      'spec: "0.4"',
      'broker: { min_version: "4.2" }',
      '',
    ]);
  });

  it('ranh giới 120 ký tự của danh sách: vừa thì flow, quá một ký tự thì block', () => {
    const fit = 'q'.repeat(104);
    const line = `    groups: [ ${fit} ]`;
    expect(line.length).toBe(120);
    expect(w(mk(flowsWith([fit])))).toContain(`${line}\n`);
    const over = `${fit}x`;
    expect(w(mk(flowsWith([over])))).toContain(
      `    groups:\n      - ${over}\n`,
    );
  });

  it('ranh giới 120 ký tự của object waiver và của broker', () => {
    const name = 'n'.repeat(75);
    const waiver = (n: string) => ({
      waivers: [
        {
          rule: 'T1',
          object: { kind: 'queue', vhost: 'v', name: n },
          reason: 'r',
          by: 'b',
          until: '2027-01-01',
        },
      ],
    });
    const line = `    object: { kind: queue, vhost: v, name: ${name} }`;
    expect(line.length).toBe(120);
    expect(w(mk(waiver(name)))).toContain(`${line}\n`);
    expect(w(mk(waiver(`${name}x`)))).toContain(
      `    object:\n      kind: queue\n`,
    );
    const pre = 'a'.repeat(89);
    const broker = `broker: { min_version: 4.2.0-${pre} }`;
    expect(broker.length).toBe(120);
    expect(w(mk({ broker: { min_version: `4.2.0-${pre}` } }))).toContain(
      `${broker}\n`,
    );
    expect(w(mk({ broker: { min_version: `4.2.0-${pre}x` } }))).toContain(
      `broker:\n  min_version: 4.2.0-${pre}x\n`,
    );
  });

  it('danh sách waivers luôn kiểu block, kể cả khi ngắn', () => {
    const one = mk({
      waivers: [
        {
          rule: 'T1',
          object: 'broker',
          reason: 'r',
          by: 'b',
          until: '2027-01-01',
        },
      ],
    });
    expect(w(one)).toContain('waivers:\n  - rule: T1\n    object: broker\n');
  });

  it('base: thứ tự families, services của người dùng giữ; luồng đổi thì khoá theo thứ tự chuẩn', () => {
    const d = mk({
      families: {
        ...base.families,
        alpha: {
          exchange: 'x',
          routing_key: 'a_{e}',
          queue: 'a_{e}_q',
          members: ['m'],
        },
      },
      services: { api: base.services.api, zed: { user: 'z', flows: [] } },
    });
    const fresh = w(d);
    const swap = (text: string, a: string, b: string) => {
      const i = text.indexOf(a);
      const j = text.indexOf(b);
      return (
        text.slice(0, i) +
        text.slice(j, j + (j - i)) +
        text.slice(i, j) +
        text.slice(j + (j - i))
      );
    };
    // Người dùng đặt `scan` trước `alpha`, `zed` trước `api`.
    const fam = fresh.slice(
      fresh.indexOf('  alpha:'),
      fresh.indexOf('\nflows:'),
    );
    const blocks = fam.split(/\n(?= {2}\w)/);
    let user = fresh.replace(fam, [blocks[2], blocks[0], blocks[1]].join('\n'));
    user = user.replace(
      '  api:\n    user: api\n    flows: [ scan ]\n  zed:\n    user: z\n    flows: []\n',
      '  zed:\n    user: z\n    flows: []\n  api:\n    user: api\n    flows: [ scan ]\n',
    );
    void swap;
    const out = w(d, user);
    expect(out.indexOf('  scan:')).toBeLessThan(out.indexOf('  alpha:'));
    expect(out.indexOf('  zed:')).toBeLessThan(out.indexOf('  api:'));
    // Luồng người dùng viết theo thứ tự khác, giá trị đổi: ghi theo thứ tự chuẩn.
    const odd = fresh.replace(
      '  scan:\n    tolerance: loose\n    family: scan\n',
      '  scan:\n    family: scan\n    tolerance: loose\n',
    );
    const changed = mk({
      flows: { ...base.flows, scan: { tolerance: 'strict', family: 'scan' } },
    });
    expect(w(changed, odd)).toContain(
      '  scan:\n    tolerance: strict\n    family: scan\n',
    );
  });

  it('base: mục không còn trong Desired bị bỏ', () => {
    const extra = w(mk()).replace(
      'flows:\n',
      'flows:\n  gone:\n    tolerance: loose\n    queue: q\n',
    );
    expect(w(mk(), extra)).not.toContain('gone');
  });

  it('base: danh sách block giữ kiểu block và chú thích của phần tử khi thêm phần tử', () => {
    const d1 = mk(flowsWith(['a', 'b']));
    const user = w(d1).replace(
      '    groups: [ a, b ]\n',
      '    groups:\n      # first\n      - a # the a\n      - b\n',
    );
    const out = w(mk(flowsWith(['a', 'b', 'c'])), user);
    expect(out).toContain(
      '    groups:\n      # first\n      - a # the a\n      - b\n      - c\n',
    );
  });

  it('base: danh sách flow quá 120 ký tự sau khi thêm thì thành block', () => {
    const long = 'q'.repeat(60);
    const user = w(mk(flowsWith([long])));
    expect(user).toContain(`    groups: [ ${long} ]\n`);
    expect(w(mk(flowsWith([long, `${long}2`])), user)).toContain(
      `    groups:\n      - ${long}\n      - ${long}2\n`,
    );
  });

  it('chú thích ocho nhận cả "#ocho:"; chú thích người dùng nhắc tới ocho thì giữ', () => {
    const user = w(mk())
      .replace('flows:\n', 'flows:\n  #ocho: tight\n  # see ocho: docs\n')
      // Dòng giống header ngay trên khoá đầu (không có dòng trống) vẫn bị bỏ.
      .replace(
        '\n\nspec:',
        '\n\n# note: ocho import done\n#ocho import 0.0.1 · context x · y\nspec:',
      );
    const out = w(mk(), user);
    expect(out).not.toContain('tight');
    expect(out).not.toContain('0.0.1');
    expect(out).toContain('  # see ocho: docs\n');
    expect(out).toContain('# note: ocho import done\nspec:');
  });

  it('bỏ chú thích ocho không để lại dòng "#" trống ở đầu hay cuối khối', () => {
    const user = w(mk())
      .replace(
        '  jobs:\n    vhost',
        '  # ocho: stale\n  #\n  # keep\n  #\n  # ocho: stale2\n  jobs:\n    vhost',
      )
      .replace('flows:\n', '# ocho: only\nflows:\n');
    const out = w(mk(), user);
    expect(out).toContain('families:\n  # keep\n  jobs:');
    expect(out).toContain('\n\nflows:\n');
  });

  it('chú thích cuối file nhiều dòng giữ nguyên', () => {
    const user = `${w(mk())}\n# end 1\n# end 2\n`;
    expect(w(mk(), user).endsWith('\n# end 1\n# end 2\n')).toBe(true);
  });

  it('argument lồng nhau sắp khoá ở mọi cấp', () => {
    const d = mk({
      topology: {
        queues: [
          { name: 'q', arguments: { b: { d: 1, c: [{ p: 1, o: 2 }] }, a: 1 } },
        ],
      },
    });
    expect(w(d)).toContain(
      'arguments: { a: 1, b: { c: [ { o: 2, p: 1 } ], d: 1 } }',
    );
  });

  it('bộ chọn policy, operator_policy', () => {
    const d = mk({
      waivers: [
        {
          rule: 'T1',
          object: { kind: 'policy', vhost: 'v', name: 'pv' },
          reason: 'r',
          by: 'b',
          until: '2027-01-01',
        },
        {
          rule: 'T1',
          object: 'policy p',
          reason: 'r',
          by: 'b',
          until: '2027-01-01',
        },
        {
          rule: 'T1',
          object: { kind: 'operator_policy', vhost: 'v', name: 'o' },
          reason: 'r',
          by: 'b',
          until: '2027-01-01',
        },
      ],
    });
    const out = w(d);
    expect(out).toContain('    object: policy p\n');
    expect(out).toContain('    object: { kind: policy, vhost: v, name: pv }\n');
    expect(out).toContain(
      '    object: { kind: operator_policy, vhost: v, name: o }\n',
    );
  });

  it('base: ranh giới 120 ký tự trong map lồng (luồng → groups)', () => {
    const user = w(mk(flowsWith(['a'])));
    const fit = 'q'.repeat(104);
    expect(w(mk(flowsWith([fit])), user)).toContain(`    groups: [ ${fit} ]\n`);
    expect(w(mk(flowsWith([`${fit}x`])), user)).toContain(
      `    groups:\n      - ${fit}x\n`,
    );
  });

  it('base: waiver hợp nhất không keep, object vẫn kiểu flow, danh sách vẫn block', () => {
    const one = {
      rule: 'T1',
      object: { kind: 'queue', vhost: 'v', name: 'a' },
      reason: 'r',
      by: 'b',
      until: '2027-01-01',
    };
    const two = { ...one, object: { kind: 'queue', vhost: 'v', name: 'b' } };
    const user = w(mk({ waivers: [one] }));
    const out = w(mk({ waivers: [two, one] }), user);
    expect(out).toContain(
      'waivers:\n  - rule: T1\n    object: { kind: queue, vhost: v, name: b }\n',
    );
  });

  it('base: giá trị đổi từ scalar sang danh sách thì dựng mới', () => {
    const user = w(mk(flowsWith(['a']))).replace(
      '    groups: [ a ]\n',
      '    groups: a\n',
    );
    expect(w(mk(flowsWith(['a', 'b'])), user)).toContain(
      '    groups: [ a, b ]\n',
    );
  });

  it('chú thích qua scalar bằng chỉ số rơi về khoá gần nhất', () => {
    const out = writeOchoYaml(mk(), {
      header,
      ochoComments: [{ path: ['spec', 0], placement: 'before', lines: ['x'] }],
    });
    expect(out).toContain('# ocho: x\nspec:');
  });
});
