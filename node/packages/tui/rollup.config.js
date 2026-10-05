// Build riêng cho TUI: thư viện `runTui` và `bin/ocho-tui`, ESM. Năm gói Ocho và
// CLI là phụ thuộc ngoài, nên bản npm nhỏ; binary SEA gói tất cả (scripts/sea.mjs).
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

export default {
  input: { index: 'src/index.ts', 'bin/ocho-tui': 'src/bin/ocho-tui.ts' },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    banner: (chunk) =>
      chunk.name === 'bin/ocho-tui' ? '#!/usr/bin/env node' : '',
  },
  external: (id) =>
    id.startsWith('node:') ||
    Object.keys(pkg.dependencies).some(
      (d) => id === d || id.startsWith(`${d}/`),
    ),
  plugins: [
    resolve({ extensions: ['.ts', '.tsx', '.js', '.json'] }),
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
