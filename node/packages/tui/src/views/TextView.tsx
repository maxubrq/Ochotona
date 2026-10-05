// Xem một khối chữ của CLI (explain, context show, kết quả import…), cuộn được.
// `load` chạy lệnh và trả các dòng; trong lúc chờ có vòng quay, lỗi in như CLI.

import { Spinner } from '@inkjs/ui';
import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';
import { useApp, useHints, useScreen } from '../context';
import { Cancelled } from '../ocho';
import { Pane, ScrollText, paneBody, paneInner } from '../ui';

export interface Loaded {
  readonly lines: readonly string[];
  /** Lệnh `ocho …` tương đương, in mờ dưới tiêu đề. */
  readonly command?: string;
  /** Cảnh báo của CLI (stderr). */
  readonly warnings?: readonly string[];
}

export function TextView(props: {
  readonly title: string;
  readonly load: (width: number, signal: AbortSignal) => Promise<Loaded>;
}) {
  const { ocho, nav, t, cols, bodyRows, lang } = useApp();
  const { active } = useScreen();
  const [state, setState] = useState<
    | { readonly kind: 'loading' }
    | { readonly kind: 'done'; readonly loaded: Loaded }
    | { readonly kind: 'error'; readonly lines: string[] }
  >({ kind: 'loading' });
  const [status, setStatus] = useState('');
  const inner = paneInner(cols);

  useEffect(() => {
    const ac = new AbortController();
    setState({ kind: 'loading' });
    props.load(inner, ac.signal).then(
      (loaded) => setState({ kind: 'done', loaded }),
      (e) => {
        if (e instanceof Cancelled) nav.pop();
        else setState({ kind: 'error', lines: ocho.errorLines(e, inner) });
      },
    );
    return () => ac.abort();
    // Tải lại khi đổi ngôn ngữ hay bề rộng: chữ do CLI render theo cả hai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, inner]);

  useHints(
    state.kind === 'done'
      ? [{ key: '↑↓ PgUp PgDn', label: t('hint.scroll') }]
      : [],
  );

  if (state.kind === 'loading')
    return (
      <Box padding={1}>
        <Spinner label={t('common.loading')} />
      </Box>
    );
  const loaded = state.kind === 'done' ? state.loaded : null;
  const lines = [
    ...(loaded?.warnings ?? []),
    ...(loaded?.warnings?.length ? [''] : []),
    ...(loaded ? loaded.lines : state.kind === 'error' ? state.lines : []),
  ];
  const height = bodyRows - (loaded?.command ? 1 : 0);
  return (
    <Box flexDirection="column">
      {loaded?.command ? (
        <Text color="gray" wrap="truncate">
          {` $ ${loaded.command}`}
        </Text>
      ) : null}
      <Pane title={props.title} focused height={height} status={status}>
        <ScrollText
          lines={lines}
          width={inner}
          height={paneBody(height)}
          active={active}
          onStatus={setStatus}
        />
      </Pane>
    </Box>
  );
}
