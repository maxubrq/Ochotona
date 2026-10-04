// fast-check: RawResponses ngẫu nhiên hợp lệ → buildActual → runRules.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type ObjectKind, type RawResponses, refKey } from '@ochotona/model';
import { exclusionsFor } from '@ochotona/spec';
import '@ochotona/spec/i18n/en';
import { brokerAt } from '../fixtures/builder';
import { fixture, runFixture } from '../fixtures/fixture';
import { COLLECTION } from '../src/paths';
import { catalog } from '../src/catalog';
import { runRules } from '../src/engine';
import { selectRules } from '../src/select';
import { toFinding } from '../src/finding';

const name = fc.stringMatching(/^[a-z][a-z.-]{0,5}$/);
const argKeys = fc.subarray([
  ['x-max-length', 10],
  ['x-message-ttl', 1000],
  ['x-expires', 5000],
  ['x-dead-letter-exchange', 'dlx'],
  ['x-overflow', 'reject-publish'],
  ['x-delivery-limit', 3],
] as const);
const endpoints = [
  'policies',
  'bindings',
  'queues',
  'exchanges',
  'connections',
  'channels',
  'consumers',
  'nodes',
  'deprecatedUsed',
] as const;

const broker = fc
  .record({
    version: fc.constantFrom('3.13.7', '4.0.5', '4.2.1', '4.3.0'),
    queues: fc.uniqueArray(
      fc.record({
        name,
        type: fc.constantFrom('classic', 'quorum', 'stream'),
        args: argKeys,
        ready: fc.nat(10),
      }),
      { selector: (q) => q.name, maxLength: 6 },
    ),
    exchanges: fc.uniqueArray(name, { maxLength: 4 }),
    policies: fc.array(
      fc.record({
        pattern: fc.constantFrom('.*', '^a', '^b.', 'x$'),
        priority: fc.nat(2),
        args: argKeys,
      }),
      { maxLength: 3 },
    ),
    connections: fc.array(
      fc.record({
        heartbeat: fc.constantFrom(0, 60),
        named: fc.boolean(),
        confirm: fc.boolean(),
        publish: fc.nat(3),
        ack: fc.boolean(),
        prefetch: fc.constantFrom(0, 1, 10),
      }),
      { maxLength: 3 },
    ),
    statsOff: fc.boolean(),
    broken: fc.subarray([...endpoints], { maxLength: 2 }),
  })
  .map((g): RawResponses => {
    const b = brokerAt(g.version);
    for (const q of g.queues)
      b.queue(q.name, {
        type: q.type,
        ready: q.ready,
        args: Object.fromEntries(q.args),
      });
    for (const x of g.exchanges) b.exchange(x);
    g.exchanges.forEach((x, i) => g.queues[i] && b.bind(x, g.queues[i].name));
    g.policies.forEach((p, i) =>
      b.policy(`p${i}`, {
        pattern: p.pattern,
        priority: p.priority,
        definition: Object.fromEntries(p.args.map(([k, v]) => [k.slice(2), v])),
      }),
    );
    g.connections.forEach((c, i) => {
      b.connection(`c${i}`, {
        heartbeat: c.heartbeat,
        connectionName: c.named ? `c${i}` : null,
      });
      b.channel(`c${i}`, 1, {
        confirm: c.confirm,
        publish: c.publish,
        consumers: g.queues[0] ? 1 : 0,
      });
      if (g.queues[0])
        b.consumer(`t${i}`, {
          channel: `c${i} (1)`,
          queue: g.queues[0].name,
          ackRequired: c.ack,
          prefetch: c.prefetch,
        });
    });
    if (g.statsOff) b.statsOff();
    for (const e of g.broken) b.httpError(e, 403);
    return b.build();
  });

describe('tính chất', () => {
  it('never throws; every rule covers every object or says not_checked once; output is deterministic', () => {
    const rules = selectRules({
      targetVersion: true,
      includeExperimental: true,
    });
    fc.assert(
      fc.property(broker, (raw) => {
        const f = fixture({
          rule: 'T2',
          kind: 'anti',
          title: 'p',
          raw,
          targetVersion: '4.2.0',
          expect: [],
        });
        const { ctx } = runFixture(f, 'production');
        const opts = {
          waivers: [],
          scope: { vhosts: 'all' as const, flow: null },
          mode: 'production' as const,
        };
        const a = runRules(ctx, rules, opts);
        const b = runRules(ctx, rules, opts);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        expect(a.internal.filter((i) => i.kind !== 'cl4_downgrade')).toEqual(
          [],
        );
        for (const r of a.results) toFinding(r, 'en');

        for (const def of catalog) {
          const mine = a.results.filter((r) => r.rule === def.code);
          const kind: ObjectKind = def.appliesTo;
          const coll = COLLECTION[kind]?.(ctx.actual);
          if (coll?.state === 'unknown') {
            const nc = mine.filter(
              (r) =>
                r.object.kind === 'broker' &&
                r.notChecked?.path === def.appliesTo,
            );
            expect(nc).toHaveLength(1);
            continue;
          }
          const items =
            coll?.state === 'known'
              ? coll.value
              : [{ ref: { kind: 'broker' } }];
          const excl =
            kind === 'exchange' || kind === 'queue' || kind === 'consumer'
              ? exclusionsFor(kind, 'rules')
              : [];
          for (const it of items) {
            const skipped = excl.some(
              (x) =>
                x.rulesOutcome === 'skip' &&
                ((x.match.nameEquals !== undefined &&
                  it.ref.name === x.match.nameEquals) ||
                  (x.match.namePrefix !== undefined &&
                    it.ref.name.startsWith(x.match.namePrefix) &&
                    x.match.hasOutgoingBindings === undefined)),
            );
            if (skipped) continue;
            const key = refKey(it.ref);
            expect(
              mine.some((r) => refKey(r.object) === key),
              `${def.code} ${key}`,
            ).toBe(true);
          }
        }
      }),
      { numRuns: 150 },
    );
  });
});
