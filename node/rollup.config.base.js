// /Users/hungtran/MyApps/ocho/node/rollup.config.js
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import { createRequire } from "module";

// Tự động đọc file package.json của package con đang thực hiện build
const require = createRequire(import.meta.url);
const pkg = require(`${process.cwd()}/package.json`);

export default {
  input: "src/index.ts",
  output: [
    {
      file: pkg.main || "dist/index.js",
      format: "cjs",
      sourcemap: true,
    },
    {
      file: pkg.module || "dist/index.esm.js",
      format: "esm",
      sourcemap: true,
    },
  ],
  external: [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: true,
      declarationDir: "./dist/types",
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext"
      }
    }),
  ],
};
