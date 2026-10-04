import {
  type Actual,
  type Desired,
  type Instant,
  type Result,
  buildDesired,
  diffTopology,
  err,
  normalizeTopology,
  ok,
  stableJson,
  topologyFromActual,
} from '@ochotona/model';
import { SPEC_VERSION, docsUrl } from '@ochotona/spec';
import { readOchoYaml } from '../yaml/read';
import { type WriteOptions, writeOchoYaml } from '../yaml/write';
import { formatChange } from './merge';

export type RoundTripStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface RoundTripError {
  readonly code: 'IM1';
  readonly step: RoundTripStep;
  readonly differences: readonly string[];
}

const MAX_DIFFERENCES = 20;
const SEMANTIC = [
  'spec',
  'broker',
  'families',
  'flows',
  'services',
  'waivers',
] as const;

/**
 * URL schema `ocho-yaml` 0.1, dựng theo khuôn `docs.spec` của gói spec: cùng
 * kho, cùng thẻ phiên bản của công cụ.
 */
export function defaultSchemaUrl(toolVersion: string): string {
  const doc = docsUrl('spec', 'x', { toolVersion, specVersion: SPEC_VERSION });
  const marker = `/blob/v${toolVersion}/`;
  const i = doc.indexOf(marker);
  const root = i < 0 ? doc : doc.slice(0, i + marker.length);
  return `${root}node/packages/spec/schemas/contracts/ocho-yaml-0.1.json`;
}

function defaultOptions(actual: Actual, now: Instant): WriteOptions {
  return {
    header: {
      context: actual.meta.contextName,
      toolVersion: '0.1.0',
      at: now,
      schemaUrl: defaultSchemaUrl('0.1.0'),
    },
    ochoComments: [],
  };
}

function fail(
  step: RoundTripStep,
  differences: readonly string[],
): { ok: false; error: RoundTripError } {
  return err({
    code: 'IM1',
    step,
    differences: differences.slice(0, MAX_DIFFERENCES),
  });
}

/** Dòng khác đầu tiên giữa hai văn bản. */
function firstLineDiff(a: string, b: string): string[] {
  const la = a.split('\n');
  const lb = b.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++)
    if (la[i] !== lb[i])
      return [
        `line ${i + 1}: ${JSON.stringify(la[i] ?? '')} → ${JSON.stringify(lb[i] ?? '')}`,
      ];
  return [];
}

/**
 * Tự kiểm vòng tròn bảy bước; hỏng ở bước nào thì dừng, trả IM1 kèm bước và
 * tối đa 20 khác biệt đầu tiên. `opts` phải là đúng tuỳ chọn dùng để ghi file
 * (header, chú thích, file cũ), để bước 7 so được từng byte.
 */
export function roundTrip(
  desired: Desired,
  actual: Actual,
  now: Instant,
  opts: WriteOptions = defaultOptions(actual, now),
): Result<{ text: string }, RoundTripError> {
  // 1
  const observed = topologyFromActual(actual);
  if (observed.state === 'unknown')
    return fail(1, [`topology unknown: ${observed.reason.kind}`]);
  const a = normalizeTopology(observed.value);

  // 2
  let text: string;
  try {
    text = writeOchoYaml(desired, opts);
  } catch (e) {
    return fail(2, [String(e instanceof Error ? e.message : e)]);
  }

  // 3
  const parsed = readOchoYaml(text);
  if (parsed.diagnostics.length > 0)
    return fail(
      3,
      parsed.diagnostics.map(
        (d) =>
          `${d.pos.line}:${d.pos.column} ${d.code} ${stableJson(d.params)}`,
      ),
    );

  // 4
  const d2 = buildDesired(parsed.value, now);
  if (!d2.ok)
    return fail(
      4,
      d2.error.map(
        (d) => `${d.code} ${d.path.join('.')} ${stableJson(d.params)}`,
      ),
    );

  // 5
  const changes = diffTopology(a, normalizeTopology(d2.value.topology));
  if (changes.length > 0) return fail(5, changes.map(formatChange));

  // 6
  const semantic = (d: Desired) =>
    SEMANTIC.map((k) => stableJson(d[k] as never));
  const s1 = semantic(desired);
  const s2 = semantic(d2.value);
  const diffs = SEMANTIC.filter((_, i) => s1[i] !== s2[i]).map(
    (k) => `${k} differs after YAML`,
  );
  if (diffs.length > 0) return fail(6, diffs);

  // 7
  const again = writeOchoYaml(d2.value, opts);
  if (again !== text) return fail(7, firstLineDiff(text, again));

  return ok({ text });
}
