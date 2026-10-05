// Ngân sách khởi động (spec CLI, GC30): `ocho --version` ≤ 100 ms p95 trên máy
// CI. Chạy tệp thực thi N lần sau vài lần làm nóng, in median và p95.
//
//   node scripts/startup.mjs dist/sea/ocho [--budget 100] [--runs 30] [--report-only]

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    budget: { type: 'string', default: '100' },
    runs: { type: 'string', default: '30' },
    'report-only': { type: 'boolean', default: false },
  },
});
const bin = positionals[0];
if (!bin) throw new Error('usage: startup.mjs <binary>');
const runs = Number(values.runs);
const budget = Number(values.budget);

const once = () => {
  const t = process.hrtime.bigint();
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  if (r.status !== 0)
    throw new Error(`${bin} --version exited ${r.status}: ${r.stderr}`);
  return ms;
};
for (let i = 0; i < 3; i++) once(); // trang của file vào cache, quét của antivirus
const ms = Array.from({ length: runs }, once).sort((a, b) => a - b);
const median = ms[Math.floor(runs / 2)];
const p95 = ms[Math.ceil(runs * 0.95) - 1];
const line = `ocho --version on ${process.platform}-${process.arch}: median ${median.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms (budget ${budget} ms, ${runs} runs)`;
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${line}\n`);
if (p95 > budget && !values['report-only']) {
  console.error(`p95 ${p95.toFixed(0)} ms is over the ${budget} ms budget`);
  process.exit(1);
}
