// `ocho help [lệnh]` và `ocho <lệnh> --help`: một dòng mục đích, cú pháp, cờ,
// ba ví dụ, và với lệnh đọc, dòng cuối cố định (A5, CL1).

import { COMMAND_FLAGS, COMMANDS, GLOBAL_FLAGS, closest } from '../args';
import { type ExitCode, usage } from '../errors';
import { hanging } from '../render/layout';
import type { Session } from '../session';

/** Lệnh đọc broker: in dòng "Read-only" ở cuối trợ giúp. */
const READ_COMMANDS = new Set(['doctor', 'import', 'explain', 'context']);
const DOCUMENTED = [
  'doctor',
  'import',
  'explain',
  'context',
  'version',
  'help',
];

function flagLines(
  s: Session,
  scope: string,
  names: readonly string[],
): string[] {
  const width = Math.max(...names.map((n) => n.length)) + 4;
  return names.flatMap((n) =>
    hanging(`  --${n.padEnd(width)}`, s.t(`help.flag.${scope}.${n}`), s.width),
  );
}

function overview(s: Session): string[] {
  const w = Math.max(...DOCUMENTED.map((c) => c.length)) + 2;
  return [
    s.t('help.ocho.purpose'),
    '',
    `${s.t('help.usage')}  ocho [${s.t('help.global_flags')}] <${s.t('help.command')}> [${s.t('help.args')}]`,
    '',
    `${s.t('help.commands')}:`,
    ...DOCUMENTED.map((c) => `  ${c.padEnd(w)}${s.t(`help.${c}.purpose`)}`),
    '',
    `${s.t('help.global')}:`,
    ...flagLines(s, 'global', Object.keys(GLOBAL_FLAGS)),
    '',
    s.t('help.more'),
  ];
}

function commandHelp(s: Session, cmd: string): string[] {
  const own = Object.keys(COMMAND_FLAGS[cmd]);
  const lines = [
    s.t(`help.${cmd}.purpose`),
    '',
    `${s.t('help.usage')}  ${s.t(`help.${cmd}.usage`)}`,
  ];
  if (own.length > 0)
    lines.push('', `${s.t('help.flags')}:`, ...flagLines(s, cmd, own));
  lines.push(
    '',
    `${s.t('help.examples')}:`,
    ...[1, 2, 3].map((i) => `  ${s.t(`help.${cmd}.example${i}`)}`),
  );
  if (READ_COMMANDS.has(cmd)) lines.push('', s.t('help.read_only'));
  return lines;
}

/** In trợ giúp ra stdout. `cmd` vắng thì in tổng quan. */
export function help(s: Session, cmd?: string): ExitCode {
  if (cmd !== undefined && !COMMANDS.includes(cmd)) {
    const near = closest(cmd, COMMANDS);
    throw near
      ? usage('args.unknown_command_near', { command: cmd, near })
      : usage('args.unknown_command', { command: cmd });
  }
  const lines = cmd === undefined ? overview(s) : commandHelp(s, cmd);
  s.io.stdout.write(lines.map((l) => `${l}\n`).join(''));
  return 0;
}
