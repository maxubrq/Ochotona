// @ochotona/cli: lệnh `ocho`. Lõi là `run(argv, io)` trả exit code; `bin/ocho`
// nối io thật. Xuất ra để nhúng CLI vào công cụ khác và để test đầu-cuối.

export { run } from './run';
export type { IO, Fs, Exec, ExecResult, In, Out } from './io';
export { nodeIO, nodeFs, nodeExec } from './io-node';
export { TOOL_VERSION } from './version';
export { doctorExit, atOrAbove } from './exit';
export { resolveLang } from './i18n';
export { contextsPath, parseContexts, serializeContexts } from './contexts';
export type { ContextEntry, ContextFile } from './contexts';
export { CliError } from './errors';
export type { ExitCode } from './errors';
