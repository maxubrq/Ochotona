import { afterEach, describe, expect, it, vi } from 'vitest';
import { format, registerMessages, type I18nKey, type Messages } from '../src';
import { messages as en } from '../src/i18n/en';
import { messages as vi_ } from '../src/i18n/vi';

afterEach(() => {
  registerMessages('en', en);
  registerMessages('vi', vi_);
  vi.restoreAllMocks();
});

describe('format', () => {
  it('uses one and other in English', () => {
    const p = { since: '2026-09-12T03:10:00Z' };
    expect(format('en', 'rule.T2.what', { ...p, count: 1 })).toBe(
      '1 unroutable message was dropped since 2026-09-12T03:10:00Z.',
    );
    expect(format('en', 'rule.T2.what', { ...p, count: 1240 })).toBe(
      '1240 unroutable messages were dropped since 2026-09-12T03:10:00Z.',
    );
  });

  it('uses only other in Vietnamese', () => {
    expect(format('vi', 'rule.T2.what', { count: 1, since: 'x' })).toBe(
      '1 message không định tuyến được đã bị bỏ kể từ x.',
    );
  });

  it('calls fmtNumber for #', () => {
    const fmt = vi.fn((n: number) => n.toLocaleString('en-US'));
    expect(format('en', 'rule.DX1.what', { ready: 1240000 }, fmt)).toBe(
      'Queue holds 1,240,000 ready messages.',
    );
    expect(fmt).toHaveBeenCalledWith(1240000);
  });

  it('handles several plurals in one template', () => {
    expect(
      format('en', 'rule.N1.what', { publishChannels: 1, consumeChannels: 2 }),
    ).toBe('Connection has 1 publishing channel and 2 consuming channels.');
  });

  it('throws on a missing parameter and ignores extra ones', () => {
    expect(() =>
      format('en', 'rule.T5.what', { strategy: 'at-most-once' }),
    ).toThrow(/needs parameter strategyLayer/);
    expect(
      format('en', 'rule.T5.what', {
        strategy: 'a',
        strategyLayer: 'x',
        overflow: 'b',
        overflowLayer: 'y',
        extra: 1,
      }),
    ).toBe('Dead-letter strategy is a from x, with overflow b from y.');
  });

  it('throws when a plural parameter is not a number', () => {
    expect(() => format('en', 'rule.DX1.what', { ready: 'many' })).toThrow(
      /must be a number/,
    );
  });

  it('falls back to English with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const partial = { ...vi_ } as Record<string, string>;
    delete partial['rule.T2.title'];
    registerMessages('vi', partial as Messages);
    expect(format('vi', 'rule.T2.title', {})).toBe(
      'Unroutable messages can be dropped',
    );
    expect(warn).toHaveBeenCalledOnce();
  });

  it('throws on an unknown key', () => {
    expect(() => format('en', 'rule.ZZ1.title' as I18nKey, {})).toThrow(
      /unknown i18n key/,
    );
  });

  it('every template renders in both languages with sample parameters', () => {
    for (const [lang, table] of [
      ['en', en],
      ['vi', vi_],
    ] as const) {
      for (const k of Object.keys(table) as I18nKey[]) {
        const params = new Proxy({}, { get: () => 2 }) as Record<
          string,
          number
        >;
        expect(() => format(lang, k, params), `${lang} ${k}`).not.toThrow();
      }
    }
  });
});
