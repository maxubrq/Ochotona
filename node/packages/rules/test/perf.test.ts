import { describe, expect, it } from 'vitest';
import { brokerAt } from '../fixtures/builder';
import { fixture, runFixture } from '../fixtures/fixture';
import { runRules } from '../src/engine';
import { selectRules } from '../src/select';

describe('hiệu năng', () => {
  it('runs every rule on 10k queues, 20k bindings, 5k connections, 20k channels, 20k consumers within 1 s', () => {
    const b = brokerAt('4.2.1')
      .policy('cap', {
        pattern: '^q1',
        applyTo: 'queues',
        definition: { 'max-length': 1000 },
      })
      .policy('ttl', {
        pattern: '^q2',
        priority: 1,
        definition: { 'message-ttl': 1000 },
      });
    for (let i = 0; i < 1000; i++) b.exchange(`x${i}`);
    for (let i = 0; i < 10_000; i++) {
      b.queue(`q${i}`, {
        type: i % 2 ? 'quorum' : 'classic',
        ready: i,
        consumers: 1,
      });
      b.bind(`x${i % 1000}`, `q${i}`, { routingKey: 'a' }).bind(
        `x${(i + 1) % 1000}`,
        `q${i}`,
        { routingKey: 'b' },
      );
    }
    for (let c = 0; c < 5000; c++) {
      b.connection(`c${c}`);
      for (let n = 1; n <= 4; n++) {
        b.channel(`c${c}`, n, {
          publish: n === 1 ? 5 : 0,
          consumers: 1,
          confirm: n % 2 === 0,
        });
        b.consumer(`t${c}-${n}`, {
          channel: `c${c} (${n})`,
          queue: `q${(c * 4 + n) % 10_000}`,
        });
      }
    }
    const { ctx } = runFixture(
      fixture({
        rule: 'T2',
        kind: 'anti',
        title: 'perf',
        raw: b.build(),
        expect: [],
      }),
      'production',
    );
    const rules = selectRules({
      targetVersion: false,
      includeExperimental: true,
    });
    const opts = {
      waivers: [],
      scope: { vhosts: 'all' as const, flow: null },
      mode: 'production' as const,
    };
    runRules(ctx, rules, opts); // làm nóng JIT
    const t = performance.now();
    const out = runRules(ctx, rules, opts);
    const ms = performance.now() - t;
    expect(out.internal).toEqual([]);
    expect(out.results.length).toBeGreaterThan(100_000);
    expect(ms).toBeLessThan(1000);
  }, 120_000);
});
