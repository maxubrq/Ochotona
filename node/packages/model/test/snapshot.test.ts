import { describe, expect, it } from 'vitest';
import {
  type Actual,
  DEFAULT_CAPABILITY_TABLE,
  type Instant,
  buildActual,
  checkInvariants,
  loadSnapshot,
  saveSnapshot,
} from '../src';
import { CONN, T2, ctx, rawBroker } from './fixtures';

const opts = (redactHosts: boolean) => ({
  toolVersion: '0.1.0',
  specVersion: '0.4',
  takenAt: T2,
  contextName: 'test',
  url: 'https://monitoring:secret@10.0.0.9:15672',
  redactHosts,
  randomBytes: (n: number) => new Uint8Array(n).fill(7),
});

const strip = (a: Actual) => ({
  ...a,
  meta: { ...a.meta, fromSnapshot: null },
});

describe('ảnh chụp', () => {
  const actual = buildActual(rawBroker(), ctx());

  it('lưu rồi nạp ra đúng Actual gốc', () => {
    const json = saveSnapshot(actual, opts(false));
    const r = loadSnapshot(json, DEFAULT_CAPABILITY_TABLE, 'snap.json');
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.meta.fromSnapshot).toEqual({
      takenAt: T2,
      file: 'snap.json',
    });
    expect(strip(r.value)).toEqual(strip(actual));
    expect(checkInvariants(r.value)).toEqual([]);
  });

  it('không lưu dữ liệu suy ra, không lưu URL', () => {
    const doc = JSON.parse(saveSnapshot(actual, opts(false)));
    expect(doc.schema).toBe('ocho.snapshot/1');
    expect(doc.context.urlHash).toMatch(/^sha256:[0-9a-f]{12}$/);
    const text = JSON.stringify(doc);
    expect(text).not.toContain('secret');
    expect(text).not.toContain('"effective"');
    expect(text).not.toContain('"derived"');
    expect(doc.actual.broker.version).toBeUndefined();
    expect(doc.actual.broker.counters).toBeUndefined();
  });

  it('che host: không còn IPv4, IPv6; quan hệ connection–channel–consumer giữ nguyên', () => {
    const json = saveSnapshot(actual, opts(true));
    expect(json).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(json).not.toMatch(/\b[0-9a-f]{1,4}(:[0-9a-f]{0,4}){2,7}\b/i);
    const r = loadSnapshot(json, DEFAULT_CAPABILITY_TABLE);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const conns =
      r.value.connections.state === 'known' ? r.value.connections.value : [];
    const chans =
      r.value.channels.state === 'known' ? r.value.channels.value : [];
    const cons =
      r.value.consumers.state === 'known' ? r.value.consumers.value : [];
    expect(conns[0].ref.name).toMatch(/^h-[0-9a-f]{12}$/);
    expect(chans.every((c) => c.connection === conns[0].ref.name)).toBe(true);
    expect(chans.map((c) => c.ref.name)).toEqual([
      `${conns[0].ref.name} (1)`,
      `${conns[0].ref.name} (2)`,
    ]);
    expect(cons[0].ref.channel).toBe(chans[1].ref.name);
    expect(cons[0].connection).toBe(conns[0].ref.name);
    expect(json).not.toContain(CONN);
  });

  it('cùng muối thì cùng mã: tất định', () => {
    expect(saveSnapshot(actual, opts(true))).toBe(
      saveSnapshot(actual, opts(true)),
    );
  });

  it('SNAP1: schema lạ', () => {
    const doc = JSON.parse(saveSnapshot(actual, opts(false)));
    for (const schema of ['ocho.snapshot/2', 'other/1', undefined]) {
      const r = loadSnapshot(
        JSON.stringify({ ...doc, schema }),
        DEFAULT_CAPABILITY_TABLE,
      );
      expect(!r.ok && r.error.code).toBe('SNAP1');
    }
  });

  it('SNAP2: sai hình dạng, kèm đường dẫn', () => {
    const doc = JSON.parse(saveSnapshot(actual, opts(false)));
    doc.actual.queues.value[0].durable = 'yes';
    const r = loadSnapshot(JSON.stringify(doc), DEFAULT_CAPABILITY_TABLE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('SNAP2');
      expect(r.error.path).toBe('$.actual.queues.value[0].durable');
    }
    const bad = loadSnapshot('{not json', DEFAULT_CAPABILITY_TABLE);
    expect(!bad.ok && bad.error.code).toBe('SNAP2');
  });

  it('SNAP3: trùng khoá', () => {
    const doc = JSON.parse(saveSnapshot(actual, opts(false)));
    doc.actual.queues.value.push(doc.actual.queues.value[1]);
    const r = loadSnapshot(JSON.stringify(doc), DEFAULT_CAPABILITY_TABLE);
    expect(!r.ok && r.error.code).toBe('SNAP3');
    expect(!r.ok && r.error.violations?.some((v) => v.code === 'INV1')).toBe(
      true,
    );
  });

  it('INV3: observedAt ngoài cửa sổ đọc', () => {
    const late = buildActual(
      rawBroker(),
      ctx({ readFinishedAt: '2026-10-04T01:22:10.500Z' as Instant }),
    );
    expect(checkInvariants(late).some((v) => v.code === 'INV3')).toBe(true);
  });
});
