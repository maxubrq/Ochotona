// Doctor: chạy `diagnose` của CLI (cùng mười ba bước với `ocho doctor`), rồi
// thay báo cáo dài bằng hai khung: danh sách (ba việc làm trước, lỗi theo mức,
// chưa kiểm, đã qua, điểm mù) và chi tiết của mục đang chọn, render bằng đúng
// các khối của báo cáo văn bản. Từ một mục: Enter giải thích luật, `o` giải
// thích đối tượng, `/` lọc, `s` lưu ảnh chụp, `e` xuất JSON, `r` chạy lại.

import { Spinner, TextInput } from '@inkjs/ui';
import {
  type DoctorOutcome,
  type Session,
  ascii,
  blindSpotLine,
  buildReport,
  diagnose,
  displayResult,
  failBlock,
  groupFails,
  hanging,
  headLines,
  inventoryLine,
  saveSnapshotFile,
  summaryLine,
  wrap,
} from '@ochotona/cli/api';
import { refLabel } from '@ochotona/model';
import { type RuleResult, toActionText, toFinding } from '@ochotona/rules';
import {
  type I18nKey,
  type Severity,
  blindSpots,
  format,
  severities,
} from '@ochotona/spec';
import { Box, Text, useInput } from 'ink';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type Hint, useApp, useHints, useScreen } from '../context';
import type { T } from '../i18n';
import { Cancelled, type Target } from '../ocho';
import {
  ListView,
  Pane,
  type Row,
  ScrollText,
  listStatus,
  paneBody,
  paneInner,
} from '../ui';
import { FormView } from './FormView';
import { TextView } from './TextView';
import { explainObjectLoader, explainRuleLoader } from './explain-load';

const SEVERITIES: readonly Severity[] = ['S1', 'S2', 'S3', 'S4', 'S5'];
const SEVERITY_COLOR: Record<Severity, string> = {
  S1: 'red',
  S2: 'magenta',
  S3: 'yellow',
  S4: 'gray',
  S5: 'gray',
};

/** Mục của danh sách bên trái. */
type Sel =
  | { readonly kind: 'action'; readonly index: number }
  | { readonly kind: 'fail'; readonly group: readonly RuleResult[] }
  | { readonly kind: 'not_checked'; readonly results: readonly RuleResult[] }
  | { readonly kind: 'waived'; readonly results: readonly RuleResult[] }
  | { readonly kind: 'pass' }
  | { readonly kind: 'blind' }
  | { readonly kind: 'internal' };

type Phase =
  | { readonly kind: 'running'; readonly step: string; readonly head: string[] }
  | {
      readonly kind: 'done';
      readonly outcome: DoctorOutcome;
      readonly warnings: string[];
    }
  | { readonly kind: 'error'; readonly lines: string[] };

const ruleTitle = (s: Session, code: string) =>
  format(s.lang, `rule.${code}.title` as I18nKey, {});

const objectOf = (r: RuleResult) => ascii(refLabel(r.object));

/** Gom theo luật, giữ thứ tự xuất hiện. */
function byRule(results: readonly RuleResult[]): RuleResult[][] {
  const m = new Map<string, RuleResult[]>();
  for (const r of results) m.set(r.rule, [...(m.get(r.rule) ?? []), r]);
  return [...m.values()];
}

function buildRows(
  o: DoctorOutcome,
  s: Session,
  t: T,
  filter: string,
): Row<Sel>[] {
  const f = filter.trim().toLowerCase();
  const matches = (rs: readonly RuleResult[]) =>
    f === '' ||
    rs.some(
      (r) =>
        r.rule.toLowerCase().includes(f) ||
        objectOf(r).toLowerCase().includes(f) ||
        ruleTitle(s, r.rule).toLowerCase().includes(f),
    );
  const results = o.results.map(displayResult);
  const rows: Row<Sel>[] = [];
  const section = (text: string, items: Row<Sel>[], color?: string) => {
    if (items.length === 0) return;
    rows.push({ kind: 'header', text, ...(color ? { color } : {}) }, ...items);
  };

  // Ba việc làm trước.
  section(
    t('doctor.section.actions', { count: o.actions.length }),
    o.actions
      .map((a, index) => ({ a, index }))
      .filter(({ a }) =>
        matches(
          results.filter((r) => r.rule === a.rule && r.result === 'fail'),
        ),
      )
      .map(({ a, index }) => ({
        kind: 'item' as const,
        key: `action:${index}`,
        text: `${index + 1}. ${ascii(toActionText(a, s.lang, (ref) => refLabel(ref)))}`,
        value: { kind: 'action' as const, index },
      })),
    'cyan',
  );

  // Lỗi theo mức.
  const fails = results.filter((r) => r.result === 'fail' && !r.waiver);
  for (const sev of SEVERITIES) {
    const ofSev = fails.filter((r) => r.severity === sev);
    if (ofSev.length === 0) continue;
    const label = severities.find((d) => d.level === sev)!.label[s.lang];
    section(
      `${sev}  ${label} (${ofSev.length})`,
      groupFails(ofSev, false)
        .filter(matches)
        .map((g) => ({
          kind: 'item' as const,
          key: `fail:${g[0].rule}:${g[0].variant ?? ''}:${g.length === 1 ? objectOf(g[0]) : '*'}`,
          text: `${g[0].rule.padEnd(4)} ${g.length === 1 ? objectOf(g[0]) : t('doctor.objects', { count: g.length })}`,
          hint: ruleTitle(s, g[0].rule),
          value: { kind: 'fail' as const, group: g },
        })),
      SEVERITY_COLOR[sev],
    );
  }

  const nc = results.filter((r) => r.result === 'not_checked' && !r.waiver);
  section(
    t('doctor.section.not_checked', { count: nc.length }),
    byRule(nc)
      .filter(matches)
      .map((g) => ({
        kind: 'item' as const,
        key: `nc:${g[0].rule}`,
        text: `${g[0].rule.padEnd(4)} ${t('doctor.objects', { count: g.length })}`,
        hint: ruleTitle(s, g[0].rule),
        value: { kind: 'not_checked' as const, results: g },
      })),
    'gray',
  );

  const waived = results.filter((r) => r.waiver);
  section(
    t('doctor.section.waived', { count: waived.length }),
    byRule(waived)
      .filter(matches)
      .map((g) => ({
        kind: 'item' as const,
        key: `waived:${g[0].rule}`,
        text: `${g[0].rule.padEnd(4)} ${t('doctor.objects', { count: g.length })}`,
        hint: ruleTitle(s, g[0].rule),
        value: { kind: 'waived' as const, results: g },
      })),
    'gray',
  );

  if (f === '') {
    const passed = results.filter((r) => r.result === 'pass').length;
    section(t('doctor.section.more'), [
      {
        kind: 'item',
        key: 'pass',
        text: t('doctor.passed', { count: passed }),
        value: { kind: 'pass' },
      },
      {
        kind: 'item',
        key: 'blind',
        text: t('doctor.blind', {
          count: blindSpots.filter((b) => b.caughtBy !== 'doctor').length,
        }),
        value: { kind: 'blind' },
      },
      ...(o.internal.length > 0
        ? [
            {
              kind: 'item' as const,
              key: 'internal',
              text: t('doctor.internal', { count: o.internal.length }),
              value: { kind: 'internal' as const },
            },
          ]
        : []),
    ]);
  }
  return rows;
}

function detailLines(o: DoctorOutcome, sel: Sel, s: Session, t: T): string[] {
  const results = o.results.map(displayResult);
  const para = (text: string) => wrap(text, s.width);
  const objects = (rs: readonly RuleResult[]) =>
    rs.length > 1
      ? [
          '',
          t('doctor.all_objects', { count: rs.length }),
          ...rs.map((r) => `  ${objectOf(r)}`),
        ]
      : [];
  switch (sel.kind) {
    case 'action': {
      const a = o.actions[sel.index];
      const keys = new Set(a.objects.map((x) => JSON.stringify(x)));
      const group = results.filter(
        (r) =>
          r.rule === a.rule &&
          r.result === 'fail' &&
          !r.waiver &&
          keys.has(JSON.stringify(r.object)),
      );
      return [
        ...para(ascii(toActionText(a, s.lang, (ref) => refLabel(ref)))),
        '',
        ...(group.length > 0 ? failBlock(group, s, true) : []),
        ...objects(group),
      ];
    }
    case 'fail':
      return [...failBlock(sel.group, s, true), ...objects(sel.group)];
    case 'not_checked':
    case 'waived': {
      const first = sel.results[0];
      const out = [`${first.rule}  ${ruleTitle(s, first.rule)}`, ''];
      const seen = new Set<string>();
      for (const r of sel.results) {
        const f = toFinding(r, s.lang);
        const lines =
          sel.kind === 'not_checked'
            ? [
                f.notChecked?.reason ?? '',
                f.notChecked?.unlock ? `→ ${f.notChecked.unlock}` : '',
              ]
            : [
                f.waiver
                  ? t('doctor.waiver', {
                      reason: f.waiver.reason,
                      by: f.waiver.by,
                      until: f.waiver.until,
                    })
                  : '',
              ];
        const k = lines.join('\n');
        if (seen.has(k)) continue;
        seen.add(k);
        for (const l of lines) if (l !== '') out.push(...para(l));
      }
      out.push('', t('doctor.all_objects', { count: sel.results.length }));
      out.push(...sel.results.map((r) => `  ${objectOf(r)}`));
      return out;
    }
    case 'pass': {
      const passed = byRule(results.filter((r) => r.result === 'pass'));
      return [
        ...para(t('doctor.passed_intro')),
        '',
        ...passed.flatMap((g) =>
          hanging(
            `${g[0].rule.padEnd(5)}`,
            `x${g.length} · ${ruleTitle(s, g[0].rule)}`,
            s.width,
          ),
        ),
      ];
    }
    case 'blind':
      return [
        ...para(t('doctor.blind_intro')),
        '',
        ...blindSpots
          .filter((b) => b.caughtBy !== 'doctor')
          .flatMap((b) =>
            hanging(
              `${b.id.padEnd(6)}`,
              `${b.name} (${s.t(`report.caught_by.${b.caughtBy}`)})`,
              s.width,
            ),
          ),
        '',
        ...blindSpotLine(s),
      ];
    case 'internal':
      return o.internal.flatMap((i) =>
        para(`${i.rule} ${ascii(refLabel(i.object))}: ${i.detail}`),
      );
  }
}

/** Luật của mục chọn, cho Enter (giải thích luật). */
function ruleOf(o: DoctorOutcome, sel: Sel | undefined): string | null {
  if (!sel) return null;
  if (sel.kind === 'action') return o.actions[sel.index].rule;
  if (sel.kind === 'fail') return sel.group[0].rule;
  if (sel.kind === 'not_checked' || sel.kind === 'waived')
    return sel.results[0].rule;
  return null;
}

/** Đối tượng (queue, exchange) của mục chọn, cho `o`. */
interface NamedRef {
  readonly kind: 'queue' | 'exchange';
  readonly vhost: string;
  readonly name: string;
}

function objectOfSel(o: DoctorOutcome, sel: Sel | undefined): NamedRef | null {
  if (!sel) return null;
  const first =
    sel.kind === 'fail'
      ? sel.group[0]
      : sel.kind === 'not_checked' || sel.kind === 'waived'
        ? sel.results[0]
        : sel.kind === 'action'
          ? null
          : null;
  const ref =
    first?.object ??
    (sel.kind === 'action' ? o.actions[sel.index].objects[0] : null);
  return ref && (ref.kind === 'queue' || ref.kind === 'exchange')
    ? (ref as NamedRef)
    : null;
}

export function Doctor(props: {
  readonly target: Target;
  /** Cờ riêng của `doctor` (`--vhost`, `--fail-on`…). */
  readonly flags?: readonly string[];
}) {
  const { ocho, nav, t, cols, bodyRows, lang } = useApp();
  const { active, setTyping } = useScreen();
  const flags = props.flags ?? [];
  const argv = useMemo(
    () => ['doctor', ...ocho.targetArgs(props.target), ...flags],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.target, flags.join('\0')],
  );
  const [phase, setPhase] = useState<Phase>({
    kind: 'running',
    step: '',
    head: [],
  });
  const [runId, setRunId] = useState(0);
  const [focus, setFocus] = useState<'list' | 'detail'>('list');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [detailStatus, setDetailStatus] = useState('');
  const progress = useRef('');

  const leftW = Math.max(30, Math.min(64, Math.round(cols * 0.42)));
  const rightW = cols - leftW;
  const detailWidth = paneInner(rightW);

  useEffect(() => {
    setTyping(filtering && active);
  }, [filtering, active, setTyping]);

  // Chạy (lại) chẩn đoán.
  useEffect(() => {
    const ac = new AbortController();
    const rs = () => ocho.renderSession(cols);
    setPhase({ kind: 'running', step: t('doctor.starting'), head: [] });
    ocho
      .run(
        argv,
        {
          width: cols,
          signal: ac.signal,
          target: props.target,
          ask: nav.askPassword,
        },
        (s) =>
          diagnose(s, {
            onConnecting: (name) =>
              setPhase({
                kind: 'running',
                step: s.t('doctor.connecting', { name }),
                head: [],
              }),
            onIdentified: ({ head, name, connectMs }) =>
              setPhase({
                kind: 'running',
                step: t('doctor.reading'),
                head: headLines(head, rs(), { name, connectMs }),
              }),
            onEvent: (e) => {
              if (e.type === 'page')
                progress.current = s.t('progress.reading', {
                  endpoint: e.endpoint,
                  page: e.page,
                  count: e.pageCount,
                });
              else if (e.type === 'throttle')
                progress.current = s.t('progress.slowed', { rps: e.rps });
              else return;
              setPhase((p) =>
                p.kind === 'running' ? { ...p, step: progress.current } : p,
              );
            },
          }),
      )
      .then(
        (r) => {
          if (ac.signal.aborted) return;
          setPhase({ kind: 'done', outcome: r.value, warnings: r.err });
        },
        (e) => {
          if (ac.signal.aborted) return;
          if (e instanceof Cancelled) nav.pop();
          else setPhase({ kind: 'error', lines: ocho.errorLines(e, cols - 4) });
        },
      );
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argv, runId]);

  const outcome = phase.kind === 'done' ? phase.outcome : null;
  const listSession = useMemo(
    () => ocho.renderSession(leftW),
    [ocho, leftW, lang],
  );
  const detailSession = useMemo(
    () => ocho.renderSession(detailWidth),
    [ocho, detailWidth, lang],
  );
  const headSession = useMemo(
    () => ocho.renderSession(cols),
    [ocho, cols, lang],
  );
  const rows = useMemo(
    () => (outcome ? buildRows(outcome, listSession, t, filter) : []),
    [outcome, listSession, t, filter],
  );
  // Mục chọn suy ra từ danh sách hiện tại: chạy lại thì khoá giữ, dữ liệu mới.
  const selected = useMemo(() => {
    const r = rows.find((x) => x.kind === 'item' && x.key === selectedKey);
    return r?.kind === 'item' ? r.value : undefined;
  }, [rows, selectedKey]);
  const detail = useMemo(
    () =>
      outcome && selected
        ? detailLines(outcome, selected, detailSession, t)
        : [],
    [outcome, selected, detailSession, t],
  );

  const explainRule = useCallback(
    (code: string) =>
      nav.push(
        `${t('explain.title')} ${code}`,
        <TextView title={code} load={explainRuleLoader(ocho, code)} />,
      ),
    [nav, ocho, t],
  );

  const explainObject = useCallback(() => {
    const ref = outcome ? objectOfSel(outcome, selected) : null;
    if (!ref) return nav.toast(t('doctor.no_object'), 'warning');
    if (props.target.kind === 'snapshot')
      return nav.toast(t('doctor.object_needs_broker'), 'warning');
    nav.push(
      `${ref.kind} ${ref.name}`,
      <TextView
        title={`${ref.kind} ${ref.name} · vhost ${ref.vhost}`}
        load={explainObjectLoader(
          ocho,
          nav,
          props.target,
          ref.kind,
          ref.name,
          ref.vhost,
        )}
      />,
    );
  }, [outcome, selected, props.target, nav, ocho, t]);

  const saveSnapshot = useCallback(() => {
    if (!outcome) return;
    nav.push(
      t('save.title'),
      <FormView
        title={t('save.title')}
        intro={t('save.intro')}
        fields={[
          {
            name: 'file',
            kind: 'text',
            label: t('save.file'),
            initial: 'snap.json',
            required: true,
            hint: t('save.file_hint'),
          },
          {
            name: 'redact',
            kind: 'toggle',
            label: t('save.redact'),
            initial: true,
            hint: t('save.redact_hint'),
          },
        ]}
        submitLabel={t('save.submit')}
        onSubmit={async (v) => {
          const file = String(v.file).trim();
          const redact = v.redact === true;
          await ocho.run([], { width: cols }, (s) =>
            saveSnapshotFile(s, file, outcome.actual, {
              name: outcome.name,
              url: outcome.url,
              now: outcome.startedAt as never,
              redactHosts: redact,
            }),
          );
          nav.pop();
          nav.toast(
            t('save.done', {
              file,
              command: ocho.command(['doctor', '--from', file]),
            }),
            'success',
          );
        }}
      />,
    );
  }, [outcome, nav, ocho, t, cols]);

  const exportJson = useCallback(() => {
    if (!outcome) return;
    nav.push(
      t('export.title'),
      <FormView
        title={t('export.title')}
        intro={t('export.intro')}
        fields={[
          {
            name: 'file',
            kind: 'text',
            label: t('save.file'),
            initial: 'ocho-report.json',
            required: true,
          },
        ]}
        submitLabel={t('save.submit')}
        onSubmit={async (v) => {
          const file = String(v.file).trim();
          await ocho.run([], { width: cols }, async (s) => {
            const { resolve } = await import('node:path');
            await s.io.fs.writeFile(
              resolve(s.io.cwd, file),
              `${JSON.stringify(buildReport(outcome, s), null, 2)}\n`,
            );
          });
          nav.pop();
          nav.toast(t('export.done', { file }), 'success');
        }}
      />,
    );
  }, [outcome, nav, ocho, t, cols]);

  useInput(
    (input, k) => {
      if (filtering) {
        if (k.escape) {
          setFilter('');
          setFiltering(false);
        } else if (k.return || k.downArrow) setFiltering(false);
        return;
      }
      if (input === 'r') return setRunId((n) => n + 1);
      if (!outcome) return;
      if (k.tab || k.rightArrow || k.leftArrow)
        return setFocus((f) =>
          k.leftArrow
            ? 'list'
            : k.rightArrow
              ? 'detail'
              : f === 'list'
                ? 'detail'
                : 'list',
        );
      if (input === '/') {
        setFocus('list');
        return setFiltering(true);
      }
      if (input === 'o') return explainObject();
      if (input === 's') return saveSnapshot();
      if (input === 'e') return exportJson();
      if (k.return && focus === 'detail') {
        const code = ruleOf(outcome, selected);
        if (code) explainRule(code);
      }
    },
    { isActive: active },
  );

  const hints: Hint[] =
    phase.kind === 'done'
      ? filtering
        ? [
            { key: '⏎', label: t('hint.apply_filter') },
            { key: 'Esc', label: t('hint.clear_filter') },
          ]
        : [
            { key: '↑↓', label: t('hint.move') },
            { key: '⏎', label: t('doctor.hint.explain_rule') },
            { key: 'o', label: t('doctor.hint.explain_object') },
            { key: 'Tab', label: t('doctor.hint.focus') },
            { key: '/', label: t('hint.filter') },
            { key: 's', label: t('doctor.hint.save') },
            { key: 'e', label: t('doctor.hint.export') },
            { key: 'r', label: t('doctor.hint.rerun') },
          ]
      : phase.kind === 'error'
        ? [{ key: 'r', label: t('hint.retry') }]
        : [];
  useHints(hints);

  const command = ocho.command(argv);
  if (phase.kind === 'running')
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="gray">{`$ ${command}`}</Text>
        {phase.head.map((l, i) => (
          <Text key={i} wrap="truncate">
            {l}
          </Text>
        ))}
        <Box marginTop={1}>
          <Spinner label={phase.step} />
        </Box>
        <Text color="gray">{t('doctor.read_only')}</Text>
      </Box>
    );
  if (phase.kind === 'error')
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="gray">{`$ ${command}`}</Text>
        <Box marginTop={1} flexDirection="column">
          {phase.lines.map((l, i) => (
            <Text key={i} wrap="wrap">
              {l}
            </Text>
          ))}
        </Box>
      </Box>
    );

  const o = phase.outcome;
  const head = [
    ...headLines(o.actual, headSession, {
      name: o.name,
      connectMs: o.connectMs,
    }),
    inventoryLine(o.actual, headSession),
    summaryLine(o, headSession),
  ];
  const warnings = phase.warnings;
  const paneH = Math.max(6, bodyRows - head.length - 1 - warnings.length);
  const listH = paneBody(paneH) - (filtering || filter !== '' ? 1 : 0);
  return (
    <Box flexDirection="column">
      <Text color="gray" wrap="truncate">{` $ ${command}`}</Text>
      {warnings.map((l, i) => (
        <Text key={`w${i}`} wrap="truncate">
          {` ${l}`}
        </Text>
      ))}
      {head.map((l, i) => (
        <Text
          key={`h${i}`}
          wrap="truncate"
          color={
            i === head.length - 1
              ? o.exitCode === 0
                ? 'green'
                : o.exitCode === 1
                  ? 'red'
                  : 'yellow'
              : undefined
          }
        >
          {` ${l}`}
        </Text>
      ))}
      <Box>
        <Pane
          title={t('doctor.findings')}
          width={leftW}
          height={paneH}
          focused={focus === 'list'}
          status={listStatus(rows, selectedKey)}
        >
          {filtering || filter !== '' ? (
            <Box>
              <Text color="cyan">/ </Text>
              {filtering ? (
                <TextInput
                  defaultValue={filter}
                  placeholder={t('doctor.filter_placeholder')}
                  onChange={setFilter}
                />
              ) : (
                <Text>{filter}</Text>
              )}
            </Box>
          ) : null}
          {rows.length === 0 ? (
            <Text color="gray">{t('doctor.no_match')}</Text>
          ) : (
            <ListView
              rows={rows}
              height={listH}
              active={active && focus === 'list' && !filtering}
              focused={focus === 'list'}
              onChange={(_, key) => setSelectedKey(key)}
              onSubmit={(v) => {
                const code = ruleOf(o, v);
                if (code) explainRule(code);
                else setFocus('detail');
              }}
            />
          )}
        </Pane>
        <Pane
          title={
            selected
              ? (ruleOf(o, selected) ?? t('doctor.details'))
              : t('doctor.details')
          }
          width={rightW}
          height={paneH}
          focused={focus === 'detail'}
          status={detailStatus}
        >
          <ScrollText
            lines={detail}
            width={detailWidth}
            height={paneBody(paneH)}
            active={active && focus === 'detail'}
            resetKey={selectedKey ?? ''}
            onStatus={setDetailStatus}
          />
        </Pane>
      </Box>
    </Box>
  );
}
