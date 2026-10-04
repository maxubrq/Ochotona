// Nạp bản ghi thô từ broker thật (`fixtures/raw`, do SUT/record.sh ghi).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Instant,
  type RawResponses,
  type RawResult,
  ENDPOINT_IDS,
} from '@ochotona/model';

export const RAW_ROOT = new URL('../../../fixtures/raw/', import.meta.url)
  .pathname;

export function recordings(): string[] {
  if (!existsSync(RAW_ROOT)) return [];
  return readdirSync(RAW_ROOT).flatMap((label) =>
    readdirSync(join(RAW_ROOT, label))
      .filter((v) => existsSync(join(RAW_ROOT, label, v, 'manifest.json')))
      .map((v) => join(label, v)),
  );
}

export function loadRecording(rec: string): {
  raw: RawResponses;
  variant: string;
  start: Instant;
  end: Instant;
} {
  const dir = join(RAW_ROOT, rec);
  const json = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const raw = {} as Record<string, RawResult<unknown>>;
  for (const id of ENDPOINT_IDS) {
    const r = json(`${id}.json`) as RawResult<unknown>;
    if (id === 'prometheus' && r.status === 'ok') {
      const text = readFileSync(join(dir, 'prometheus.txt'), 'utf8');
      raw[id] = { ...r, pages: r.pages.map((p) => ({ ...p, body: text })) };
    } else raw[id] = r;
  }
  const times = Object.values(raw)
    .flatMap((r) => (r.status === 'ok' ? r.pages.map((p) => p.observedAt) : []))
    .sort();
  return {
    raw: raw as unknown as RawResponses,
    variant: json('manifest.json').variant,
    start: times[0],
    end: times[times.length - 1],
  };
}
