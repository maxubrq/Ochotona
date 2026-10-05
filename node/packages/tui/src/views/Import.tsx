// Import: cùng phiên của compiler và cùng các bước của `ocho import`, nhưng mỗi
// câu hỏi là một menu chọn có giải thích ngay dưới lựa chọn đang tô sáng, thay
// cho `[s]trict [l]oose [k]eep [A]pply [?]`. Xem trước thay đổi, rồi mới ghi;
// thoát giữa chừng thì không ghi gì (như CLI: không có "lưu một phần").

import { Spinner, TextInput } from '@inkjs/ui';
import {
  type PreparedImport,
  type Session,
  importResult,
  prepareImport,
  writeImport,
} from '@ochotona/cli/api';
import type { ImportResult, Question } from '@ochotona/compiler';
import type { Tolerance } from '@ochotona/model';
import { type I18nKey, format } from '@ochotona/spec';
import { Box, Text, useInput } from 'ink';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useHints, useScreen } from '../context';
import { Cancelled, type Target } from '../ocho';
import {
  Form,
  ListView,
  Lines,
  Pane,
  type Row,
  ScrollText,
  paneBody,
} from '../ui';
import { runDoctor } from './actions';

type Phase =
  | { readonly kind: 'options' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'asking' }
  | { readonly kind: 'review'; readonly result: ImportResult }
  | { readonly kind: 'done'; readonly lines: string[] }
  | { readonly kind: 'error'; readonly lines: string[] };

/** Lựa chọn của một câu: giá trị, nhãn, giải thích. */
interface Choice {
  readonly value: string;
  readonly label: string;
  readonly about: string;
}

function choicesOf(q: Question, t: (k: string) => string): Choice[] {
  const c = (value: string, base: string): Choice => ({
    value,
    label: t(`${base}.${value}`),
    about: t(`${base}.${value}.about`),
  });
  if (q.kind === 'tolerance')
    return ['undeclared', 'strict', 'loose', 'exchange'].map((v) =>
      c(v, 'import.tolerance'),
    );
  if (q.kind === 'family')
    return ['skip', 'accept', 'rename'].map((v) =>
      c(v, 'import.family_choice'),
    );
  return ['skip', 'add'].map((v) => c(v, 'import.member_choice'));
}

export function Import(props: { readonly target: Target }) {
  const { ocho, nav, t, cols, bodyRows, lang } = useApp();
  const { active, setTyping } = useScreen();
  const [phase, setPhase] = useState<Phase>({ kind: 'options' });
  const ref = useRef<{ s: Session; p: PreparedImport } | null>(null);
  const [tick, setTick] = useState(0);
  const [sub, setSub] = useState<'none' | 'exchange' | 'rename'>('none');
  const [choice, setChoice] = useState<Choice | null>(null);
  const [param, setParam] = useState('');
  const [paramError, setParamError] = useState('');
  const progress = useRef({
    totals: new Map<string, number>(),
    done: new Map<string, number>(),
  });
  const [outFile, setOutFile] = useState('ocho.yaml');

  // Mọi pha tự lo phím Esc (hỏi trước khi bỏ dở), nên tắt phím chung.
  useEffect(() => {
    setTyping(active && phase.kind !== 'done' && phase.kind !== 'error');
  }, [active, phase.kind, setTyping]);

  const session = ref.current?.p.session;
  const questions =
    session && phase.kind === 'asking' ? session.questions() : [];
  const q = questions[0];

  const start = (v: Record<string, string | boolean>) => {
    const out = String(v.out).trim() || 'ocho.yaml';
    setOutFile(out);
    const argv = ['import', ...ocho.targetArgs(props.target), '--out', out];
    if (v.source === 'file') argv.push('--from', String(v.definitions).trim());
    setPhase({ kind: 'loading' });
    ocho
      .run(
        argv,
        { width: cols, target: props.target, ask: nav.askPassword },
        async (s) => ({
          s,
          p: await prepareImport(s),
        }),
      )
      .then(
        (r) => {
          ref.current = r.value;
          for (const w of r.err) nav.toast(w, 'warning');
          advance();
        },
        (e) => {
          if (e instanceof Cancelled) setPhase({ kind: 'options' });
          else setPhase({ kind: 'error', lines: ocho.errorLines(e, cols - 4) });
        },
      );
  };

  /** Sang câu kế tiếp, hoặc sang bước xem trước khi hết câu. */
  const advance = () => {
    const r = ref.current!;
    setSub('none');
    setParam('');
    setParamError('');
    if (r.p.session.questions().length > 0) {
      setPhase({ kind: 'asking' });
      setTick((n) => n + 1);
      return;
    }
    try {
      setPhase({ kind: 'review', result: importResult(r.s, r.p) });
    } catch (e) {
      setPhase({ kind: 'error', lines: ocho.errorLines(e, cols - 4) });
    }
  };

  // Tiến độ của pha như CLI: `Flow 7/41`.
  const counter = useMemo(() => {
    if (!q || !session) return { i: 0, total: 0 };
    const { totals, done } = progress.current;
    const ph = session.phase;
    if (!totals.has(ph)) {
      totals.set(
        ph,
        questions.filter((x) => x.kind !== 'family_members').length,
      );
      done.set(ph, 0);
    }
    return { i: done.get(ph)! + 1, total: totals.get(ph)! };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const answered = () => {
    if (!q || !session) return;
    const { totals, done } = progress.current;
    const ph = q.kind === 'tolerance' ? 'tolerance' : 'families';
    if (q.kind === 'tolerance') {
      const left = session
        .questions()
        .filter((x) => x.kind === 'tolerance').length;
      done.set(ph, totals.get(ph)! - left);
    } else if (q.kind !== 'family_members') done.set(ph, counter.i);
    advance();
  };

  const answer = (value: string) => {
    if (!q || !session) return;
    if (q.kind === 'tolerance') {
      if (value === 'exchange') return setSub('exchange');
      session.answer(q.id, {
        kind: 'tolerance',
        value: value as Tolerance,
        scope: 'flow',
      });
    } else if (q.kind === 'family') {
      if (value === 'rename') return setSub('rename');
      session.answer(q.id, {
        kind: 'family',
        action: value as 'accept' | 'skip',
      });
    } else
      session.answer(q.id, {
        kind: 'family_members',
        action: value as 'add' | 'skip',
      });
    answered();
  };

  const stop = async () => {
    if (await nav.confirm(t('import.confirm_stop'))) nav.pop();
  };

  const useDefaults = async () => {
    if (!session) return;
    if (!(await nav.confirm(t('import.confirm_defaults')))) return;
    session.answerDefaults();
    advance();
  };

  const write = async () => {
    if (phase.kind !== 'review' || !ref.current) return;
    try {
      const r = await writeImport(ref.current.s, ref.current.p, phase.result);
      setPhase({ kind: 'done', lines: r.lines });
    } catch (e) {
      setPhase({ kind: 'error', lines: ocho.errorLines(e, cols - 4) });
    }
  };

  useInput(
    (input, k) => {
      if (phase.kind === 'asking') {
        if (k.escape) {
          if (sub !== 'none') setSub('none');
          else void stop();
        } else if (input === 'D' && sub === 'none') void useDefaults();
      } else if (phase.kind === 'review') {
        if (k.return) void write();
        else if (k.escape) void stop();
      } else if (phase.kind === 'done' && input === 'd') {
        nav.pop();
        runDoctor({ ocho, nav, t, cols }, props.target);
      } else if (phase.kind === 'loading' && k.escape) nav.pop();
    },
    { isActive: active && phase.kind !== 'options' },
  );

  useHints(
    phase.kind === 'asking'
      ? sub === 'rename'
        ? [
            { key: '⏎', label: t('hint.ok') },
            { key: 'Esc', label: t('hint.back') },
          ]
        : [
            { key: '↑↓', label: t('hint.move') },
            { key: '⏎', label: t('hint.choose') },
            { key: 'D', label: t('import.hint.defaults') },
            { key: 'Esc', label: t('import.hint.stop') },
          ]
      : phase.kind === 'review'
        ? [
            { key: '↑↓', label: t('hint.scroll') },
            { key: '⏎', label: t('import.hint.write', { file: outFile }) },
            { key: 'Esc', label: t('import.hint.stop') },
          ]
        : phase.kind === 'done'
          ? [{ key: 'd', label: t('import.hint.doctor') }]
          : [],
  );

  // ------------------------------------------------------------- vẽ

  if (phase.kind === 'options')
    return (
      <Pane title={t('import.title')} focused height={bodyRows}>
        <Box marginBottom={1}>
          <Text color="gray" wrap="wrap">
            {t('import.intro')}
          </Text>
        </Box>
        <Form
          fields={[
            {
              name: 'out',
              kind: 'text',
              label: t('import.out'),
              initial: 'ocho.yaml',
              hint: t('import.out_hint'),
            },
            {
              name: 'source',
              kind: 'choice',
              label: t('import.source'),
              choices: [
                { value: 'broker', label: t('import.source_broker') },
                { value: 'file', label: t('import.source_file') },
              ],
              hint: t('import.source_hint'),
            },
            {
              name: 'definitions',
              kind: 'text',
              label: t('import.definitions'),
              placeholder: 'definitions.json',
              hint: t('import.definitions_hint'),
            },
          ]}
          validate={(v): Record<string, string> =>
            v.source === 'file' && String(v.definitions).trim() === ''
              ? { definitions: t('form.required') }
              : {}
          }
          submitLabel={t('import.start')}
          onSubmit={start}
          onCancel={() => nav.pop()}
          labels={{
            yes: t('common.yes'),
            no: t('common.no'),
            required: t('form.required'),
          }}
        />
      </Pane>
    );

  if (phase.kind === 'loading')
    return (
      <Box padding={1}>
        <Spinner label={t('import.loading')} />
      </Box>
    );

  if (phase.kind === 'error' || phase.kind === 'done')
    return (
      <Pane title={t('import.title')} focused height={bodyRows}>
        <Lines
          lines={phase.lines}
          color={phase.kind === 'done' ? undefined : undefined}
        />
        {phase.kind === 'done' ? (
          <Box marginTop={1}>
            <Text color="green">{t('import.done_next')}</Text>
          </Box>
        ) : null}
      </Pane>
    );

  if (phase.kind === 'review') {
    const r = phase.result;
    const counts = { strict: 0, loose: 0, undeclared: 0 };
    for (const f of Object.values(r.desired.flows)) counts[f.tolerance]++;
    const lines = [
      t('import.review_summary', {
        flows: r.summary.flows,
        strict: counts.strict,
        loose: counts.loose,
        undeclared: counts.undeclared,
        families: r.summary.families,
      }),
      ...(r.changes?.lines.length
        ? ['', t('import.review_changes'), ...r.changes.lines]
        : []),
      ...r.warnings.map((w) =>
        ref.current!.s.t('import.below_min_version', {
          actual: w.actual,
          min: w.min,
        }),
      ),
    ];
    return (
      <Pane
        title={t('import.review_title', { file: outFile })}
        focused
        height={bodyRows}
      >
        <ScrollText
          lines={lines}
          width={cols - 4}
          height={paneBody(bodyRows) - 2}
          active={active}
        />
        <Text bold color="cyan">
          {t('import.review_confirm', { file: outFile })}
        </Text>
      </Pane>
    );
  }

  // Câu hỏi.
  if (!q || !session || !ref.current) return null;
  const s = ref.current.s;
  const headline: string[] = [];
  if (q.kind === 'tolerance') {
    const facts = [
      q.rate ? s.t('import.rate', { rate: q.rate.perSecond }) : null,
      s.t('import.queues', { count: q.queues }),
    ].filter((x): x is string => x !== null);
    headline.push(
      `${s.t('import.flow', { ...counter, name: q.flow.name })}   ${facts.join(' · ')}`,
    );
    headline.push(format(lang, q.consequence as I18nKey, {}));
  } else if (q.kind === 'family') {
    const p = q.proposal;
    headline.push(
      s.t('import.family', {
        ...counter,
        template: p.queueTemplate,
        count: p.members.length,
        members: p.members.join(', '),
      }),
      s.t('import.family_where', {
        exchange: p.exchange,
        key: p.routingKeyTemplate,
        vhost: p.vhost,
      }),
    );
  } else
    headline.push(
      s.t('import.member', {
        family: q.family,
        queue: q.queue,
        member: q.member,
      }),
    );

  const choices = choicesOf(q, t);
  const rows: Row<Choice>[] = choices.map((c, i) => ({
    kind: 'item',
    key: `${q.id}:${c.value}`,
    text: i === 0 ? `${c.label}  ${t('import.default')}` : c.label,
    value: c,
  }));
  const tolRows: Row<Tolerance>[] = (
    ['undeclared', 'strict', 'loose'] as const
  ).map((v) => ({
    kind: 'item',
    key: `x:${v}`,
    text: t(`import.tolerance.${v}`),
    value: v,
  }));

  return (
    <Pane
      title={t('import.question_title', {
        phase: t(`import.phase.${session.phase}`),
      })}
      focused
      height={bodyRows}
    >
      <Lines lines={headline} />
      <Box marginTop={1} flexDirection="column">
        {sub === 'none' ? (
          <ListView
            key={q.id}
            rows={rows}
            height={rows.length}
            active={active}
            onChange={(c) => setChoice(c)}
            onSubmit={(c) => answer(c.value)}
          />
        ) : sub === 'exchange' ? (
          <Box flexDirection="column">
            <Text bold>{t('import.apply_rest')}</Text>
            <ListView
              rows={tolRows}
              height={tolRows.length}
              active={active}
              onSubmit={(v) => {
                if (q.kind !== 'tolerance') return;
                session.answer(q.id, {
                  kind: 'tolerance',
                  value: v,
                  scope: 'exchange',
                });
                answered();
              }}
            />
          </Box>
        ) : (
          <Box flexDirection="column">
            <Box>
              <Text bold>{s.t('import.param_name')} </Text>
              <TextInput
                defaultValue={param}
                onChange={setParam}
                onSubmit={(v) => {
                  if (q.kind !== 'family') return;
                  const r = session.answer(q.id, {
                    kind: 'family',
                    action: 'rename',
                    param: v.trim(),
                  });
                  if (r.ok) answered();
                  else
                    setParamError(
                      s.t('import.param_invalid', { param: v.trim() }),
                    );
                }}
              />
            </Box>
            {paramError ? <Text color="red">{paramError}</Text> : null}
          </Box>
        )}
      </Box>
      {sub === 'none' && choice ? (
        <Box marginTop={1}>
          <Text color="gray" wrap="wrap">
            {choice.about}
          </Text>
        </Box>
      ) : null}
    </Pane>
  );
}
