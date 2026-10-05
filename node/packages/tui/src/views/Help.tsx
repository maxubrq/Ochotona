// Trợ giúp: phím của màn hình vừa rời, phím chung, và vài lời khuyên. Mọi việc
// TUI làm đều có lệnh `ocho` tương đương, in mờ trên đầu mỗi kết quả.

import { Box, Text } from 'ink';
import React from 'react';
import { type Hint, useApp, useHints } from '../context';
import { Pane } from '../ui';

export function Help(props: { readonly hints: readonly Hint[] }) {
  const { t, bodyRows } = useApp();
  useHints([]);
  const global: Hint[] = [
    { key: '?', label: t('help.key.help') },
    { key: 'L', label: t('help.key.lang') },
    { key: 'Esc', label: t('help.key.back') },
    { key: 'q', label: t('help.key.quit') },
    { key: 'Ctrl-C', label: t('help.key.exit') },
  ];
  const keyWidth =
    Math.max(...[...props.hints, ...global].map((h) => h.key.length)) + 3;
  const table = (hs: readonly Hint[]) =>
    hs.map((h, i) => (
      <Box key={i}>
        <Box width={keyWidth} flexShrink={0}>
          <Text bold color="cyan">
            {h.key}
          </Text>
        </Box>
        <Text>{h.label}</Text>
      </Box>
    ));
  return (
    <Pane title={t('help.title')} focused height={bodyRows}>
      {props.hints.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>{t('help.this_screen')}</Text>
          {table(props.hints)}
        </Box>
      ) : null}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{t('help.everywhere')}</Text>
        {table(global)}
      </Box>
      <Text bold>{t('help.tips')}</Text>
      <Text wrap="wrap">{t('help.tip1')}</Text>
      <Text wrap="wrap">{t('help.tip2')}</Text>
      <Text wrap="wrap">{t('help.tip3')}</Text>
    </Pane>
  );
}
