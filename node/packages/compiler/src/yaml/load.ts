import {
  type Desired,
  type Instant,
  type Result,
  buildDesired,
  err,
  ok,
  validateDesired,
} from '@ochotona/model';
import { locate } from '../locate';
import type { LocatedDiag, PositionMap } from '../types';
import { readOchoYaml } from './read';

/**
 * Đọc, dựng `Desired` và định vị chẩn đoán trong một bước:
 * `readOchoYaml` + `model.buildDesired` + `locate`. Lỗi trả mọi chẩn đoán
 * (cả cảnh báo); thành công trả cảnh báo YW và Y10.
 */
export function loadOchoYaml(
  text: string,
  now: Instant,
  file = 'ocho.yaml',
): Result<
  {
    desired: Desired;
    positions: PositionMap;
    warnings: readonly LocatedDiag[];
  },
  readonly LocatedDiag[]
> {
  const read = readOchoYaml(text);
  if (
    read.value === null &&
    read.diagnostics.some((d) => d.severity === 'error')
  )
    return err(locate(read.diagnostics, read.positions, file));
  const { errors, warnings } = validateDesired(read.value, now);
  const all = locate(
    [...read.diagnostics, ...errors, ...warnings],
    read.positions,
    file,
  );
  if (errors.length > 0) return err(all);
  const built = buildDesired(read.value, now);
  if (!built.ok) return err(all);
  return ok({ desired: built.value, positions: read.positions, warnings: all });
}
