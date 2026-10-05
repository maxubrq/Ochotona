// Home: các broker đã lưu (context) bên trái, chi tiết và việc làm được bên
// phải. Enter mở menu việc cho mục đang chọn; mỗi việc cũng có một phím tắt,
// in sẵn bên phải để không phải nhớ.

import { Select } from '@inkjs/ui';
import { type ContextFile, context } from '@ochotona/cli/api';
import { Box, Text, useInput } from 'ink';
import React, { useEffect, useMemo, useState } from 'react';
import { type Hint, useApp, useHints, useScreen } from '../context';
import type { Target } from '../ocho';
import {
  ListView,
  Pane,
  type Row,
  Lines,
  listStatus,
  selectedItem,
  paneBody,
  paneInner,
} from '../ui';
import {
  type Ctx,
  addContext,
  connectUrl,
  doctorOptions,
  explainObjectForm,
  importWizard,
  makeCurrent,
  openSnapshot,
  removeContext,
  rulesBrowser,
  runDoctor,
  targetLabel,
} from './actions';

type Item =
  | {
      readonly kind: 'target';
      readonly target: Target;
      readonly current: boolean;
    }
  | { readonly kind: 'add' | 'connect' | 'snapshot' | 'rules' };

/** Việc làm được với một broker, theo thứ tự trong menu. */
type Action = 'doctor' | 'options' | 'explain' | 'import' | 'use' | 'remove';
const ACTION_KEYS: Record<Action, string> = {
  doctor: 'd',
  options: 'D',
  explain: 'x',
  import: 'i',
  use: 'u',
  remove: 'r',
};

function actionsFor(item: Extract<Item, { kind: 'target' }>): Action[] {
  const out: Action[] = ['doctor', 'options', 'explain', 'import'];
  if (item.target.kind === 'context') {
    if (!item.current) out.push('use');
    out.push('remove');
  }
  return out;
}

function ActionMenu(props: {
  readonly item: Extract<Item, { kind: 'target' }>;
  readonly run: (a: Action) => void;
}) {
  const { t, bodyRows } = useApp();
  const { active } = useScreen();
  useHints([
    { key: '↑↓', label: t('hint.move') },
    { key: '⏎', label: t('hint.choose') },
  ]);
  const actions = actionsFor(props.item);
  return (
    <Pane
      title={t('home.menu_title', { name: targetLabel(t, props.item.target) })}
      focused
      height={Math.min(bodyRows, actions.length + 6)}
    >
      <Select
        isDisabled={!active}
        options={actions.map((a) => ({
          value: a,
          label: `${t(`home.action.${a}`)}   (${ACTION_KEYS[a]})`,
        }))}
        onChange={(v) => props.run(v as Action)}
      />
    </Pane>
  );
}

export function Home(props: {
  /** Đích từ cờ dòng lệnh lúc khởi động (`--url`, `--context`…), nếu có. */
  readonly cliTarget?: Target;
}) {
  const app = useApp();
  const { ocho, nav, t, cols, bodyRows, lang } = app;
  const { active } = useScreen();
  const [file, setFile] = useState<{ path: string; data: ContextFile } | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [details, setDetails] = useState<{
    key: string | null;
    lines: string[];
  }>({ key: null, lines: [] });
  const [reload, setReload] = useState(0);
  const c: Ctx = { ocho, nav, t, cols };

  const leftW = Math.max(30, Math.min(56, Math.round(cols * 0.38)));
  const rightW = cols - leftW;

  // Đọc lại file context mỗi khi quay về Home (có thể vừa thêm, xoá, đổi).
  useEffect(() => {
    if (!active) return;
    ocho.contexts().then(
      (r) => {
        setFile({ path: r.file, data: r.data });
        setLoadError([]);
        for (const w of r.warnings) nav.toast(w, 'warning');
      },
      (e) => setLoadError(ocho.errorLines(e, cols - 4)),
    );
  }, [active, reload]);

  const rows = useMemo(() => {
    const out: Row<Item>[] = [];
    const names = file ? Object.keys(file.data.contexts).sort() : [];
    out.push({
      kind: 'header',
      text: t('home.brokers', { count: names.length }),
      color: 'cyan',
    });
    if (props.cliTarget)
      out.push({
        kind: 'item',
        key: 'cli',
        text: t('home.cli_target'),
        hint: ocho
          .command(ocho.targetArgs(props.cliTarget))
          .replace(/^ocho /, ''),
        value: { kind: 'target', target: props.cliTarget, current: false },
      });
    for (const n of names)
      out.push({
        kind: 'item',
        key: `context:${n}`,
        text: `${n === file?.data.current ? '● ' : '  '}${n}`,
        hint: file!.data.contexts[n].url,
        value: {
          kind: 'target',
          target: { kind: 'context', name: n },
          current: n === file?.data.current,
        },
      });
    out.push({ kind: 'header', text: ' ' });
    out.push({ kind: 'header', text: t('home.start'), color: 'cyan' });
    out.push({
      kind: 'item',
      key: 'add',
      text: `+ ${t('home.add')}`,
      value: { kind: 'add' },
    });
    out.push({
      kind: 'item',
      key: 'connect',
      text: `→ ${t('home.connect')}`,
      value: { kind: 'connect' },
    });
    out.push({
      kind: 'item',
      key: 'snapshot',
      text: `◇ ${t('home.snapshot')}`,
      value: { kind: 'snapshot' },
    });
    out.push({
      kind: 'item',
      key: 'rules',
      text: `? ${t('home.rules')}`,
      value: { kind: 'rules' },
    });
    return out;
  }, [file, t, props.cliTarget, ocho]);

  // Chưa chọn gì: đích từ dòng lệnh, rồi context mặc định, rồi mục đầu.
  const preferred =
    selectedKey ??
    (props.cliTarget
      ? 'cli'
      : file?.data.current
        ? `context:${file.data.current}`
        : null);
  const selectedRow = selectedItem(rows, preferred);
  const selected = selectedRow?.value;
  const shownKey = selectedRow?.key ?? null;

  // Chi tiết của context đang chọn: đúng như `ocho context show <tên>`. Gắn
  // với khoá của mục, để khung phải không bao giờ hiện chi tiết của mục khác
  // trong lúc chờ; kết quả về muộn của mục cũ bị bỏ.
  useEffect(() => {
    if (selected?.kind !== 'target' || selected.target.kind !== 'context')
      return;
    const name = selected.target.name;
    const key = shownKey;
    let live = true;
    ocho
      .run(['context', 'show', name], { width: paneInner(rightW) }, context)
      .then(
        (r) => live && setDetails({ key, lines: r.out }),
        (e) =>
          live &&
          setDetails({ key, lines: ocho.errorLines(e, paneInner(rightW)) }),
      );
    return () => {
      live = false;
    };
  }, [shownKey, lang, rightW, reload]);

  const run = (item: Extract<Item, { kind: 'target' }>, a: Action) => {
    const target = item.target;
    switch (a) {
      case 'doctor':
        return runDoctor(c, target);
      case 'options':
        return doctorOptions(c, target);
      case 'explain':
        return explainObjectForm(c, target);
      case 'import':
        return importWizard(c, target);
      case 'use':
        if (target.kind === 'context')
          void makeCurrent(c, target.name).then(() => setReload((n) => n + 1));
        return;
      case 'remove':
        if (target.kind === 'context')
          void removeContext(c, target.name).then(() =>
            setReload((n) => n + 1),
          );
        return;
    }
  };

  const open = (item: Item) => {
    switch (item.kind) {
      case 'target':
        return nav.push(
          targetLabel(t, item.target),
          <ActionMenu
            item={item}
            run={(a) => {
              nav.pop();
              run(item, a);
            }}
          />,
        );
      case 'add':
        return addContext(c, file ? Object.keys(file.data.contexts) : []);
      case 'connect':
        return connectUrl(c);
      case 'snapshot':
        return openSnapshot(c);
      case 'rules':
        return rulesBrowser(c, null);
    }
  };

  useInput(
    (input) => {
      if (input === 'a')
        return addContext(c, file ? Object.keys(file.data.contexts) : []);
      if (input === 'c') return connectUrl(c);
      if (input === 'f') return openSnapshot(c);
      if (input === 'R')
        return rulesBrowser(
          c,
          selected?.kind === 'target' ? selected.target : null,
        );
      if (selected?.kind !== 'target') return;
      const a = (Object.keys(ACTION_KEYS) as Action[]).find(
        (x) => ACTION_KEYS[x] === input,
      );
      if (a && actionsFor(selected).includes(a)) run(selected, a);
    },
    { isActive: active },
  );

  const hints: Hint[] = [
    { key: '↑↓', label: t('hint.move') },
    { key: '⏎', label: t('hint.open') },
    ...(selected?.kind === 'target'
      ? [
          { key: 'd', label: t('home.action.doctor') },
          { key: 'x', label: t('home.hint.explain') },
          { key: 'i', label: t('home.hint.import') },
        ]
      : []),
    { key: 'a', label: t('home.hint.add') },
    { key: 'R', label: t('home.hint.rules') },
  ];
  useHints(hints);

  const right: React.ReactNode = (() => {
    if (!selected) return null;
    if (selected.kind === 'target') {
      const shortcuts = actionsFor(selected).map((a) => (
        <Text key={a} wrap="truncate">
          <Text bold color="cyan">
            {`  ${ACTION_KEYS[a]}  `}
          </Text>
          {t(`home.action.${a}`)}
          <Text color="gray">{`  ${t(`home.action_hint.${a}`)}`}</Text>
        </Text>
      ));
      return (
        <Box flexDirection="column">
          {selected.target.kind === 'context' ? (
            <Lines lines={details.key === shownKey ? details.lines : []} />
          ) : (
            <Text wrap="wrap">{t(`home.about.${selected.target.kind}`)}</Text>
          )}
          <Box marginTop={1} flexDirection="column">
            <Text bold>{t('home.what_next')}</Text>
            {shortcuts}
          </Box>
        </Box>
      );
    }
    return <Text wrap="wrap">{t(`home.about.${selected.kind}`)}</Text>;
  })();

  const welcome =
    file !== null &&
    Object.keys(file.data.contexts).length === 0 &&
    !props.cliTarget;
  const paneH = bodyRows - loadError.length - (welcome ? 1 : 0);
  return (
    <Box flexDirection="column">
      {loadError.length > 0 ? <Lines lines={loadError} /> : null}
      {welcome ? (
        <Text color="yellow" wrap="truncate">
          {` ${t('home.welcome')}`}
        </Text>
      ) : null}
      <Box>
        <Pane
          title={t('home.title')}
          width={leftW}
          height={paneH}
          focused
          status={listStatus(rows, shownKey)}
        >
          <ListView
            rows={rows}
            height={paneBody(paneH)}
            active={active}
            selectedKey={shownKey}
            onSelect={setSelectedKey}
            onSubmit={open}
          />
        </Pane>
        <Pane
          title={
            selected?.kind === 'target'
              ? targetLabel(t, selected.target)
              : t('home.about_title')
          }
          width={rightW}
          height={paneH}
        >
          {right}
        </Pane>
      </Box>
    </Box>
  );
}
