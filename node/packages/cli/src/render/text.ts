// Báo cáo văn bản của `doctor`, viết để đọc xong trong 60 giây: S1 đủ năm
// nhãn, S2 và S3 bỏ `Why`, S4 và S5 mỗi luật một dòng, chưa kiểm gom theo lý
// do, điểm mù một dòng, ba việc làm trước, dòng đếm.

import type { Actual } from '@ochotona/model';
import { refLabel } from '@ochotona/model';
import {
  type Finding,
  type RuleResult,
  toActionText,
  toFinding,
} from '@ochotona/rules';
import {
  type I18nKey,
  type Severity,
  blindSpots,
  format,
  severities,
} from '@ochotona/spec';
import { fmtNumber } from '../i18n';
import { type DoctorOutcome, displayResult, summarize } from '../report';
import type { Session } from '../session';
import { palette } from './color';
import {
  ascii,
  fmtDuration,
  fmtInstant,
  hanging,
  joinFit,
  labelBlock,
  labelWidth,
} from './layout';

export interface TextOptions {
  readonly why: boolean;
  readonly verbose: boolean;
}

/** Số đối tượng một khối gộp còn liệt kê tên. */
const GROUP_THRESHOLD = 3;

const SEVERITIES: readonly Severity[] = ['S1', 'S2', 'S3', 'S4', 'S5'];

function versionText(actual: Actual, s: Session): string {
  const v = actual.broker.version;
  return v.state === 'known'
    ? `RabbitMQ ${v.value.raw}`
    : s.t('report.version_unknown');
}

function brokerFacts(actual: Actual, s: Session): string[] {
  const parts = [versionText(actual, s)];
  if (actual.nodes.state === 'known')
    parts.push(s.t('report.nodes', { count: actual.nodes.value.length }));
  const store = actual.broker.metadataStore;
  if (store.state === 'known')
    parts.push(store.value === 'khepri' ? 'Khepri' : 'Mnesia');
  return parts;
}

/** Hai dòng đầu: kết nối hay ảnh chụp kèm phiên bản; nguồn dữ liệu. */
export function headLines(
  actual: Actual,
  s: Session,
  opts: { readonly name: string; readonly connectMs: number | null },
): string[] {
  const c = palette(s.color);
  const snap = actual.meta.fromSnapshot;
  const first = snap
    ? s.t('report.from_snapshot', {
        at: fmtInstant(snap.takenAt),
        context: actual.meta.contextName,
      })
    : s.t('report.connected', {
        name: opts.name,
        duration: fmtDuration(opts.connectMs ?? 0, s.lang),
      });
  const src = actual.meta.sources;
  const state = (st: string) => {
    const text = `[${s.t(`report.source_state.${st}`)}]`;
    return st === 'ok' ? c.ok(text) : text;
  };
  const sources = s.t('report.sources', {
    list: [
      `${s.t('report.source.http_list')} ${state(src['http.list'])}`,
      `${s.t('report.source.http_stats')} ${state(src['http.stats'])}`,
      `${s.t('report.source.prometheus')} ${state(src.prometheus)}`,
    ].join(' · '),
  });
  // Ảnh chụp: dòng nguồn gốc đứng riêng, phiên bản xuống dòng sau.
  const facts = snap
    ? [first, ...joinFit(brokerFacts(actual, s), s.width)]
    : joinFit([first, ...brokerFacts(actual, s)], s.width);
  return [...facts, ...joinFit(sources.split(' · '), s.width)];
}

/** Dòng thứ ba: `214 queues · 37 exchanges · 1 vhost`. */
export function inventoryLine(actual: Actual, s: Session): string {
  const count = (o: { state: string; value?: readonly unknown[] }) =>
    o.state === 'known' ? o.value!.length : null;
  const totals =
    actual.broker.totals.state === 'known' ? actual.broker.totals.value : null;
  const q = count(actual.queues) ?? totals?.queues ?? null;
  const e = count(actual.exchanges) ?? totals?.exchanges ?? null;
  const v = count(actual.vhosts);
  const part = (kind: string, n: number | null) =>
    n === null
      ? `? ${s.t(`kind.${kind}`, { count: 2 })}`
      : `${fmtNumber(s.lang, n)} ${s.t(`kind.${kind}`, { count: n })}`;
  return joinFit(
    [part('queue', q), part('exchange', e), part('vhost', v)],
    s.width,
  ).join('\n');
}

function kindCount(s: Session, kind: string, n: number): string {
  return `x${n} ${s.t(`kind.${kind}`, { count: n })}`;
}

function title(s: Session, code: string): string {
  return format(s.lang, `rule.${code}.title` as I18nKey, {});
}

/** Giá trị bằng chứng: số theo ngôn ngữ; mục hiệu lực thành `20 (builtin default)`. */
function evidenceValue(v: unknown, s: Session): string {
  if (v === null) return s.t('report.evidence.not_set');
  if (typeof v === 'number') return fmtNumber(s.lang, v);
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'value' in v && 'layer' in v) {
    const e = v as { value: unknown; layer: string; by: string | null };
    const where = s.t(`report.layer.${e.layer}`) + (e.by ? ` ${e.by}` : '');
    return `${evidenceValue(e.value, s)} (${where})`;
  }
  return JSON.stringify(v);
}

function evidenceLines(f: Finding, s: Session): string[] {
  return (f.evidence ?? []).map((e) => {
    // Bằng chứng trên một khoá hiệu lực mang ghi chú `key:<khoá>`: in theo khoá.
    const key = /^key:(.+)$/.exec(e.note ?? '');
    let line = `${s.t(`report.evidence.${e.kind}`)}: ${key ? key[1] : e.source}`;
    if (e.value !== undefined) line += ` = ${evidenceValue(e.value, s)}`;
    if (e.since)
      line += ` ${s.t('report.evidence.since', { since: fmtInstant(e.since) })}`;
    if (e.note && !key) line += ` (${e.note})`;
    return line;
  });
}

function objectList(s: Session, results: readonly RuleResult[]): string {
  const labels = results.map((r) => ascii(refLabel(r.object)));
  const shown = labels.slice(0, GROUP_THRESHOLD).join(', ');
  const more = labels.length - GROUP_THRESHOLD;
  return more > 0
    ? s.t('report.objects_more', { count: labels.length, list: shown, more })
    : s.t('report.objects', { count: labels.length, list: shown });
}

/** Một khối kết quả `fail`: S1 đủ năm nhãn; S2–S5 bỏ `Why` trừ khi `--why`. */
function failBlock(
  group: readonly RuleResult[],
  s: Session,
  withWhy: boolean,
): string[] {
  const c = palette(s.color);
  const first = group[0];
  const f = toFinding(first, s.lang, {
    fmtNumber: (n) => fmtNumber(s.lang, n),
  });
  const head =
    group.length === 1 ? ascii(f.object.label) : objectList(s, group);
  const flags = [first.experimental ? s.t('report.experimental') : null].filter(
    (x): x is string => x !== null,
  );
  const lines = [
    `  ${c.bold(first.rule.padEnd(4))}${head}${flags.length ? ` ${flags.join(' ')}` : ''}`,
    `      ${title(s, first.rule)}`,
  ];
  const labels = ['what', 'data', 'next', 'evidence', 'why'].map((k) =>
    s.t(`report.label.${k}`),
  );
  const rows: [string, string[]][] = [
    [labels[0], [f.what ?? '']],
    [labels[1], [f.dataSafety ?? '']],
    [labels[2], [f.next ?? '', `ocho explain ${first.rule}`]],
    [labels[3], evidenceLines(f, s)],
  ];
  if (f.fix?.rabbitmqadmin) rows[2][1].splice(1, 0, f.fix.rabbitmqadmin);
  if (withWhy) rows.push([labels[4], [f.mechanism ?? '']]);
  lines.push(
    ...labelBlock(
      rows.filter(([, v]) => v.length > 0),
      { indent: 6, labelWidth: labelWidth(labels), width: s.width },
    ),
  );
  return lines;
}

/** Gom theo (luật, biến thể); hơn 3 đối tượng thì một khối, trừ khi `--verbose`. */
function groupFails(
  results: readonly RuleResult[],
  verbose: boolean,
): RuleResult[][] {
  const groups = new Map<string, RuleResult[]>();
  for (const r of results) {
    const k = JSON.stringify([r.rule, r.variant ?? '']);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const out: RuleResult[][] = [];
  for (const g of groups.values()) {
    if (g.length > GROUP_THRESHOLD && !verbose) out.push(g);
    else out.push(...g.map((r) => [r]));
  }
  return out;
}

/** S4, S5: `C2 x5 consumers · Prefetch is 1 on a busy queue`. */
function oneLiners(results: readonly RuleResult[], s: Session): string[] {
  const c = palette(s.color);
  const groups = new Map<string, RuleResult[]>();
  for (const r of results) {
    const k = JSON.stringify([r.rule, r.object.kind]);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.values()].flatMap((g) =>
    hanging(
      `  ${c.bold(g[0].rule)} `,
      `${kindCount(s, g[0].object.kind, g.length)} · ${title(s, g[0].rule)}`,
      s.width,
    ),
  );
}

function severitySection(
  sev: Severity,
  results: readonly RuleResult[],
  s: Session,
  opts: TextOptions,
): string[] {
  if (results.length === 0) return [];
  const c = palette(s.color);
  const label = severities.find((d) => d.level === sev)!.label[s.lang];
  const lines = [
    c.severity(sev, `${sev}  ${label} (${fmtNumber(s.lang, results.length)})`),
    '',
  ];
  if ((sev === 'S4' || sev === 'S5') && !opts.verbose) {
    lines.push(...oneLiners(results, s));
  } else {
    const withWhy = sev === 'S1' || opts.why;
    const blocks = groupFails(results, opts.verbose).map((g) =>
      failBlock(g, s, withWhy),
    );
    blocks.forEach((b, i) => {
      if (i > 0) lines.push('');
      lines.push(...b);
    });
  }
  lines.push('');
  return lines;
}

/** Chưa kiểm, gom theo (lý do, cách mở khoá). */
function notCheckedLines(results: readonly RuleResult[], s: Session): string[] {
  const nc = results.filter((r) => r.result === 'not_checked' && !r.waiver);
  if (nc.length === 0) return [];
  const groups = new Map<
    string,
    { reason: string; unlock: string; rs: RuleResult[] }
  >();
  for (const r of nc) {
    const f = toFinding(r, s.lang);
    const reason = f.notChecked?.reason ?? '';
    const unlock = f.notChecked?.unlock ?? '';
    const k = JSON.stringify([reason, unlock]);
    const g = groups.get(k) ?? { reason, unlock, rs: [] };
    g.rs.push(r);
    groups.set(k, g);
  }
  const prefix = `${s.t('report.not_checked', { count: nc.length })} `;
  const out: string[] = [];
  let first = true;
  for (const g of groups.values()) {
    const byRule = new Map<string, RuleResult[]>();
    for (const r of g.rs) {
      const k = JSON.stringify([r.rule, r.object.kind]);
      byRule.set(k, [...(byRule.get(k) ?? []), r]);
    }
    const who = [...byRule.values()]
      .map(
        (rs) => `${rs[0].rule} ${kindCount(s, rs[0].object.kind, rs.length)}`,
      )
      .join(', ');
    const text = [who, g.reason, g.unlock].filter((x) => x !== '').join(' · ');
    const lead = first ? prefix : ' '.repeat(prefix.length);
    out.push(...hanging(lead, text, s.width));
    first = false;
  }
  out.push('');
  return out;
}

/** Điểm mù: một dòng, gom theo nơi sẽ bắt. */
function blindSpotLine(s: Session): string[] {
  const order = ['client', 'lint', 'decide', 'none'] as const;
  const parts = order
    .map((where) => {
      const ids = blindSpots
        .filter((b) => b.caughtBy === where)
        .map((b) => b.id);
      return ids.length
        ? `${ids.join(', ')} (${s.t(`report.caught_by.${where}`)})`
        : null;
    })
    .filter((x): x is string => x !== null);
  const firstId = blindSpots.find((b) => b.caughtBy !== 'doctor')?.id ?? 'LE2';
  return [
    ...hanging(
      `${s.t('report.blind_spots')} `,
      [...parts, `ocho explain ${firstId}`].join(' · '),
      s.width,
    ),
    '',
  ];
}

function actionLines(o: DoctorOutcome, s: Session): string[] {
  const c = palette(s.color);
  if (o.actions.length === 0) {
    const lines = [s.t('report.no_actions')];
    if (o.uncheckedS1 > 0)
      lines.push(s.t('report.unchecked_s1', { count: o.uncheckedS1 }));
    return [...lines, ''];
  }
  const lines = [s.t('report.actions')];
  o.actions.forEach((a, i) => {
    const text = ascii(toActionText(a, s.lang, (ref) => refLabel(ref)));
    const prefix = `  ${i + 1}. `;
    lines.push(...hanging(prefix, `${text} (${a.rule})`, s.width));
    lines.push(
      `${' '.repeat(prefix.length)}${c.dim(`ocho explain ${a.rule}`)}`,
    );
  });
  return [...lines, ''];
}

/** Dòng đếm: `38 rules · 9 fail · 21 pass · 4 not checked · 4 n/a · 2 waived · exit 1`. */
export function summaryLine(o: DoctorOutcome, s: Session): string {
  const sum = summarize(o.results, o.rules);
  const parts = [
    s.t('report.summary.rules', { count: sum.rules }),
    s.t('report.summary.fail', { count: sum.fail }),
    s.t('report.summary.pass', { count: sum.pass }),
    s.t('report.summary.not_checked', { count: sum.not_checked }),
    s.t('report.summary.not_applicable', { count: sum.not_applicable }),
  ];
  if (sum.waived > 0)
    parts.push(s.t('report.summary.waived', { count: sum.waived }));
  parts.push(s.t('report.summary.exit', { code: String(o.exitCode) }));
  return parts.join(' · ');
}

/** Phần thân báo cáo, sau ba dòng đầu. */
export function renderBody(
  o: DoctorOutcome,
  s: Session,
  opts: TextOptions,
): string[] {
  const results = o.results.map(displayResult);
  const fails = results.filter((r) => r.result === 'fail' && !r.waiver);
  const lines: string[] = [''];
  for (const sev of SEVERITIES)
    lines.push(
      ...severitySection(
        sev,
        fails.filter((r) => r.severity === sev),
        s,
        opts,
      ),
    );
  lines.push(...notCheckedLines(results, s));
  lines.push(...blindSpotLine(s));
  lines.push(...actionLines(o, s));
  if (o.internal.length > 0) {
    for (const i of o.internal)
      lines.push(
        ...hanging(
          `${s.t('report.internal')} `,
          `${i.rule} ${ascii(refLabel(i.object))}: ${i.detail}`,
          s.width,
        ),
      );
    lines.push('');
  }
  lines.push(summaryLine(o, s));
  return lines;
}
