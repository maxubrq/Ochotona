import { type ObjectRef, refKey, refLabel } from '@ochotona/model';
import {
  type I18nKey,
  type Lang,
  type Severity,
  format,
  hasMessage,
  rule,
} from '@ochotona/spec';
import type { Action, Params, RuleResult } from './types';

type TextField = 'what' | 'dataSafety' | 'next' | 'mechanism';

/** Khoá theo biến thể nếu có, không thì khoá gốc. */
export function textKey(
  code: string,
  field: TextField,
  variant?: string,
): I18nKey {
  const v = `rule.${code}.${field}.${variant}`;
  if (variant && hasMessage(v)) return v;
  return `rule.${code}.${field}` as I18nKey;
}

function formatParams(p: Params): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p))
    out[k] = Array.isArray(v) ? v.join(', ') : (v as string | number);
  return out;
}

function reasonParams(
  r: RuleResult['notChecked'] & object,
): Record<string, string | number> {
  const reason = r.reason as Record<string, unknown>;
  const out: Record<string, string | number> = {
    path: r.source,
    source: r.source,
  };
  for (const [k, v] of Object.entries(reason)) {
    if (k === 'kind') continue;
    out[k] = Array.isArray(v)
      ? v.join(', ')
      : typeof v === 'object'
        ? JSON.stringify(v)
        : (v as string | number);
  }
  return out;
}

export interface Finding {
  readonly schema: 'ocho.finding/1';
  readonly rule: string;
  readonly severity: Severity;
  readonly result: RuleResult['result'];
  readonly object: {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
  };
  readonly what?: string;
  readonly dataSafety?: string;
  readonly next?: string;
  readonly mechanism?: string;
  readonly notChecked?: {
    readonly reason: string;
    readonly path?: string;
    readonly unlock?: string;
  };
  readonly evidence?: readonly {
    readonly kind: 'observed' | 'inferred';
    readonly source: string;
    readonly value?: unknown;
    readonly since?: string;
    readonly observedAt?: string;
    readonly note?: string;
  }[];
  readonly fix?: {
    readonly kind: string;
    readonly set?: object;
    readonly rabbitmqadmin?: string;
  };
  readonly specRef: string;
  readonly waiver?: {
    readonly reason: string;
    readonly by: string;
    readonly until: string;
  };
}

/**
 * Một `RuleResult` thành một object qua schema `finding:1`. Cần bảng văn bản
 * của `lang` đã nạp (`import '@ochotona/spec/i18n/<lang>'`).
 */
export function toFinding(
  r: RuleResult,
  lang: Lang,
  opts: { fmtNumber?: (n: number) => string } = {},
): Finding {
  const meta = rule(r.rule);
  const text = (f: TextField) =>
    format(
      lang,
      textKey(r.rule, f, r.variant),
      formatParams(r.params),
      opts.fmtNumber,
    );
  const nc = r.notChecked;
  let notChecked: Finding['notChecked'];
  if (nc) {
    const p = reasonParams(nc);
    const unlock = format(
      lang,
      `reason.${nc.reason.kind}.unlock` as I18nKey,
      p,
    );
    notChecked = {
      reason: format(lang, `reason.${nc.reason.kind}` as I18nKey, p),
      path: nc.path,
      ...(unlock ? { unlock } : {}),
    };
  }
  const evidence = r.evidence.map((e) => ({
    kind: e.kind,
    source: e.prov?.path ?? `derived:${e.path}`,
    ...(e.value !== undefined ? { value: e.value } : {}),
    ...(e.since ? { since: e.since } : {}),
    ...(e.prov ? { observedAt: e.prov.observedAt } : {}),
    ...(e.note ? { note: e.note } : {}),
  }));
  return {
    schema: 'ocho.finding/1',
    rule: r.rule,
    severity: r.severity ?? meta.severities[0],
    result: r.result,
    object: {
      id: refKey(r.object),
      kind: r.object.kind,
      label: refLabel(r.object),
    },
    ...(r.result === 'fail'
      ? {
          what: text('what'),
          dataSafety: text('dataSafety'),
          next: text('next'),
          mechanism: text('mechanism'),
        }
      : {}),
    ...(notChecked ? { notChecked } : {}),
    ...(r.result === 'fail' || evidence.length > 0 ? { evidence } : {}),
    ...(r.fix
      ? {
          fix: {
            kind: r.fix.kind,
            ...(r.fix.set ? { set: r.fix.set } : {}),
            ...(r.fix.rabbitmqadmin
              ? { rabbitmqadmin: r.fix.rabbitmqadmin }
              : {}),
          },
        }
      : {}),
    specRef: meta.specRef,
    ...(r.waiver
      ? {
          waiver: {
            reason: r.waiver.reason,
            by: r.waiver.by,
            until: r.waiver.until,
          },
        }
      : {}),
  };
}

/** Dòng "việc làm" cho một hành động: `rule.<MÃ>.action` với danh sách đối tượng. */
export function toActionText(
  a: Action,
  lang: Lang,
  labelOf: (ref: ObjectRef) => string,
): string {
  const labels = a.objects.slice(0, 3).map(labelOf);
  const more = a.objects.length - labels.length;
  const objects =
    more > 0 ? `${labels.join(', ')} (+${more})` : labels.join(', ');
  return format(lang, `rule.${a.rule}.action` as I18nKey, { objects });
}
