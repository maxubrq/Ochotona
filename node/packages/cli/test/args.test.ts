import { describe, expect, it } from 'vitest';
import {
  CONTEXT_SUBCOMMANDS,
  bool,
  closest,
  enumFlag,
  intFlag,
  levenshtein,
  list,
  parse,
  str,
} from '../src/args';
import { CliError } from '../src/errors';

const fails = (argv: string[]) => {
  try {
    parse(argv);
  } catch (e) {
    expect(e).toBeInstanceOf(CliError);
    return e as CliError;
  }
  throw new Error('expected a CliError');
};

describe('parse', () => {
  it('finds the command whether flags come before or after it', () => {
    const a = parse(['--context', 'prod', 'doctor', '--json']);
    const b = parse(['doctor', '--json', '--context', 'prod']);
    for (const p of [a, b]) {
      expect(p.command).toBe('doctor');
      expect(str(p, 'context')).toBe('prod');
      expect(bool(p, 'json')).toBe(true);
    }
  });

  it('collects repeated --vhost and keeps positionals after the command', () => {
    const p = parse(['doctor', '--vhost', 'a', '--vhost=b']);
    expect(list(p, 'vhost')).toEqual(['a', 'b']);
    const e = parse(['explain', 'queue', 'my', 'queue', '--vhost', 'x']);
    expect(e.positionals).toEqual(['queue', 'my', 'queue']);
    expect(str(e, 'vhost')).toBe('x');
  });

  it('no command: version and help flags only', () => {
    expect(parse([]).command).toBeNull();
    expect(bool(parse(['--version']), 'version')).toBe(true);
    expect(bool(parse(['-h']), 'help')).toBe(true);
  });

  it('unknown flag: suggests the closest flag within distance 2', () => {
    const e = fails(['doctor', '--vhosts', 'a']);
    expect(e.exitCode).toBe(4);
    expect(e.msg).toEqual({
      key: 'args.unknown_flag_near',
      params: { flag: 'vhosts', near: 'vhost' },
    });
    expect(fails(['doctor', '--zzzzzzz']).msg.key).toBe('args.unknown_flag');
  });

  it('a flag of another command names the command that takes it', () => {
    const e = fails(['import', '--fail-on', 'S1']);
    expect(e.msg).toEqual({
      key: 'args.flag_of_other_command',
      params: { flag: 'fail-on', command: 'import', owner: 'doctor' },
    });
  });

  it('missing value and value on a boolean flag', () => {
    expect(fails(['doctor', '--flow']).msg.key).toBe('args.flag_needs_value');
    expect(fails(['doctor', '--json=yes']).msg.key).toBe(
      'args.flag_takes_no_value',
    );
  });

  it('unknown command, with and without a suggestion', () => {
    expect(fails(['doctr']).msg).toEqual({
      key: 'args.unknown_command_near',
      params: { command: 'doctr', near: 'doctor' },
    });
    expect(fails(['frobnicate']).msg.key).toBe('args.unknown_command');
  });
});

describe('levenshtein, closest', () => {
  it('computes edit distance', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('vhost', 'vhosts')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });

  it('keeps only candidates within distance 2, first on a tie', () => {
    expect(closest('jsn', ['json', 'lang'])).toBe('json');
    expect(closest('xyzzy', ['json', 'lang'])).toBeNull();
    expect(closest('ab', ['ac', 'ad'])).toBe('ac');
    expect(closest('abcd', ['abxy'])).toBe('abxy');
    expect(closest('abcd', ['axyz'])).toBeNull();
  });
});

describe('intFlag, enumFlag', () => {
  it('accepts whole numbers in range only', () => {
    expect(
      intFlag(parse(['doctor', '--max-rps', '20']), 'max-rps', 1, 20),
    ).toBe(20);
    expect(intFlag(parse(['doctor', '--max-rps', '1']), 'max-rps', 1, 20)).toBe(
      1,
    );
    expect(intFlag(parse(['doctor']), 'max-rps', 1, 20)).toBeUndefined();
    for (const v of ['0', '21', '2.5', 'x', '-1'])
      expect(() =>
        intFlag(parse(['doctor', '--max-rps', v]), 'max-rps', 1, 20),
      ).toThrow(CliError);
  });

  it('accepts one of the allowed values', () => {
    const p = parse(['doctor', '--fail-on', 'S2']);
    expect(enumFlag(p, 'fail-on', ['S1', 'S2', 'S3'])).toBe('S2');
    expect(() =>
      enumFlag(parse(['doctor', '--fail-on', 'S4']), 'fail-on', [
        'S1',
        'S2',
        'S3',
      ]),
    ).toThrow(CliError);
  });
});

describe('grammar details', () => {
  it('lists the context subcommands and the flags of import and context', () => {
    expect(CONTEXT_SUBCOMMANDS).toEqual([
      'add',
      'use',
      'list',
      'show',
      'remove',
    ]);
    expect(
      str(parse(['import', '--from', 'd.json', '--out', 'o.yaml']), 'from'),
    ).toBe('d.json');
    expect(
      bool(parse(['import', '--non-interactive']), 'non-interactive'),
    ).toBe(true);
    const c = parse([
      'context',
      'add',
      'p',
      '--password-command',
      'op read',
      '--no-verify',
      '--yes',
    ]);
    expect([
      str(c, 'password-command'),
      bool(c, 'no-verify'),
      bool(c, 'yes'),
    ]).toEqual(['op read', true, true]);
    expect(c.positionals).toEqual(['add', 'p']);
  });

  it('a flag value is not taken for the command', () => {
    expect(parse(['--context', 'doctor']).command).toBeNull();
    expect(parse(['--json']).positionals).toEqual([]);
    expect(parse(['--context', 'x', 'version']).command).toBe('version');
  });

  it('error parameters', () => {
    expect(fails(['frobnicate']).msg).toEqual({
      key: 'args.unknown_command',
      params: { command: 'frobnicate' },
    });
    expect(fails(['doctor', '--zzzzzzz']).msg).toEqual({
      key: 'args.unknown_flag',
      params: { flag: 'zzzzzzz' },
    });
    expect(fails(['doctor', '--vhosts=a']).msg.params).toEqual({
      flag: 'vhosts',
      near: 'vhost',
    });
    expect(fails(['doctor', '-x']).msg.params?.flag).toBe('x');
    expect(fails(['doctor', '--flow']).msg).toEqual({
      key: 'args.flag_needs_value',
      params: { flag: 'flow' },
    });
    expect(fails(['doctor', '--json=yes']).msg).toEqual({
      key: 'args.flag_takes_no_value',
      params: { flag: 'json' },
    });
    expect(fails(['--context']).msg.params).toEqual({ flag: 'context' });
  });

  it('str takes the last of a repeated flag; list of a single value', () => {
    const p = parse(['doctor', '--vhost', 'a', '--vhost', 'b', '--flow', 'f']);
    expect(str(p, 'vhost')).toBe('b');
    expect(str(p, 'json')).toBeUndefined();
    expect(str(parse(['doctor', '--json']), 'json')).toBeUndefined();
    expect(list(p, 'flow')).toEqual(['f']);
    expect(list(p, 'from')).toEqual([]);
    expect(list(parse(['doctor', '--json']), 'json')).toEqual([]);
  });

  it('range and choice errors carry their parameters', () => {
    const range = (() => {
      try {
        intFlag(parse(['doctor', '--max-rps', '30']), 'max-rps', 1, 20);
      } catch (e) {
        return e as CliError;
      }
    })();
    expect(range?.msg).toEqual({
      key: 'args.out_of_range',
      params: { flag: 'max-rps', value: '30', min: 1, max: 20 },
    });
    const choice = (() => {
      try {
        enumFlag(parse(['doctor', '--fail-on', 'S9']), 'fail-on', ['S1', 'S2']);
      } catch (e) {
        return e as CliError;
      }
    })();
    expect(choice?.msg).toEqual({
      key: 'args.not_one_of',
      params: { flag: 'fail-on', value: 'S9', allowed: 'S1, S2' },
    });
    expect(enumFlag(parse(['doctor']), 'fail-on', ['S1'])).toBeUndefined();
  });
});
