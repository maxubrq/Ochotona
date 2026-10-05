// Ingest trên bản ghi thô từ broker thật (`fixtures/raw`, do SUT/record.sh ghi).
// Không có bản ghi thì bỏ qua.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type Instant,
  type RawResponses,
  type RawResult,
  DEFAULT_CAPABILITY_TABLE,
  ENDPOINT_IDS,
  buildActual,
  checkInvariants,
  loadSnapshot,
  saveSnapshot,
} from '../src';

const ROOT = new URL('../../../fixtures/raw/', import.meta.url).pathname;

function recordings(): string[] {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT).flatMap((label) =>
    readdirSync(join(ROOT, label))
      .filter((v) => existsSync(join(ROOT, label, v, 'manifest.json')))
      .map((v) => join(label, v)),
  );
}

function load(rec: string): { raw: RawResponses; variant: string } {
  const dir = join(ROOT, rec);
  const json = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const raw = {} as Record<string, RawResult<unknown>>;
  for (const id of ENDPOINT_IDS) {
    const r = json(`${id}.json`) as RawResult<unknown>;
    // record-raw tách văn bản Prometheus ra prometheus.txt.
    if (id === 'prometheus' && r.status === 'ok') {
      const text = readFileSync(join(dir, 'prometheus.txt'), 'utf8');
      raw[id] = { ...r, pages: r.pages.map((p) => ({ ...p, body: text })) };
    } else raw[id] = r;
  }
  return {
    raw: raw as unknown as RawResponses,
    variant: json('manifest.json').variant,
  };
}

function window(raw: RawResponses): { start: Instant; end: Instant } {
  const times = Object.values(raw).flatMap((r: RawResult<unknown>) =>
    r.status === 'ok' ? r.pages.map((p) => p.observedAt) : [],
  );
  times.sort();
  return { start: times[0], end: times[times.length - 1] };
}

const recs = recordings();

describe.skipIf(recs.length === 0)('buildActual trên bản ghi thật', () => {
  for (const rec of recs) {
    it(rec, () => {
      const { raw, variant } = load(rec);
      const { start, end } = window(raw);
      const a = buildActual(raw, {
        contextName: 'fixture',
        readStartedAt: start,
        readFinishedAt: end,
        scope: { vhosts: 'all' },
        caps: DEFAULT_CAPABILITY_TABLE,
      });
      expect(checkInvariants(a)).toEqual([]);
      // Che host đổi tên connection, channel: ảnh chụp vẫn phải nạp lại được.
      const snap = saveSnapshot(a, {
        toolVersion: '0.1.0',
        specVersion: '0.4.0',
        takenAt: end,
        contextName: 'fixture',
        url: 'http://h',
        redactHosts: true,
        randomBytes: (n) => new Uint8Array(n).fill(7),
      });
      const back = loadSnapshot(snap, DEFAULT_CAPABILITY_TABLE);
      expect(back.ok ? [] : back.error).toEqual([]);
      expect(a.queues.state).toBe('known');
      expect(a.broker.version.state).toBe('known');

      const statsOff = variant === 'nostats' || variant === 'listonly';
      const promOff = variant === 'noprom' || variant === 'listonly';
      expect(a.meta.sources['http.stats']).toBe(
        statsOff ? 'unavailable' : 'ok',
      );
      expect(a.meta.sources.prometheus).toBe(promOff ? 'unavailable' : 'ok');
      // Thống kê tắt: /api/channels, /api/consumers trả 400 (4.3: channels trả
      // 200 rỗng), /api/connections trên 4.3 cũng trả 200 rỗng. Mọi trường hợp
      // phải thành unknown: source_unavailable, không bao giờ thành [].
      const is43 = rec.startsWith('rabbitmq-4.3/');
      if (statsOff) {
        for (const l of [a.channels, a.consumers]) {
          expect(l).toMatchObject({
            state: 'unknown',
            reason: { kind: 'source_unavailable' },
          });
        }
        if (is43) {
          expect(a.connections).toMatchObject({
            state: 'unknown',
            reason: { kind: 'source_unavailable' },
          });
        } else {
          expect(a.connections.state).toBe('known');
        }
      } else {
        expect(a.channels.state).toBe('known');
        expect(a.connections.state).toBe('known');
      }
      // Bộ đếm unroutable: có thống kê thì từ http.stats; chỉ có Prometheus
      // (nostats) thì từ Prometheus, completeSince theo uptime Prometheus.
      const dropped = a.broker.counters.unroutableDropped;
      if (variant === 'listonly') {
        expect(dropped.state).toBe('unknown');
      } else {
        expect(dropped.state).toBe('known');
        expect(dropped.state === 'known' && dropped.prov.source).toBe(
          statsOff ? 'prometheus' : 'http.stats',
        );
      }
    });
  }
});
