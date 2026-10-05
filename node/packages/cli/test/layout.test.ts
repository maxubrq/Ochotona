import { describe, expect, it } from 'vitest';
import { colorEnabled, palette } from '../src/render/color';
import {
  ascii,
  fmtDuration,
  fmtInstant,
  hanging,
  joinFit,
  labelBlock,
  labelWidth,
  renderWidth,
  table,
  visibleLength,
  wrap,
} from '../src/render/layout';

describe('renderWidth', () => {
  it('columns of a TTY, otherwise 80, never below 60', () => {
    expect(renderWidth(true, 120)).toBe(120);
    expect(renderWidth(false, 120)).toBe(80);
    expect(renderWidth(true, undefined)).toBe(80);
    expect(renderWidth(true, 40)).toBe(60);
    expect(renderWidth(true, 0)).toBe(80);
  });
});

describe('wrap', () => {
  it('wraps by word and keeps long words whole', () => {
    expect(wrap('aa bb cc', 5)).toEqual(['aa bb', 'cc']);
    expect(wrap('aa bb', 5)).toEqual(['aa bb']);
    expect(wrap('averyveryverylongword x', 5)).toEqual([
      'averyveryverylongword',
      'x',
    ]);
    expect(wrap('a\nb', 80)).toEqual(['a', 'b']);
    expect(wrap('', 10)).toEqual(['']);
    expect(wrap('a   b', 10)).toEqual(['a b']);
    expect(wrap(' a b ', 10)).toEqual(['a b']);
  });
});

describe('labelBlock, hanging', () => {
  it('hangs continuation lines under the value column', () => {
    const lines = labelBlock(
      [
        ['What', ['one two three four five six seven']],
        ['Next', ['a', 'ocho explain T2']],
      ],
      { indent: 2, labelWidth: 6, width: 30 },
    );
    expect(lines).toEqual([
      '  What  one two three four',
      '        five six seven',
      '  Next  a',
      '        ocho explain T2',
    ]);
  });

  it('hanging measures the prefix without color codes', () => {
    const p = palette(true).bold('T2') + ' ';
    expect(visibleLength(p)).toBe(3);
    expect(hanging(p, 'aaa bbb ccc', 23)).toEqual([`${p}aaa bbb ccc`]);
    expect(hanging('>> ', 'aaaa bbbb cccc dddd eeee ffff', 23)).toEqual([
      '>> aaaa bbbb cccc dddd',
      '   eeee ffff',
    ]);
  });

  it('text column never narrower than 20', () => {
    const long = 'aaaa bbbb cccc dddd eeee ffff';
    expect(
      labelBlock([['L', [long]]], { indent: 0, labelWidth: 30, width: 40 })[0],
    ).toBe(`${'L'.padEnd(30)}aaaa bbbb cccc dddd`);
    expect(hanging('x'.repeat(30), long, 40)[0]).toBe(
      `${'x'.repeat(30)}aaaa bbbb cccc dddd`,
    );
  });

  it('joinFit packs parts with " · ", continuation indented two', () => {
    expect(joinFit(['aaaa', 'bbbb', 'cccc'], 11)).toEqual([
      'aaaa · bbbb',
      '  cccc',
    ]);
    expect(joinFit(['aaaa', 'bbbb'], 10)).toEqual(['aaaa', '  bbbb']);
    expect(joinFit(['aaaa', 'bbbb', 'cc'], 80)).toEqual(['aaaa · bbbb · cc']);
    expect(joinFit(['only'], 2)).toEqual(['only']);
    expect(joinFit([palette(true).ok('[ok]'), 'bbbb'], 11)).toEqual([
      `${palette(true).ok('[ok]')} · bbbb`,
    ]);
  });

  it('label width is the longest label plus two', () => {
    expect(labelWidth(['What happened', 'Why'])).toBe(15);
  });
});

describe('formatting', () => {
  it('instants print one unambiguous form', () => {
    expect(fmtInstant('2026-09-12T03:10:59.900Z')).toBe('2026-09-12 03:10 UTC');
    expect(fmtInstant('not a date')).toBe('not a date');
  });

  it('durations', () => {
    expect(fmtDuration(400)).toBe('0.4s');
    expect(fmtDuration(-5)).toBe('0.0s');
    expect(fmtDuration(9_999)).toBe('10.0s');
    expect(fmtDuration(10_000)).toBe('10s');
    expect(fmtDuration(60_000)).toBe('1m 00s');
    expect(fmtDuration(59_400)).toBe('59s');
    expect(fmtDuration(12_000)).toBe('12s');
    expect(fmtDuration(185_000)).toBe('3m 05s');
    expect(fmtDuration(400, 'vi')).toBe('0,4s');
    expect(fmtDuration(12_000, 'vi')).toBe('12s');
  });

  it('ascii replaces arrows of model labels', () => {
    expect(ascii('binding a → queue b ×2')).toBe('binding a -> queue b x2');
  });

  it('a column is as wide as the longest line of its cells', () => {
    expect(table(['K', 'V'], [['a\nlonger', 'x']])).toEqual([
      'K       V',
      'a       x',
      'longer',
    ]);
  });

  it('table pads every column but the last, cells may span lines', () => {
    expect(
      table(
        ['K', 'VALUE', 'N'],
        [
          ['a', 'x\ny', 'note'],
          ['bb', 'z', ''],
        ],
      ),
    ).toEqual(['K   VALUE  N', 'a   x      note', '    y', 'bb  z']);
  });
});

describe('color', () => {
  it('only on a TTY without NO_COLOR, --no-color or TERM=dumb', () => {
    const on = (env: Record<string, string>, isTTY = true, flag = false) =>
      colorEnabled({ isTTY, env, noColorFlag: flag });
    expect(on({})).toBe(true);
    expect(on({}, false)).toBe(false);
    expect(on({}, true, true)).toBe(false);
    expect(on({ NO_COLOR: '1' })).toBe(false);
    expect(on({ NO_COLOR: '' })).toBe(true);
    expect(on({ TERM: 'dumb' })).toBe(false);
  });

  it('palette off returns text unchanged', () => {
    const p = palette(false);
    expect(p.severity('S1', 'x') + p.ok('y') + p.bold('z')).toBe('xyz');
    const c = palette(true);
    expect(c.severity('S1', 'x')).toContain('\u001b[31m');
    expect(c.severity('S2', 'x')).toContain('\u001b[35m');
    expect(c.severity('S3', 'x')).toContain('\u001b[33m');
    expect(c.severity('S4', 'x')).toContain('\u001b[2m');
  });
});
