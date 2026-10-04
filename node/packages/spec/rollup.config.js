// Ba entry: gói chính và hai bảng văn bản. Phần dùng chung (format.ts) tách
// thành chunk để mọi entry chia một registry ngôn ngữ.
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const input = {
  index: 'src/index.ts',
  'i18n/en': 'src/i18n/en.ts',
  'i18n/vi': 'src/i18n/vi.ts',
};

export default {
  input,
  output: [
    {
      dir: 'dist',
      format: 'cjs',
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name]-[hash].js',
      exports: 'named',
      sourcemap: true,
    },
    {
      dir: 'dist',
      format: 'esm',
      entryFileNames: '[name].esm.js',
      chunkFileNames: 'chunks/[name]-[hash].esm.js',
      sourcemap: true,
    },
  ],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: './dist/types',
      compilerOptions: { module: 'preserve', moduleResolution: 'Bundler' },
    }),
    terser({ output: { comments: false } }),
  ],
};
