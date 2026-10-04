import type { Actual } from '@ochotona/model';
import {
  type ImportResult,
  type ImportSession,
  type Question,
  createImportSession,
} from '../src';
import { T0, topologyOf } from './fixtures';

export function session(
  actual: Actual,
  existing: string | null = null,
  now = T0,
): ImportSession {
  return createImportSession({
    topology: topologyOf(actual),
    actual,
    existing: existing === null ? null : { text: existing },
    context: { name: 'prod', toolVersion: '0.1.0', now },
  });
}

/** Trả lời theo `pick` cho tới khi hết câu hỏi; `pick` trả `undefined` thì dùng mặc định cho phần còn lại. */
export function run(
  s: ImportSession,
  pick: (q: Question) => Parameters<ImportSession['answer']>[1] | undefined,
): ImportResult {
  for (let guard = 0; guard < 10_000; guard++) {
    const [q] = s.questions();
    if (!q) break;
    const a = pick(q);
    if (!a) {
      s.answerDefaults();
      break;
    }
    const r = s.answer(q.id, a);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
  }
  const r = s.result();
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

export const nonInteractive = (
  actual: Actual,
  existing: string | null = null,
  now = T0,
) => run(session(actual, existing, now), () => undefined);
