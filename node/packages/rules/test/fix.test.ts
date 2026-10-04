import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { brokerAt } from '../fixtures/builder';
import { fixture, runFixture } from '../fixtures/fixture';
import { unitFixtures } from '../fixtures/unit';
import { runRules } from '../src/engine';
import { escapeRegex, shellQuote } from '../src/fix';
import { selectRules } from '../src/select';

const shCheck = (cmd: string) => execFileSync('sh', ['-n', '-c', cmd]);

describe('fix commands', () => {
  it('quotes POSIX-style', () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    expect(
      execFileSync('sh', [
        '-c',
        `printf %s ${shellQuote("a 'b' / c")}`,
      ]).toString(),
    ).toBe("a 'b' / c");
  });

  it('escapes regex metacharacters', () => {
    expect(new RegExp(`^${escapeRegex('a.b*(c)')}$`).test('a.b*(c)')).toBe(
      true,
    );
  });

  it('every fixture command parses with sh -n and has no secret', () => {
    const cmds: string[] = [];
    for (const f of unitFixtures)
      for (const r of runFixture(f).results)
        if (r.fix?.rabbitmqadmin) cmds.push(r.fix.rabbitmqadmin);
    expect(cmds.length).toBeGreaterThan(10);
    for (const c of cmds) {
      shCheck(c);
      expect(c).not.toMatch(/password|https?:\/\//i);
    }
  });

  it('handles names with quotes, spaces and slashes', () => {
    const name = "o'rders / eu west";
    const f = fixture({
      rule: 'T3',
      kind: 'fail',
      title: 'odd name',
      raw: brokerAt('4.2.1')
        .queue(name, { vhost: "v'1", args: { 'x-max-length': 1 } })
        .build(),
      expect: [],
    });
    const cmd = runFixture(f).results[0].fix!.rabbitmqadmin!;
    shCheck(cmd);
    expect(cmd).toMatchInlineSnapshot(
      `"rabbitmqadmin --vhost 'v'\\''1' policies declare --name 'ocho-q-o'\\''rders / eu west' --pattern '^o'\\''rders / eu west$' --apply-to 'queues' --priority '0' --definition '{"overflow":"reject-publish"}'"`,
    );
  });

  it('merges into the policy already applied instead of overriding it (L3)', () => {
    const f = fixture({
      rule: 'T2',
      kind: 'fail',
      title: 'merge',
      raw: brokerAt('4.2.1')
        .exchange('orders')
        .queue('q')
        .bind('orders', 'q')
        .policy('fed', {
          pattern: '^ord',
          applyTo: 'exchanges',
          priority: 3,
          definition: { 'federation-upstream-set': 'all' },
        })
        .build(),
      expect: [],
    });
    const cmd = runFixture(f).results[0].fix!.rabbitmqadmin!;
    expect(cmd).toContain(
      "--name 'fed' --pattern '^ord' --apply-to 'exchanges' --priority '3'",
    );
    expect(cmd).toContain(
      '"alternate-exchange":"ocho.unroutable","federation-upstream-set":"all"',
    );
  });

  it('every command for one policy carries the union of keys, so applying them in any order converges', () => {
    const quorum = () =>
      brokerAt('4.2.1').queue('jobs', {
        type: 'quorum',
        args: { 'x-max-length': 10, 'x-dead-letter-exchange': 'dlx' },
      });
    const cmds = (raw: ReturnType<ReturnType<typeof quorum>['build']>) => {
      const ctx = runFixture(
        fixture({ rule: 'T3', kind: 'fail', title: 'ctx', raw, expect: [] }),
      ).ctx;
      const rs = runRules(
        ctx,
        selectRules({ targetVersion: false, includeExperimental: true }),
        {
          waivers: [],
          scope: { vhosts: 'all', flow: null },
          mode: 'test',
        },
      ).results;
      return rs
        .filter((r) => r.fix?.rabbitmqadmin)
        .map((r) => [r.rule, r.fix!.rabbitmqadmin!] as const);
    };
    // Chưa có policy: T3 và T5 cùng khai một policy ocho-q-jobs, cùng định nghĩa.
    const fresh = cmds(quorum().build());
    expect(fresh.map(([r]) => r).sort()).toEqual(['T3', 'T5']);
    expect(new Set(fresh.map(([, c]) => c)).size).toBe(1);
    expect(fresh[0][1]).toContain("--name 'ocho-q-jobs'");
    expect(fresh[0][1]).toContain(
      '"dead-letter-strategy":"at-least-once","overflow":"reject-publish"',
    );
    // Đã có policy: mọi lệnh khai lại đúng policy đó với khoá cũ cộng hợp khoá mới.
    const applied = cmds(
      quorum()
        .policy('ops', {
          pattern: '^jobs$',
          applyTo: 'queues',
          priority: 5,
          definition: { 'message-ttl': 60000 },
        })
        .build(),
    );
    expect(new Set(applied.map(([, c]) => c)).size).toBe(1);
    expect(applied[0][1]).toContain("--name 'ops'");
    expect(applied[0][1]).toContain('"message-ttl":60000');
    expect(applied[0][1]).toContain(
      '"dead-letter-strategy":"at-least-once","message-ttl":60000,"overflow":"reject-publish"',
    );
  });
});
