// Khung của TUI: dòng tiêu đề (đường dẫn màn hình, ngôn ngữ), chồng màn hình
// (màn hình dưới vẫn sống nên quay lại không mất kết quả), hộp thoại mật khẩu
// và xác nhận, dòng cuối là gợi ý phím hoặc thông báo. Phím chung: `?` trợ
// giúp, `L` đổi ngôn ngữ, `q`/Esc quay lại, Ctrl-C thoát.

import { ConfirmInput, PasswordInput } from '@inkjs/ui';
import type { Lang } from '@ochotona/cli/api';
import { Box, Text, useApp as useInkApp, useInput, useWindowSize } from 'ink';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  AppContext,
  type AppState,
  type Hint,
  type Nav,
  ScreenContext,
  type ScreenState,
  type ToastKind,
} from './context';
import { bindT, type T } from './i18n';
import type { Ocho } from './ocho';
import { Help } from './views/Help';

interface Entry {
  readonly id: number;
  readonly title: string;
  readonly node: React.ReactNode;
}

type Dialog =
  | {
      readonly kind: 'password';
      readonly prompt: string;
      readonly retry: string | undefined;
      readonly resolve: (v: string | null) => void;
    }
  | {
      readonly kind: 'confirm';
      readonly message: string;
      readonly resolve: (v: boolean) => void;
    };

const TOAST_MS = 5000;
const TOAST_COLOR: Record<ToastKind, string> = {
  info: 'cyan',
  success: 'green',
  warning: 'yellow',
  error: 'red',
};

function PasswordDialog(props: {
  readonly dialog: Extract<Dialog, { kind: 'password' }>;
  readonly t: T;
  readonly close: () => void;
}) {
  const { dialog, t } = props;
  useInput((_, k) => {
    if (k.escape) {
      dialog.resolve(null);
      props.close();
    }
  });
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      alignSelf="center"
      width={70}
    >
      <Text bold color="cyan">
        {t('password.title')}
      </Text>
      {dialog.retry ? (
        <Text color="yellow">{t(`password.retry.${dialog.retry}`)}</Text>
      ) : null}
      <Box marginTop={1}>
        <Text>{dialog.prompt} </Text>
        <PasswordInput
          onSubmit={(v) => {
            dialog.resolve(v);
            props.close();
          }}
        />
      </Box>
      <Box marginTop={1}>
        <Text color="gray">{t('password.note')}</Text>
      </Box>
    </Box>
  );
}

function ConfirmDialog(props: {
  readonly dialog: Extract<Dialog, { kind: 'confirm' }>;
  readonly close: () => void;
}) {
  const done = (v: boolean) => {
    props.dialog.resolve(v);
    props.close();
  };
  useInput((_, k) => {
    if (k.escape) done(false);
  });
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      alignSelf="center"
      width={70}
    >
      <Text>{props.dialog.message}</Text>
      <Box marginTop={1}>
        <ConfirmInput
          defaultChoice="cancel"
          onConfirm={() => done(true)}
          onCancel={() => done(false)}
        />
      </Box>
    </Box>
  );
}

function HintText(props: { readonly hints: readonly Hint[] }) {
  return (
    <>
      {props.hints.map((h, i) => (
        <Text key={i}>
          {i === 0 ? ' ' : '   '}
          <Text bold color="cyan">
            {h.key}
          </Text>{' '}
          {h.label}
        </Text>
      ))}
    </>
  );
}

/** Dòng cuối: phím của màn hình bên trái (cắt nếu chật), phím chung luôn hiện bên phải. */
function Footer(props: {
  readonly hints: readonly Hint[];
  readonly global: readonly Hint[];
  readonly toast: { text: string; kind: ToastKind } | null;
}) {
  if (props.toast)
    return (
      <Text color={TOAST_COLOR[props.toast.kind]} wrap="truncate">
        {` ${props.toast.text}`}
      </Text>
    );
  return (
    <Box justifyContent="space-between">
      <Box flexShrink={1} overflow="hidden">
        <Text wrap="truncate">
          <HintText hints={props.hints} />
        </Text>
      </Box>
      {props.global.length > 0 ? (
        <Box flexShrink={0}>
          <Text color="gray">{'  │'}</Text>
          <Text>
            <HintText hints={props.global} />{' '}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function App(props: {
  readonly ocho: Ocho;
  /** Màn hình gốc và (tuỳ chọn) màn hình mở ngay lúc khởi động. */
  readonly initial: readonly { title: string; node: React.ReactNode }[];
}) {
  const { ocho } = props;
  const ink = useInkApp();
  const { columns, rows } = useWindowSize();
  const [lang, setLang] = useState<Lang>(ocho.lang);
  const t = useMemo(() => bindT(lang), [lang]);
  const nextId = useRef(0);
  const [stack, setStack] = useState<Entry[]>(() =>
    props.initial.map((e) => ({ ...e, id: nextId.current++ })),
  );
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: ToastKind } | null>(
    null,
  );
  const toastTimer = useRef<NodeJS.Timeout | null>(null);
  const [hints, setHintsState] = useState<Record<number, readonly Hint[]>>({});
  const [typing, setTypingState] = useState<Record<number, boolean>>({});

  const top = stack[stack.length - 1];

  // Callback ổn định cho mỗi màn hình, để effect của màn hình không chạy lại vô hạn.
  const callbacks = useRef(
    new Map<number, Pick<ScreenState, 'setHints' | 'setTyping'>>(),
  );
  const screenState = (id: number, active: boolean): ScreenState => {
    let cb = callbacks.current.get(id);
    if (!cb) {
      cb = {
        setHints: (h) =>
          setHintsState((old) =>
            JSON.stringify(old[id]) === JSON.stringify(h)
              ? old
              : { ...old, [id]: h },
          ),
        setTyping: (v) =>
          setTypingState((old) =>
            (old[id] ?? false) === v ? old : { ...old, [id]: v },
          ),
      };
      callbacks.current.set(id, cb);
    }
    return { active, ...cb };
  };
  const quit = useCallback(() => ink.exit(), [ink]);

  const nav: Nav = useMemo(
    () => ({
      push: (title, node) =>
        setStack((s) => [...s, { id: nextId.current++, title, node }]),
      pop: () =>
        setStack((s) => {
          if (s.length <= 1) {
            setImmediate(quit);
            return s;
          }
          return s.slice(0, -1);
        }),
      replace: (title, node) =>
        setStack((s) => [
          ...s.slice(0, -1),
          { id: nextId.current++, title, node },
        ]),
      toast: (text, kind = 'info') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ text, kind });
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
        toastTimer.current.unref?.();
      },
      askPassword: (prompt, retry) =>
        new Promise((resolve) =>
          setDialog({ kind: 'password', prompt, retry, resolve }),
        ),
      confirm: (message) =>
        new Promise((resolve) =>
          setDialog({ kind: 'confirm', message, resolve }),
        ),
      quit,
    }),
    [quit],
  );

  const bodyRows = Math.max(8, rows - 2);
  const state: AppState = useMemo(
    () => ({ ocho, nav, lang, t, cols: columns, bodyRows }),
    [ocho, nav, lang, t, columns, bodyRows],
  );

  const topTyping = top ? typing[top.id] === true : false;
  const topHints = (top && hints[top.id]) || [];

  // Ctrl-C luôn thoát, kể cả khi đang gõ.
  useInput((input, k) => {
    if (k.ctrl && input === 'c') quit();
  });

  useInput(
    (input, k) => {
      if (input === '?') {
        nav.push(t('help.title'), <Help hints={topHints} />);
      } else if (input === 'L') {
        const next: Lang = lang === 'en' ? 'vi' : 'en';
        void ocho.setLang(next).then(() => setLang(next));
      } else if (input === 'q' || k.escape) {
        if (stack.length > 1 || input === 'q') nav.pop();
      }
    },
    { isActive: dialog === null && !topTyping },
  );

  const globalHints: Hint[] = [
    { key: '?', label: t('hint.help') },
    { key: 'L', label: lang === 'en' ? 'Tiếng Việt' : 'English' },
    {
      key: stack.length > 1 ? 'Esc' : 'q',
      label: t(stack.length > 1 ? 'hint.back' : 'hint.quit'),
    },
  ];

  const crumbs = stack.map((e) => e.title).join(' › ');
  return (
    <AppContext.Provider value={state}>
      <Box flexDirection="column" width={columns} height={rows}>
        <Box width={columns} justifyContent="space-between">
          <Text inverse bold wrap="truncate">
            {' ocho '}
          </Text>
          <Box flexGrow={1} paddingX={1}>
            <Text bold wrap="truncate-start">
              {crumbs}
            </Text>
          </Box>
          <Text color="gray">{`${lang.toUpperCase()} `}</Text>
        </Box>
        <Box flexDirection="column" height={bodyRows} overflow="hidden">
          {stack.map((e) => {
            const isTop = e === top && dialog === null;
            return (
              <Box
                key={e.id}
                display={isTop ? 'flex' : 'none'}
                flexDirection="column"
                height={bodyRows}
              >
                <ScreenContext.Provider value={screenState(e.id, isTop)}>
                  {e.node}
                </ScreenContext.Provider>
              </Box>
            );
          })}
          {dialog?.kind === 'password' ? (
            <PasswordDialog
              dialog={dialog}
              t={t}
              close={() => setDialog(null)}
            />
          ) : null}
          {dialog?.kind === 'confirm' ? (
            <ConfirmDialog dialog={dialog} close={() => setDialog(null)} />
          ) : null}
        </Box>
        <Footer
          hints={
            dialog
              ? [
                  { key: '⏎', label: t('hint.ok') },
                  { key: 'Esc', label: t('hint.cancel') },
                ]
              : topHints
          }
          global={dialog || topTyping ? [] : globalHints}
          toast={toast}
        />
      </Box>
    </AppContext.Provider>
  );
}
