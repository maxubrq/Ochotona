// `@ochotona/cli/api`: phần bên trong của CLI cho công cụ cần nhiều hơn
// `run(argv, io)`, như TUI (`@ochotona/tui`): phiên, từng bước của lệnh, các khối
// render. Dữ liệu và chữ đều đi qua cùng đường với `ocho`, nên hai giao diện
// không bao giờ nói khác nhau về một broker.

export { run, makeSession, loadSpecText } from './run';
export type { Session } from './session';
export type { IO, Fs, Exec, ExecResult, In, Out } from './io';
export { nodeIO, nodeFs, nodeExec } from './io-node';
export { TOOL_VERSION } from './version';

export {
  parse,
  str,
  bool,
  list,
  closest,
  COMMANDS,
  COMMAND_FLAGS,
  GLOBAL_FLAGS,
} from './args';
export type { Parsed, FlagValue } from './args';

export { CliError, Interrupted, InternalError, usage, diag } from './errors';
export type { ExitCode, Msg, DataState } from './errors';

export {
  CONTEXT_NAME,
  EMPTY_CONTEXTS,
  contextsPath,
  readContexts,
  writeContexts,
} from './contexts';
export type { ContextEntry, ContextFile } from './contexts';
export { pickTarget, shortHost } from './target';
export type { TargetSpec } from './target';
export { limitsOf } from './connect';
export { doctorExit, atOrAbove } from './exit';

export { diagnose, saveSnapshotFile } from './commands/doctor';
export type { DiagnoseHooks } from './commands/doctor';
export { explain } from './commands/explain';
export { context } from './commands/context';
export { help } from './commands/help';
export { prepareImport, importResult, writeImport } from './commands/import';
export type { PreparedImport } from './commands/import';

export type { DoctorOutcome, Summary } from './report';
export { summarize, displayResult, invisibleBlindSpots } from './report';

export { t, translator, fmtNumber, resolveLang } from './i18n';
export type { Lang, Params, Translate } from './i18n';
export {
  msgText,
  dataText,
  renderError,
  renderInternal,
  renderWarning,
} from './render/errors';
export { buildReport, writeJson } from './render/json';
export { palette, colorEnabled } from './render/color';
export type { Palette } from './render/color';
export {
  ascii,
  fmtDuration,
  fmtInstant,
  hanging,
  joinFit,
  labelBlock,
  labelWidth,
  visibleLength,
  wrap,
} from './render/layout';
export {
  blindSpotLine,
  failBlock,
  groupFails,
  headLines,
  inventoryLine,
  renderBody,
  summaryLine,
} from './render/text';
