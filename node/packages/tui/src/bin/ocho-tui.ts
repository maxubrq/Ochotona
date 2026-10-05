// Điểm vào của `ocho-tui`: `--version` không nạp gì ngoài hằng số phiên bản;
// còn lại nạp giao diện lười. Không dùng top-level await: cùng file này được
// esbuild gói thành CommonJS cho binary SEA (scripts/sea.mjs).

import { TUI_VERSION } from '../version';

async function main(argv: string[]): Promise<number> {
  const [{ runTui }, { nodeIO }] = await Promise.all([
    import('../main'),
    import('@ochotona/cli/api'),
  ]);
  return runTui(argv, nodeIO());
}

const argv = process.argv.slice(2);

if (argv.length === 1 && argv[0] === '--version') {
  process.stdout.write(`ocho-tui ${TUI_VERSION}\n`);
} else {
  void main(argv).then(
    (code) => {
      process.stdin.pause();
      process.stdout.write('', () => process.exit(code));
    },
    (e: unknown) => {
      process.stderr.write(`ocho-tui: ${(e as Error)?.stack ?? String(e)}\n`);
      process.exit(5);
    },
  );
}
