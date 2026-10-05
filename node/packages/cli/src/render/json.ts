// Đầu ra `--json`: stdout chứa đúng một document, kết thúc bằng một ký tự
// xuống dòng, không màu, không tiến trình. Mọi object đều có `schema`.

import { refKey, refLabel } from '@ochotona/model';
import { toActionText, toFinding } from '@ochotona/rules';
import { SPEC_VERSION } from '@ochotona/spec';
import { fmtNumber } from '../i18n';
import {
  type DoctorOutcome,
  displayResult,
  invisibleBlindSpots,
  summarize,
} from '../report';
import type { Session } from '../session';
import { TOOL_VERSION } from '../version';

/** `0.4.0` → `0.4`. */
export const SPEC_MAJOR_MINOR = SPEC_VERSION.split('.').slice(0, 2).join('.');

/** Một document JSON trên stdout. */
export function writeJson(s: Pick<Session, 'io'>, doc: unknown): void {
  s.io.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
}

/** Object `ocho.report/1`: `findings` gồm mọi kết quả, kể cả `pass`. */
export function buildReport(o: DoctorOutcome, s: Session): object {
  const { actual } = o;
  const sum = summarize(o.results, o.rules);
  const fmt = (n: number) => fmtNumber(s.lang, n);
  const nodes =
    actual.nodes.state === 'known' ? actual.nodes.value.length : null;
  return {
    schema: 'ocho.report/1',
    tool: { version: TOOL_VERSION, spec: SPEC_MAJOR_MINOR },
    broker: {
      version:
        actual.broker.version.state === 'known'
          ? actual.broker.version.value.raw
          : null,
      nodes,
      metadataStore:
        actual.broker.metadataStore.state === 'known'
          ? actual.broker.metadataStore.value
          : null,
    },
    sources: { ...actual.meta.sources },
    filters: {
      vhost: o.filters.vhosts.length ? o.filters.vhosts.join(',') : null,
      flow: o.filters.flow,
      targetVersion: o.filters.targetVersion,
    },
    startedAt: o.startedAt,
    durationMs: Math.max(0, Math.round(o.durationMs)),
    findings: o.results
      .map(displayResult)
      .map((r) => toFinding(r, s.lang, { fmtNumber: fmt })),
    actions: o.actions.map((a) => ({
      rule: a.rule,
      severity: a.severity,
      objects: a.objects.length,
      text: toActionText(a, s.lang, (ref) => refLabel(ref)),
    })),
    blindSpots: invisibleBlindSpots(),
    summary: {
      fail: sum.fail,
      pass: sum.pass,
      not_checked: sum.not_checked,
      not_applicable: sum.not_applicable,
      waived: sum.waived,
    },
    ...(o.internal.length > 0
      ? {
          internal: o.internal.map((i) => ({
            kind: i.kind,
            rule: i.rule,
            object: refKey(i.object),
            detail: i.detail,
          })),
        }
      : {}),
    exitCode: o.exitCode,
  };
}
