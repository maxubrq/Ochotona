// Điểm vào của lệnh `ocho`: chỉ nối `io` thật vào `run`. `--version` không nạp
// gì ngoài hằng số phiên bản (ngân sách ≤ 100 ms); lệnh khác nạp `run` lười.
// Không dùng top-level await: cùng file này được esbuild gói thành CommonJS
// cho binary SEA (scripts/sea.mjs).

import { TOOL_VERSION } from '../version';

async function main(argv: string[]): Promise<number> {
  const [{ run }, { nodeIO }] = await Promise.all([
    import('../run'),
    import('../io-node'),
  ]);
  return run(argv, nodeIO());
}

const argv = process.argv.slice(2);

if (argv.length === 1 && argv[0] === '--version') {
  process.stdout.write(`ocho ${TOOL_VERSION}\n`);
} else {
  void main(argv).then((code) => {
    process.stdin.pause();
    process.stdout.write('', () => process.exit(code));
  });
}
