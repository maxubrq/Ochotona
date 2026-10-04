// Hàm tra cứu thuần trên dữ liệu sinh ra. Không hàm nào ở đây quyết định kết
// quả của luật: hàm cần `Actual` là hàm sai chỗ.
import { BLIND_SPOTS } from './gen/blind-spots';
import { CAPABILITY_RANGES } from './gen/capabilities';
import { CODES } from './gen/codes';
import { EXCLUSIONS } from './gen/exclusions';
import { KEYS } from './gen/keys';
import { type RuleCode, RULES } from './gen/rules';
import { SCHEMAS } from './gen/schemas';
import {
  BROKER_SUPPORT,
  DOCS_TEMPLATES,
  EXIT_CODES,
  SEVERITIES,
} from './gen/spec';
import type {
  ArgValue,
  BlindSpot,
  CapabilityLookup,
  CapabilityRange,
  CodeEntry,
  Exclusion,
  KeyDef,
  QueueType,
  RuleMeta,
  SeverityDef,
  Version,
} from './types';
import { compareRelease, parseVersion } from './version';

// ------------------------------------------------------------------- luật

export const rules: readonly RuleMeta[] = RULES;
const ruleMap = new Map<string, RuleMeta>(rules.map((r) => [r.code, r]));

/**
 * Metadata của một luật. Ném lỗi khi mã không tồn tại; dữ liệu đọc từ ngoài
 * nên tra bằng `codeEntry`.
 * @example rule('T2').severities // ['S1', 'S3']
 */
export function rule(code: RuleCode): RuleMeta {
  const r = ruleMap.get(code);
  if (!r) throw new Error(`@ochotona/spec: unknown rule ${code}`);
  return r;
}

// --------------------------------------------------------------- năng lực

export const capabilityRanges: readonly CapabilityRange[] = CAPABILITY_RANGES;
const rangeBounds = capabilityRanges.map((r) => ({
  range: r,
  from: parseVersion(r.from)!,
  to: r.to === undefined ? undefined : parseVersion(r.to)!,
}));
const minSupported = parseVersion(BROKER_SUPPORT.minSupported)!;
const tested: readonly string[] = BROKER_SUPPORT.tested;

/**
 * Năng lực theo phiên bản broker. Tra khoảng theo `major.minor.patch`, bỏ qua
 * `pre`: `4.3.0-rc.1` mang hành vi của 4.3. Bản pre-release và bản có
 * `major.minor` ngoài danh sách đã test là `untested`.
 * @example capabilitiesFor(parseVersion('4.2.0')!).status // 'supported'
 */
export function capabilitiesFor(v: Version): CapabilityLookup {
  if (compareRelease(v, minSupported) < 0) return { status: 'unsupported' };
  let found = rangeBounds[rangeBounds.length - 1];
  for (const b of rangeBounds) {
    if (
      compareRelease(v, b.from) >= 0 &&
      (b.to === undefined || compareRelease(v, b.to) < 0)
    ) {
      found = b;
      break;
    }
  }
  const isTested =
    v.pre === undefined && tested.includes(`${v.major}.${v.minor}`);
  return {
    status: isTested ? 'supported' : 'untested',
    caps: found.range.caps,
    range: found.range,
  };
}

/**
 * Mặc định dựng sẵn theo loại queue, khoá chuẩn → giá trị. Stream trả `{}`;
 * `delivery-limit` vắng khi không giới hạn. Phiên bản nhỏ hơn
 * `broker.minSupported` dùng khoảng đầu.
 * @example defaultsFor(parseVersion('4.2.1')!, 'quorum')['delivery-limit'] // 20
 */
export function defaultsFor(
  v: Version,
  type: QueueType,
): Readonly<Record<string, ArgValue>> {
  if (type === 'stream') return {};
  const found = capabilitiesFor(v);
  const caps =
    found.status === 'unsupported' ? capabilityRanges[0].caps : found.caps;
  if (type === 'classic') return { overflow: caps.defaults.classic.overflow };
  const q = caps.defaults.quorum;
  return {
    overflow: q.overflow,
    'dead-letter-strategy': q.deadLetterStrategy,
    ...(q.deliveryLimit === null ? {} : { 'delivery-limit': q.deliveryLimit }),
  };
}

// --------------------------------------------------------------- khoá

export const keys: readonly KeyDef[] = KEYS;
const index = <K extends 'argument' | 'policy' | 'canonical'>(field: K) =>
  new Map<string, KeyDef>(
    keys.flatMap((k) => (k[field] === undefined ? [] : [[k[field]!, k]])),
  );
const byArgument = index('argument');
const byPolicy = index('policy');
const byCanonical = index('canonical');

/** @example keyByArgument('x-delivery-limit')?.canonical // 'delivery-limit' */
export function keyByArgument(name: string): KeyDef | undefined {
  return byArgument.get(name);
}

/** @example keyByPolicy('delivery-limit')?.resolution // 'lower_wins' */
export function keyByPolicy(name: string): KeyDef | undefined {
  return byPolicy.get(name);
}

/** @example keyByCanonical('queue-type')?.argument // 'x-queue-type' */
export function keyByCanonical(name: string): KeyDef | undefined {
  return byCanonical.get(name);
}

// --------------------------------------------------------------- loại trừ

export const exclusions: readonly Exclusion[] = EXCLUSIONS;

/** Loại trừ áp cho một loại đối tượng trong một phạm vi. */
export function exclusionsFor(
  kind: Exclusion['kind'],
  scope: 'topology' | 'rules',
): readonly Exclusion[] {
  return exclusions.filter((x) => x.kind === kind && x.scopes.includes(scope));
}

// --------------------------------------------------------------- mã, mức

export const codes: readonly CodeEntry[] = CODES;
const codeMap = new Map<string, CodeEntry>(codes.map((c) => [c.code, c]));

/** Tra mã bất kỳ trong sổ đăng ký; không có thì `undefined`. */
export function codeEntry(code: string): CodeEntry | undefined {
  return codeMap.get(code);
}

export const blindSpots: readonly BlindSpot[] = BLIND_SPOTS;
export const severities: readonly SeverityDef[] = SEVERITIES;
export const exitCodes: Readonly<Record<0 | 1 | 2 | 3 | 4 | 5 | 130, string>> =
  EXIT_CODES;

// --------------------------------------------------------------- schema, liên kết

export const schemas: {
  readonly finding1: object;
  readonly report1: object;
  readonly snapshot1: object;
  readonly ochoYaml01: object;
} = SCHEMAS;

/**
 * Liên kết tới văn bản spec hoặc lesson, gắn với thẻ phiên bản của công cụ.
 * `anchor` được viết thường.
 * @example docsUrl('spec', 'T2', { toolVersion: '0.1.0', specVersion: '0.4' })
 */
export function docsUrl(
  kind: 'spec' | 'lesson',
  anchor: string,
  v: { toolVersion: string; specVersion: string },
): string {
  return DOCS_TEMPLATES[kind]
    .replace('{toolVersion}', v.toolVersion)
    .replace('{specVersion}', v.specVersion)
    .replace('{anchor}', anchor.toLowerCase());
}
