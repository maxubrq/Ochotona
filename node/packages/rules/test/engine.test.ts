import { refKey } from '@ochotona/model';
import { describe, expect, it } from 'vitest';
import { brokerAt } from '../fixtures/builder';
import { declared, fixture, ref, runFixture } from '../fixtures/fixture';
import { catalog } from '../src/catalog';
import { defineRule } from '../src/define';
import { runRules } from '../src/engine';
import { requiredPaths, selectRules } from '../src/select';
import type { AnyRuleDef } from '../src/types';

const ctxOf = (
  raw = brokerAt('4.2.1').queue('q').build(),
  desired: unknown = null,
) =>
  runFixture(
    fixture({
      rule: 'DX1',
      kind: 'anti',
      title: 'ctx',
      raw,
      desired,
      expect: [],
    }),
  ).ctx;

const run = (
  rules: AnyRuleDef[],
  mode: 'test' | 'production' = 'production',
  ctx = ctxOf(),
) =>
  runRules(ctx, rules, {
    waivers: [],
    scope: { vhosts: 'all', flow: null },
    mode,
  });

describe('selectRules', () => {
  it('drops targetVersionOnly rules without --target-version', () => {
    const codes = (tv: boolean) =>
      selectRules({ targetVersion: tv, includeExperimental: false }).map(
        (d) => d.code,
      );
    expect(codes(false)).not.toContain('VT1');
    expect(codes(true)).toContain('VT1');
    expect(new Set(codes(true)).size).toBe(22);
  });

  it('catalog follows rules.json order and has one file per rule', () => {
    expect(catalog.map((d) => d.code)).toEqual([
      'C1',
      'C2',
      'DX1',
      'DX2',
      'DX3',
      'F4',
      'L3',
      'L3',
      'N1',
      'N2',
      'N3',
      'Q3',
      'R1',
      'T1',
      'T2',
      'T3',
      'T4',
      'T5',
      'T9',
      'VT1',
      'VT2',
      'VT3',
      'VT4',
    ]);
  });

  it('requiredPaths is the sorted union of requires and optional', () => {
    const paths = requiredPaths(
      selectRules({ targetVersion: true, includeExperimental: true }),
    );
    expect(paths).toContain('queue.effective');
    expect(paths).toContain('user.tags');
    expect([...paths].sort()).toEqual(paths);
  });
});

describe('defineRule', () => {
  it('rejects unreachable paths and wrong appliesTo', () => {
    expect(() =>
      defineRule({
        code: 'DX1',
        appliesTo: 'queue',
        requires: ['channel.confirm'],
        optional: [],
        evaluate: () => ({ result: 'pass' }),
      }),
    ).toThrow(/not reachable/);
    expect(() =>
      defineRule({
        code: 'DX1',
        appliesTo: 'exchange',
        requires: [],
        optional: [],
        evaluate: () => ({ result: 'pass' }),
      }),
    ).toThrow(/appliesTo/);
  });
});

describe('runRules', () => {
  const failing = (over: object = {}) =>
    defineRule({
      code: 'DX1',
      appliesTo: 'queue',
      requires: ['queue.ready'],
      optional: [],
      evaluate: () => ({
        result: 'fail',
        severity: 'S3',
        urgency: 'hygiene',
        evidence: [],
        params: { ready: 1 },
        ...over,
      }),
    });

  it('catches a throwing rule in production and records it', () => {
    const boom = defineRule({
      code: 'DX1',
      appliesTo: 'queue',
      requires: [],
      optional: [],
      evaluate: () => {
        throw new Error('boom');
      },
    });
    const out = run([boom]);
    expect(out.results[0]).toMatchObject({
      result: 'not_checked',
      notChecked: { reason: { kind: 'error', message: 'boom' } },
    });
    expect(out.internal).toEqual([
      expect.objectContaining({ kind: 'exception', detail: 'boom' }),
    ]);
    expect(() => run([boom], 'test')).toThrow('boom');
  });

  it('flags contract violations: severity, params', () => {
    expect(() => run([failing({ severity: 'S1' })], 'test')).toThrow(
      /severity S1|CL4/,
    );
    expect(() => run([failing({ params: { nope: 1 } })], 'test')).toThrow(
      /not declared/,
    );
    expect(() => run([failing({ params: { ready: 'x' } })], 'test')).toThrow(
      /must be number/,
    );
    expect(run([failing({ params: { nope: 1 } })]).internal[0].kind).toBe(
      'contract',
    );
  });

  it('CL4: downgrades an S1 without observed evidence in production', () => {
    const s1 = defineRule({
      code: 'T5',
      appliesTo: 'queue',
      requires: [],
      optional: [],
      evaluate: () => ({
        result: 'fail',
        severity: 'S1',
        urgency: 'at_risk',
        evidence: [],
        params: {},
      }),
    });
    const out = run([s1]);
    expect(out.results[0].severity).toBe('S3');
    expect(out.internal[0].kind).toBe('cl4_downgrade');
    expect(() => run([s1], 'test')).toThrow(/CL4/);
    // strict: S1 không cần bằng chứng observed.
    const strict = ctxOf(
      undefined,
      declared({ f: { queue: 'q', tolerance: 'strict' } }),
    );
    expect(run([s1], 'test', strict).results[0].severity).toBe('S1');
  });

  it('needs on a field that is not optional is a contract error', () => {
    const bad = defineRule({
      code: 'DX1',
      appliesTo: 'queue',
      requires: ['queue.ready'],
      optional: [],
      evaluate: () => ({ result: 'needs', path: 'queue.ready' }),
    });
    expect(() => run([bad], 'test')).toThrow(/needs queue.ready/);
  });

  it('applies exclusions: skip and not_applicable with a note', () => {
    const ctx = ctxOf(
      brokerAt('4.2.1')
        .queue('amq.gen-1')
        .queue('mqtt-subscription-a')
        .queue('ocho.retry')
        .queue('x', { exclusive: true })
        .queue('q')
        .build(),
    );
    const out = run([failing()], 'production', ctx);
    expect(
      out.results.map((r) => [refKey(r.object), r.result, r.note]),
    ).toEqual([
      [ref.queue('q'), 'fail', undefined],
      [ref.queue('mqtt-subscription-a'), 'not_applicable', 'exclusion.EX6'],
    ]);
  });

  it('filters by vhost and flow', () => {
    const ctx = ctxOf(
      brokerAt('4.2.1')
        .queue('a')
        .queue('b')
        .queue('c', { vhost: 'v2' })
        .build(),
      declared({ f: { queue: 'a', tolerance: 'loose' } }),
    );
    const keys = (scope: { vhosts: string[] | 'all'; flow: string | null }) =>
      runRules(ctx, [failing()], {
        waivers: [],
        scope,
        mode: 'test',
      }).results.map((r) => refKey(r.object));
    expect(keys({ vhosts: ['v2'], flow: null })).toEqual([
      ref.queue('c', 'v2'),
    ]);
    expect(keys({ vhosts: 'all', flow: 'f' })).toEqual([ref.queue('a')]);
  });

  it('keeps a waived fail as fail and attaches the waiver until it expires', () => {
    const ctx = ctxOf();
    const waiver = (until: string) => ({
      rule: 'DX1',
      object: { kind: 'queue', vhost: '/', name: 'q' } as const,
      reason: 'r',
      by: 'me',
      until,
    });
    const w = (until: string) =>
      runRules(ctx, [failing()], {
        waivers: [waiver(until)],
        scope: { vhosts: 'all', flow: null },
        mode: 'test',
      }).results[0];
    expect(w('2026-10-04')).toMatchObject({
      result: 'fail',
      waiver: { until: '2026-10-04' },
    });
    expect(w('2026-10-03').waiver).toBeUndefined();
  });

  it('sorts fails first by severity, then rule order, then refKey', () => {
    const out = runFixture(
      fixture({
        rule: 'T3',
        kind: 'fail',
        title: 'sort',
        raw: brokerAt('4.2.1')
          .queue('b', { args: { 'x-max-length': 1 } })
          .queue('a')
          .queue('c', { args: { 'x-max-length': 1 } })
          .build(),
        desired: declared({ f: { queue: 'c', tolerance: 'strict' } }),
        expect: [],
      }),
    );
    expect(
      out.results.map((r) => [refKey(r.object), r.result, r.severity]),
    ).toEqual([
      [ref.queue('c'), 'fail', 'S1'],
      [ref.queue('b'), 'fail', 'S3'],
      [ref.queue('a'), 'pass', undefined],
    ]);
  });
});
