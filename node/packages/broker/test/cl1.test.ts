// CL1: chỉ GET, cưỡng chế ở ba tầng, mỗi tầng một test.
import { readFileSync } from 'node:fs';
import { Agent } from 'undici';
import { describe, expect, it } from 'vitest';
import { createReader, type BrokerReader } from '../src/index';
import { getOnly } from '../src/transport';
import { brokerRoutes, startMock } from '../tools/mock-mgmt';

describe('CL1', () => {
  it('tầng kiểu: BrokerReader không có phương thức ghi', () => {
    const r = createReader(
      { url: 'http://h', user: 'u', password: 'p' },
      { toolVersion: 't' },
    );
    if (!r.ok) throw new Error();
    const reader: BrokerReader = r.value;
    // Test biên dịch âm: `pnpm typecheck` hỏng nếu một trong các dòng dưới biên dịch được.
    // @ts-expect-error không có write
    expect(reader.write).toBeUndefined();
    // @ts-expect-error không có put
    expect(reader.put).toBeUndefined();
    // @ts-expect-error không có delete
    expect(reader.delete).toBeUndefined();
    expect(Object.keys(reader).sort()).toEqual([
      'close',
      'identify',
      'read',
      'stats',
    ]);
  });

  it('tầng transport: method viết cứng, không nhận tham số method', () => {
    const src = readFileSync(
      new URL('../src/transport.ts', import.meta.url),
      'utf8',
    );
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const methods = [...code.matchAll(/method\s*:\s*([^,\n}]+)/g)].map((m) =>
      m[1].trim(),
    );
    expect(methods).toEqual(["'GET'"]);
    expect(code).not.toMatch(/\bmethod\s*[?]?\s*:\s*(string|Dispatcher)/);
    // Không module nào khác gọi undici trực tiếp.
    for (const f of [
      'reader',
      'fetch',
      'paginate',
      'prometheus',
      'sources',
      'target',
    ]) {
      const s = readFileSync(
        new URL(`../src/${f}.ts`, import.meta.url),
        'utf8',
      );
      expect(s, f).not.toMatch(/^import\s+(?!type\b)[^;]*from 'undici'/m);
      expect(s, f).not.toMatch(/\bfetch\(|\brequest\(/);
    }
  });

  it('tầng dispatcher: POST bị chặn trước khi rời máy', async () => {
    const m = await startMock(brokerRoutes());
    const agent = new Agent();
    const d = agent.compose(getOnly);
    try {
      for (const method of ['POST', 'PUT', 'DELETE', 'PATCH'] as const) {
        await expect(
          d.request({
            origin: m.url,
            path: '/api/queues/%2F/x',
            method,
            body: '{}',
          }),
        ).rejects.toThrow('CL1');
      }
      expect(m.requests).toHaveLength(0);
      const ok = await d.request({
        origin: m.url,
        path: '/api/overview',
        method: 'GET',
      });
      await ok.body.dump();
      expect(m.requests).toHaveLength(1);
    } finally {
      await agent.close();
      await m.close();
    }
  });
});
