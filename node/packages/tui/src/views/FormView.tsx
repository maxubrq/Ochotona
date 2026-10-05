// Một màn hình form: lời dẫn, các ô, nút gửi. `onSubmit` chạy bất đồng bộ; lỗi
// của CLI hiện ngay dưới form (đủ ba dòng D5), form giữ nguyên để sửa rồi gửi lại.

import { Spinner } from '@inkjs/ui';
import { Box, Text } from 'ink';
import React, { useState } from 'react';
import { useApp, useHints } from '../context';
import { Cancelled } from '../ocho';
import { type Field, Form, type FormValues, Pane } from '../ui';

export function FormView(props: {
  readonly title: string;
  readonly intro?: string;
  readonly fields: readonly Field[];
  readonly submitLabel: string;
  readonly onSubmit: (values: FormValues) => Promise<void> | void;
  readonly onCancel?: () => void;
  readonly validate?: (values: FormValues) => Record<string, string>;
}) {
  const { ocho, nav, t, cols, bodyRows } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string[]>([]);
  useHints([
    { key: '↑↓ Tab', label: t('hint.field') },
    { key: 'Space ←→', label: t('hint.toggle') },
    { key: '⏎', label: t('hint.next_submit') },
    { key: 'Esc', label: t('hint.cancel') },
  ]);

  const submit = async (values: FormValues) => {
    setBusy(true);
    setError([]);
    try {
      await props.onSubmit(values);
    } catch (e) {
      if (!(e instanceof Cancelled)) setError(ocho.errorLines(e, cols - 6));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pane title={props.title} focused height={bodyRows}>
      {props.intro ? (
        <Box marginBottom={1}>
          <Text color="gray" wrap="wrap">
            {props.intro}
          </Text>
        </Box>
      ) : null}
      <Form
        fields={props.fields}
        submitLabel={props.submitLabel}
        onSubmit={(v) => void submit(v)}
        onCancel={props.onCancel ?? (() => nav.pop())}
        {...(props.validate ? { validate: props.validate } : {})}
        labels={{
          yes: t('common.yes'),
          no: t('common.no'),
          required: t('form.required'),
        }}
        busy={busy}
      />
      {busy ? (
        <Box marginTop={1}>
          <Spinner label={t('common.working')} />
        </Box>
      ) : null}
      {error.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          {error.map((l, i) => (
            <Text key={i} wrap="wrap">
              {l}
            </Text>
          ))}
        </Box>
      ) : null}
    </Pane>
  );
}
