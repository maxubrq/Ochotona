import {
  type Actual,
  type Desired,
  type FlowMap,
  type Instant,
  type Version,
  buildFlowMap,
  buildIndexes,
} from '@ochotona/model';
import {
  BROKER_SUPPORT,
  capabilitiesFor,
  capabilityRanges,
  parseVersion,
} from '@ochotona/spec';
import type { Ctx } from './types';

/**
 * Dựng `Ctx` từ `Actual`. Phiên bản broker không biết thì dùng
 * `broker.minSupported` cho năng lực; luật nào cần phiên bản phải khai
 * `broker.version` trong `requires` để ra `not_checked` thay vì đoán.
 */
export function makeCtx(opts: {
  readonly actual: Actual;
  readonly desired?: Desired | null;
  readonly flows?: FlowMap;
  readonly targetVersion?: Version | null;
  readonly now: Instant;
}): Ctx {
  const { actual } = opts;
  const version =
    actual.broker.version.state === 'known'
      ? actual.broker.version.value
      : parseVersion(BROKER_SUPPORT.minSupported)!;
  const found = capabilitiesFor(version);
  return {
    actual,
    index: buildIndexes(actual),
    flows: opts.flows ?? buildFlowMap(opts.desired ?? null, actual),
    caps:
      found.status === 'unsupported' ? capabilityRanges[0].caps : found.caps,
    version,
    targetVersion: opts.targetVersion ?? null,
    now: opts.now,
  };
}
