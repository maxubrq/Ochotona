// Binary SEA cho nền tảng đang chạy: esbuild gói src/bin/ocho.ts thành một file
// CommonJS (import động thành khởi tạo lười, giữ GC30), rồi Node SEA nhúng nó
// vào một bản sao của node đang chạy. Ra dist/sea/ocho (ocho.exe trên Windows).
//
//   pnpm build:sea
//   dist/sea/ocho --version

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

const out = 'dist/sea';
const exe = join(out, process.platform === 'win32' ? 'ocho.exe' : 'ocho');
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: ['src/bin/ocho.ts'],
  outfile: join(out, 'ocho.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
});

writeFileSync(
  join(out, 'sea-config.json'),
  JSON.stringify({
    main: join(out, 'ocho.cjs'),
    output: join(out, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
    useCodeCache: true,
  }),
);
run(process.execPath, [
  '--experimental-sea-config',
  join(out, 'sea-config.json'),
]);

copyFileSync(process.execPath, exe);
if (process.platform === 'darwin') run('codesign', ['--remove-signature', exe]);
run(process.execPath, [
  'node_modules/postject/dist/cli.js',
  exe,
  'NODE_SEA_BLOB',
  join(out, 'sea-prep.blob'),
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ...(process.platform === 'darwin'
    ? ['--macho-segment-name', 'NODE_SEA']
    : []),
]);
if (process.platform === 'darwin') run('codesign', ['--sign', '-', exe]);
console.log(
  `${exe}: ocho for ${process.platform}-${process.arch}, Node ${process.version}`,
);
