// Kiểm bản build: không import gì ngoài chunk nội bộ, chạy được ở runtime
// không có `node:`, và giữ trong ngân sách kích thước. Chạy sau `pnpm build`.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const DIST = join(import.meta.dirname, '..', 'dist');
const built = existsSync(join(DIST, 'index.js'));

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

/** Nạp bản CJS trong một context vm trống; `require` chỉ mở được file trong dist. */
function loadIsolated(entries: string[]): Record<string, any> {
  const context = vm.createContext({});
  const cache = new Map<string, any>();
  const load = (file: string): any => {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} as any };
    cache.set(file, module);
    const code = readFileSync(file, 'utf8');
    const fn = vm.runInContext(
      `(function (exports, require, module) {${code}\n})`,
      context,
    );
    const req = (spec: string) => {
      if (!spec.startsWith('.')) throw new Error(`dist requires ${spec}`);
      const target = resolve(
        dirname(file),
        spec.endsWith('.js') ? spec : `${spec}.js`,
      );
      if (relative(DIST, target).startsWith('..'))
        throw new Error(`dist escapes: ${spec}`);
      return load(target);
    };
    fn(module.exports, req, module);
    return module.exports;
  };
  return Object.fromEntries(entries.map((e) => [e, load(join(DIST, e))]));
}

describe.skipIf(!built)('dist', () => {
  it('imports nothing but its own chunks', () => {
    for (const f of files(DIST).filter((f) => /\.js$/.test(f))) {
      const code = readFileSync(f, 'utf8');
      const specs = [
        ...code.matchAll(/require\(["']([^"']+)["']\)/g),
        ...code.matchAll(/\bfrom\s*["']([^"']+)["']/g),
        ...code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
        // Câu lệnh import của terser không có khoảng trắng sau `;`; nhờ vậy
        // không khớp nhầm câu "…; import '@ochotona/spec/i18n/…'" trong thông báo lỗi.
        ...code.matchAll(/(?:^|;)import\s*["']([^"']+)["']/gm),
      ].map((m) => m[1]);
      for (const s of specs)
        expect(s, `${relative(DIST, f)} imports ${s}`).toMatch(/^\.\.?\//);
      expect(code, relative(DIST, f)).not.toMatch(
        /\bprocess\.|\bBuffer\b|node:/,
      );
    }
  });

  it('runs without node: modules', () => {
    const m = loadIsolated(['index.js', 'i18n/en.js', 'i18n/vi.js']);
    const spec = m['index.js'];
    expect(spec.rule('T2').severities).toEqual(['S1', 'S3']);
    expect(spec.capabilitiesFor(spec.parseVersion('4.3.0-rc.1')).status).toBe(
      'untested',
    );
    expect(spec.format('en', 'rule.T2.what', { count: 1, since: 'x' })).toBe(
      '1 unroutable message was dropped since x.',
    );
    expect(spec.format('vi', 'rule.T5.title', {})).toBe(
      'Dead-letter có thể làm mất message',
    );
    expect(m['i18n/vi.js'].default['rule.T2.title']).toBe(
      'Message không định tuyến được đang bị bỏ',
    );
  });

  it('stays within the size budget', () => {
    const size = (f: string) => statSync(join(DIST, f)).size;
    const chunks = readdirSync(join(DIST, 'chunks')).filter((f) =>
      f.endsWith('.esm.js'),
    );
    const core =
      size('index.esm.js') +
      chunks.reduce((n, f) => n + size(`chunks/${f}`), 0);
    expect(core).toBeLessThanOrEqual(150 * 1024);
    expect(size('i18n/en.esm.js')).toBeLessThanOrEqual(60 * 1024);
    expect(size('i18n/vi.esm.js')).toBeLessThanOrEqual(60 * 1024);
  });
});
