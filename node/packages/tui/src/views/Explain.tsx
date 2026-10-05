// Tra cứu: mọi luật, điểm mù, mã chẩn đoán của spec trong một danh sách lọc
// được; bên phải là đúng đầu ra của `ocho explain <mã>`. Không cần broker.

import { TextInput } from '@inkjs/ui';
import { explain } from '@ochotona/cli/api';
import { type I18nKey, blindSpots, codes, format, rules } from '@ochotona/spec';
import { Box, Text, useInput } from 'ink';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useHints, useScreen } from '../context';
import type { Target } from '../ocho';
import {
  ListView,
  Pane,
  type Row,
  ScrollText,
  listStatus,
  selectedItem,
  paneBody,
  paneInner,
} from '../ui';
import { explainObjectForm } from './actions';
import { TextView } from './TextView';
import { explainRuleLoader } from './explain-load';

export function Explain(props: { readonly target: Target | null }) {
  const { ocho, nav, t, cols, bodyRows, lang } = useApp();
  const { active, setTyping } = useScreen();
  const [filter, setFilter] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focus, setFocus] = useState<'list' | 'detail'>('list');
  const [text, setText] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState('');

  const leftW = Math.max(30, Math.min(60, Math.round(cols * 0.4)));
  const rightW = cols - leftW;
  const width = paneInner(rightW);

  useEffect(
    () => setTyping(filtering && active),
    [filtering, active, setTyping],
  );
  // Chữ render theo ngôn ngữ và bề rộng: đổi một trong hai thì tính lại.
  useEffect(() => setText({}), [lang, width]);

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const keep = (...xs: string[]) =>
      f === '' || xs.some((x) => x.toLowerCase().includes(f));
    const out: Row<string>[] = [];
    const section = (title: string, items: Row<string>[]) => {
      if (items.length === 0) return;
      out.push(
        { kind: 'header', text: `${title} (${items.length})`, color: 'cyan' },
        ...items,
      );
    };
    section(
      t('explain.rules'),
      rules
        .map((r) => ({
          code: r.code,
          title: format(lang, `rule.${r.code}.title` as I18nKey, {}),
          sev: r.severities.join(' '),
        }))
        .filter((r) => keep(r.code, r.title))
        .map((r) => ({
          kind: 'item' as const,
          key: r.code,
          text: `${r.code.padEnd(5)}${r.title}`,
          hint: r.sev,
          value: r.code,
        })),
    );
    const ids = new Set([
      ...rules.map((r) => r.code as string),
      ...blindSpots.map((b) => b.id),
    ]);
    section(
      t('explain.blind_spots'),
      blindSpots
        .filter((b) => keep(b.id, b.name))
        .map((b) => ({
          kind: 'item' as const,
          key: b.id,
          text: `${b.id.padEnd(6)}${b.name}`,
          value: b.id,
        })),
    );
    section(
      t('explain.codes'),
      codes
        .filter(
          (c) =>
            !ids.has(c.code) &&
            /^[A-Z]+[0-9]+$/.test(c.code) &&
            keep(c.code, c.meaning),
        )
        .map((c) => ({
          kind: 'item' as const,
          key: c.code,
          text: `${c.code.padEnd(6)}${c.meaning}`,
          value: c.code,
        })),
    );
    return out;
  }, [filter, lang, t]);
  // Mã đang chọn (khoá vắng hay bị lọc mất thì mục đầu).
  const code = selectedItem(rows, selectedKey)?.value ?? null;

  // Đầu ra `ocho explain <mã>` của mục đang chọn, nhớ lại theo mã.
  useEffect(() => {
    if (!code || text[code]) return;
    let live = true;
    ocho.run(['explain', code], { width }, explain).then(
      (r) => live && setText((old) => ({ ...old, [code]: r.out })),
      (e) =>
        live &&
        setText((old) => ({ ...old, [code]: ocho.errorLines(e, width) })),
    );
    return () => {
      live = false;
    };
  }, [code, text, width]);

  useInput(
    (input, k) => {
      if (filtering) {
        if (k.escape) {
          setFilter('');
          setFiltering(false);
        } else if (k.return || k.downArrow) setFiltering(false);
        return;
      }
      if (input === '/') {
        setFocus('list');
        setFiltering(true);
      } else if (k.tab || k.leftArrow || k.rightArrow)
        setFocus((f) =>
          k.leftArrow
            ? 'list'
            : k.rightArrow
              ? 'detail'
              : f === 'list'
                ? 'detail'
                : 'list',
        );
      else if (input === 'o')
        explainObjectForm(
          { ocho, nav, t, cols },
          props.target ?? { kind: 'cli', args: [] },
        );
    },
    { isActive: active },
  );

  useHints(
    filtering
      ? [
          { key: '⏎', label: t('hint.apply_filter') },
          { key: 'Esc', label: t('hint.clear_filter') },
        ]
      : [
          { key: '↑↓', label: t('hint.move') },
          { key: '/', label: t('hint.filter') },
          { key: '⏎', label: t('explain.hint.full') },
          { key: 'Tab', label: t('doctor.hint.focus') },
          { key: 'o', label: t('doctor.hint.explain_object') },
        ],
  );

  const filterShown = filtering || filter !== '';
  return (
    <Box>
      <Pane
        title={t('explain.browser_title')}
        width={leftW}
        height={bodyRows}
        focused={focus === 'list'}
        status={listStatus(rows, code)}
      >
        {filterShown ? (
          <Box>
            <Text color="cyan">/ </Text>
            {filtering ? (
              <TextInput
                defaultValue={filter}
                placeholder={t('explain.filter_placeholder')}
                onChange={setFilter}
              />
            ) : (
              <Text>{filter}</Text>
            )}
          </Box>
        ) : null}
        <ListView
          rows={rows}
          height={paneBody(bodyRows) - (filterShown ? 1 : 0)}
          active={active && focus === 'list' && !filtering}
          focused={focus === 'list'}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onSubmit={(c) =>
            nav.push(
              `${t('explain.title')} ${c}`,
              <TextView title={c} load={explainRuleLoader(ocho, c)} />,
            )
          }
        />
      </Pane>
      <Pane
        title={code ? `ocho explain ${code}` : ''}
        width={rightW}
        height={bodyRows}
        focused={focus === 'detail'}
        status={status}
      >
        <ScrollText
          lines={(code && text[code]) || []}
          width={width}
          height={paneBody(bodyRows)}
          active={active && focus === 'detail'}
          resetKey={code ?? ''}
          onStatus={setStatus}
        />
      </Pane>
    </Box>
  );
}
