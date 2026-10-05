// Binary SEA cho nền tảng đang chạy, như CLI (packages/cli/scripts/sea.mjs):
// esbuild gói src/bin/ocho-tui.ts thành một file CommonJS, rồi Node SEA nhúng
// nó vào bản sao của node đang chạy. Ra dist/sea/ocho-tui (.exe trên Windows).
//
// Khác CLI ở hai chỗ, vì Ink:
// - `yoga-layout` thay bằng scripts/yoga-shim.mjs (bản gốc có top-level await),
//   và điểm vào đợi WASM nạp xong rồi mới nạp giao diện;
// - các nhánh chỉ dành cho React DevTools của Ink bị bỏ (cũng có top-level await).
//
//   pnpm build:sea
//   dist/sea/ocho-tui --version

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const out = 'dist/sea';
const exe = join(
  out,
  process.platform === 'win32' ? 'ocho-tui.exe' : 'ocho-tui',
);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

/** Bỏ khối `if (process.env['DEV'] === 'true') { … }` cấp cao nhất của Ink. */
const stripDevBlocks = (src) =>
  src.replace(/^if \(process\.env\['DEV'\] === 'true'\) \{[\s\S]*?^\}\n/gm, '');

const inkForSea = {
  name: 'ink-for-sea',
  setup(b) {
    b.onResolve({ filter: /^yoga-layout$/ }, () => ({
      path: resolve('scripts/yoga-shim.mjs'),
    }));
    b.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core',
      namespace: 'empty',
    }));
    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({
      contents: 'export default {};',
    }));
    b.onLoad({ filter: /[\\/]ink[\\/]build[\\/]reconciler\.js$/ }, (a) => {
      const src = readFileSync(a.path, 'utf8');
      const stripped = stripDevBlocks(src);
      if (/^\s*await /m.test(stripped.replace(/^ {4,}.*$/gm, '')))
        throw new Error(`ink reconciler still has top-level await: ${a.path}`);
      return { contents: stripped, loader: 'js' };
    });
  },
};

await build({
  stdin: {
    contents:
      "require('./scripts/yoga-shim.mjs').ready().then(() => require('./src/bin/ocho-tui.ts'));",
    resolveDir: process.cwd(),
    sourcefile: 'sea-entry.cjs',
    loader: 'js',
  },
  outfile: join(out, 'ocho-tui.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  // `import '@ochotona/spec'` trần trong dist của CLI: vô hại, gói spec tự khai sideEffects.
  logOverride: { 'ignored-bare-import': 'silent' },
  jsx: 'automatic',
  define: { 'process.env.DEV': '"false"' },
  plugins: [inkForSea],
});

writeFileSync(
  join(out, 'sea-config.json'),
  JSON.stringify({
    main: join(out, 'ocho-tui.cjs'),
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
  `${exe}: ocho-tui for ${process.platform}-${process.arch}, Node ${process.version}`,
);
