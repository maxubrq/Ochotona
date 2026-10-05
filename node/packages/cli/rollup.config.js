// Build riêng cho CLI: hai entry (thư viện `run` và `bin/ocho`), ESM, tách
// chunk để `bin` chỉ nạp mã của lệnh đang chạy (khởi động lười).
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

export default {
  input: { index: 'src/index.ts', 'bin/ocho': 'src/bin/ocho.ts' },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    banner: (chunk) =>
      chunk.name === 'bin/ocho' ? '#!/usr/bin/env node' : '',
  },
  external: (id) =>
    id.startsWith('node:') ||
    Object.keys(pkg.dependencies).some((d) => id === d || id.startsWith(`${d}/`)),
  plugins: [
    resolve({ extensions: ['.ts', '.js', '.json'] }),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: './dist/types',
      compilerOptions: { module: 'preserve', moduleResolution: 'Bundler' },
    }),
    terser({ format: { comments: false } }),
  ],
};
