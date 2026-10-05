// Thành phần dùng chung: hộp có tiêu đề, danh sách có dòng tiêu đề nhóm (mục
// được tô sáng báo ra ngoài để khung bên cạnh hiện chi tiết), vùng chữ cuộn,
// form nhiều ô. Ô nhập chữ, mật khẩu, vòng quay lấy từ @inkjs/ui.

import { PasswordInput, TextInput } from '@inkjs/ui';
import { Box, Text, useInput, type Key } from 'ink';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import wrapAnsi from 'wrap-ansi';
import { useScreen } from './context';

// ------------------------------------------------------------- hộp

export function Pane(props: {
  readonly title: string;
  readonly focused?: boolean;
  readonly width?: number | string;
  readonly height: number;
  readonly status?: string;
  readonly children: React.ReactNode;
}) {
  const color = props.focused ? 'cyan' : 'gray';
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      width={props.width}
      flexGrow={props.width === undefined ? 1 : 0}
      flexShrink={0}
      height={props.height}
      paddingX={1}
      overflow="hidden"
    >
      <Box justifyContent="space-between">
        <Text
          bold={props.focused}
          color={props.focused ? 'cyan' : undefined}
          wrap="truncate"
        >
          {props.title}
        </Text>
        {props.status ? <Text color="gray">{props.status}</Text> : null}
      </Box>
      {props.children}
    </Box>
  );
}

/** Chiều cao dành cho nội dung trong `Pane` cao `h`: trừ viền và dòng tiêu đề. */
export const paneBody = (h: number) => Math.max(1, h - 3);
/** Bề rộng nội dung trong `Pane` rộng `w`: trừ viền và lề. */
export const paneInner = (w: number) => Math.max(10, w - 4);

// ------------------------------------------------------------- danh sách

export type Row<T> =
  | { readonly kind: 'header'; readonly text: string; readonly color?: string }
  | {
      readonly kind: 'item';
      /** Khoá ổn định để giữ lựa chọn khi danh sách được dựng lại. */
      readonly key: string;
      readonly text: string;
      readonly hint?: string;
      readonly color?: string;
      readonly value: T;
    };

type Item<T> = Extract<Row<T>, { kind: 'item' }>;

/** Phím di chuyển trong danh sách hoặc vùng cuộn: ↑↓, j k, PgUp PgDn, Home End. */
export function moveDelta(
  input: string,
  key: Key,
  page: number,
): number | 'first' | 'last' | null {
  if (key.upArrow || input === 'k') return -1;
  if (key.downArrow || input === 'j') return 1;
  if (key.pageUp) return -page;
  if (key.pageDown) return page;
  if (key.home || input === 'g') return 'first';
  if (key.end || input === 'G') return 'last';
  return null;
}

export function ListView<T>(props: {
  readonly rows: readonly Row<T>[];
  readonly height: number;
  /** Nhận phím ↑↓. */
  readonly active: boolean;
  /** Mục tô sáng đảo màu (khung đang được chọn) hay chỉ đậm. */
  readonly focused?: boolean;
  readonly onChange?: (value: T, key: string) => void;
  readonly onSubmit?: (value: T, key: string) => void;
  /** Mục chọn lúc đầu. */
  readonly initialKey?: string;
}) {
  const { rows, height } = props;
  const items = useMemo(
    () =>
      rows
        .map((r, i) => ({ r, i }))
        .filter((x): x is { r: Item<T>; i: number } => x.r.kind === 'item'),
    [rows],
  );
  const [key, setKey] = useState<string | null>(props.initialKey ?? null);
  const offset = useRef(0);
  const at = Math.max(
    0,
    items.findIndex((x) => x.r.key === key),
  );
  const current = items[at];

  // Báo mục đang tô sáng khi nó đổi, hoặc khi tập mục đổi dưới chân (lọc,
  // tải lại). Chỉ theo khoá: người gọi dựng lại `rows` mỗi lần render cũng
  // không làm effect chạy vô hạn.
  const currentKey = current?.r.key;
  const signature = items.map((x) => x.r.key).join('\u0000');
  useEffect(() => {
    if (current) props.onChange?.(current.r.value, current.r.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, signature]);

  useInput(
    (input, k) => {
      if (k.return && current) {
        props.onSubmit?.(current.r.value, current.r.key);
        return;
      }
      const d = moveDelta(input, k, Math.max(1, height - 1));
      if (d === null || items.length === 0) return;
      const next =
        d === 'first'
          ? 0
          : d === 'last'
            ? items.length - 1
            : Math.max(0, Math.min(items.length - 1, at + d));
      setKey(items[next].r.key);
    },
    { isActive: props.active },
  );

  // Cuộn để mục chọn luôn hiện, kèm dòng tiêu đề ngay trên nó.
  if (current) {
    const top =
      current.i > 0 && rows[current.i - 1].kind === 'header'
        ? current.i - 1
        : current.i;
    if (top < offset.current) offset.current = top;
    if (current.i >= offset.current + height)
      offset.current = current.i - height + 1;
  }
  offset.current = Math.max(0, Math.min(offset.current, rows.length - height));

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {rows.slice(offset.current, offset.current + height).map((r, n) => {
        const i = offset.current + n;
        if (r.kind === 'header')
          return (
            <Text key={`h${i}`} bold color={r.color} wrap="truncate">
              {r.text}
            </Text>
          );
        const selected = current?.i === i;
        // Một Text duy nhất: phần chính giữ nguyên, gợi ý xám bị cắt trước.
        return (
          <Text key={r.key} wrap="truncate">
            <Text
              inverse={selected && props.focused !== false}
              bold={selected}
              color={selected ? undefined : r.color}
            >
              {selected ? '› ' : '  '}
              {r.text}
            </Text>
            {r.hint ? <Text color="gray">{`  ${r.hint}`}</Text> : null}
          </Text>
        );
      })}
    </Box>
  );
}

/** `3/12` cho góc khung. */
export function listStatus<T>(rows: readonly Row<T>[], key: string | null) {
  const items = rows.filter((r): r is Item<T> => r.kind === 'item');
  if (items.length === 0) return '';
  const at = items.findIndex((r) => r.key === key);
  return `${Math.max(0, at) + 1}/${items.length}`;
}

// ------------------------------------------------------------- vùng chữ cuộn

/**
 * Gói cứng các dòng dài hơn `width` (giữ màu ANSI): lệnh `rabbitmqadmin` dài
 * xuống dòng thay vì bị cắt mất.
 */
export function hardWrap(lines: readonly string[], width: number): string[] {
  return lines.flatMap((l) =>
    l === ''
      ? ['']
      : wrapAnsi(l, width, { hard: true, wordWrap: false, trim: false }).split(
          '\n',
        ),
  );
}

/**
 * Các dòng đã render sẵn (có thể có màu ANSI từ CLI), cuộn bằng ↑↓ khi
 * `active`. `resetKey` đổi thì về đầu. Có `width` thì dòng dài được gói cứng.
 */
export function ScrollText(props: {
  readonly lines: readonly string[];
  readonly width?: number;
  readonly height: number;
  readonly active: boolean;
  readonly resetKey?: string;
  readonly onStatus?: (status: string) => void;
}) {
  const { height } = props;
  const lines = useMemo(
    () => (props.width ? hardWrap(props.lines, props.width) : props.lines),
    [props.lines, props.width],
  );
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [props.resetKey]);
  const max = Math.max(0, lines.length - height);
  const at = Math.min(offset, max);

  useInput(
    (input, k) => {
      const d = moveDelta(input, k, Math.max(1, height - 1));
      if (d === null) {
        if (input === ' ') setOffset(Math.min(max, at + height - 1));
        return;
      }
      setOffset(
        d === 'first'
          ? 0
          : d === 'last'
            ? max
            : Math.max(0, Math.min(max, at + d)),
      );
    },
    { isActive: props.active },
  );

  const status =
    lines.length > height
      ? `${at + 1}-${Math.min(lines.length, at + height)}/${lines.length}`
      : '';
  useEffect(() => props.onStatus?.(status), [status]);

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {lines.slice(at, at + height).map((l, i) => (
        <Text key={i} wrap="truncate">
          {l === '' ? ' ' : l}
        </Text>
      ))}
    </Box>
  );
}

// ------------------------------------------------------------- form

export type Field =
  | {
      readonly name: string;
      readonly kind: 'text' | 'password';
      readonly label: string;
      readonly initial?: string;
      readonly placeholder?: string;
      readonly hint?: string;
      readonly required?: boolean;
    }
  | {
      readonly name: string;
      readonly kind: 'toggle';
      readonly label: string;
      readonly initial?: boolean;
      readonly hint?: string;
    }
  | {
      readonly name: string;
      readonly kind: 'choice';
      readonly label: string;
      readonly choices: readonly {
        readonly value: string;
        readonly label: string;
      }[];
      readonly initial?: string;
      readonly hint?: string;
    };

export type FormValues = Record<string, string | boolean>;

function initialValues(fields: readonly Field[]): FormValues {
  const v: FormValues = {};
  for (const f of fields)
    v[f.name] =
      f.kind === 'toggle'
        ? (f.initial ?? false)
        : f.kind === 'choice'
          ? (f.initial ?? f.choices[0]?.value ?? '')
          : (f.initial ?? '');
  return v;
}

/**
 * Form dọc: ↑↓ hoặc Tab chuyển ô, Space bật tắt, ←→ chọn, Enter ở ô cuối hoặc
 * nút gửi để gửi, Esc để huỷ. `validate` trả lỗi theo tên ô.
 */
export function Form(props: {
  readonly fields: readonly Field[];
  readonly submitLabel: string;
  readonly onSubmit: (values: FormValues) => void;
  readonly onCancel: () => void;
  readonly validate?: (values: FormValues) => Record<string, string>;
  readonly labels: {
    readonly yes: string;
    readonly no: string;
    readonly required: string;
  };
  readonly busy?: boolean;
}) {
  const { active, setTyping } = useScreen();
  const [values, setValues] = useState<FormValues>(() =>
    initialValues(props.fields),
  );
  const [focus, setFocus] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submitIndex = props.fields.length;
  const field = props.fields[focus] as Field | undefined;
  const typing = field?.kind === 'text' || field?.kind === 'password';

  // Đang ở ô chữ: phím chữ thuộc về ô, phím tắt chung tạm tắt.
  useEffect(() => {
    setTyping(active);
    return () => setTyping(false);
  }, [active, setTyping]);

  const set = (name: string, v: string | boolean) =>
    setValues((old) => ({ ...old, [name]: v }));

  const submit = () => {
    const errs = props.validate?.(values) ?? {};
    for (const f of props.fields)
      if (
        (f.kind === 'text' || f.kind === 'password') &&
        f.required &&
        String(values[f.name]).trim() === ''
      )
        errs[f.name] ??= props.labels.required;
    setErrors(errs);
    const first = props.fields.findIndex((f) => errs[f.name]);
    if (first >= 0) setFocus(first);
    else props.onSubmit(values);
  };

  const next = () =>
    focus >= submitIndex
      ? submit()
      : setFocus(Math.min(submitIndex, focus + 1));

  useInput(
    (input, k) => {
      if (props.busy) return;
      if (k.escape) return props.onCancel();
      if (k.upArrow || (k.tab && k.shift))
        return setFocus(Math.max(0, focus - 1));
      if (k.downArrow || k.tab)
        return setFocus(Math.min(submitIndex, focus + 1));
      if (k.return && !typing) return next();
      if (
        field?.kind === 'toggle' &&
        (input === ' ' || k.leftArrow || k.rightArrow)
      )
        return set(field.name, !values[field.name]);
      if (
        field?.kind === 'choice' &&
        (k.leftArrow || k.rightArrow || input === ' ')
      ) {
        const at = field.choices.findIndex(
          (c) => c.value === values[field.name],
        );
        const n = field.choices.length;
        const d = k.leftArrow ? -1 : 1;
        set(field.name, field.choices[(at + d + n) % n].value);
      }
    },
    { isActive: active },
  );

  // Cột nhãn: `› ` + nhãn dài nhất + hai khoảng trắng.
  const labelWidth = Math.max(...props.fields.map((f) => f.label.length)) + 4;
  return (
    <Box flexDirection="column">
      {props.fields.map((f, i) => {
        const focused = i === focus && active;
        const err = errors[f.name];
        let control: React.ReactNode;
        if (f.kind === 'text' || f.kind === 'password') {
          if (focused) {
            const Input = f.kind === 'password' ? PasswordInput : TextInput;
            control = (
              <Input
                key={`${f.name}-${focus}`}
                {...(f.kind === 'text'
                  ? { defaultValue: String(values[f.name]) }
                  : {})}
                placeholder={f.placeholder ?? ''}
                isDisabled={props.busy}
                onChange={(v: string) => set(f.name, v)}
                onSubmit={() => next()}
              />
            );
          } else {
            const v = String(values[f.name]);
            control =
              v === '' ? (
                <Text color="gray">{f.placeholder ?? ''}</Text>
              ) : (
                <Text>{f.kind === 'password' ? '•'.repeat(v.length) : v}</Text>
              );
          }
        } else if (f.kind === 'toggle') {
          const on = values[f.name] === true;
          control = (
            <Text color={focused ? 'cyan' : undefined}>
              {on ? '[x] ' : '[ ] '}
              {on ? props.labels.yes : props.labels.no}
            </Text>
          );
        } else {
          const choices = (f as Extract<Field, { kind: 'choice' }>).choices;
          control = (
            <Text>
              {choices.map((c, ci) => {
                const on = c.value === values[f.name];
                return (
                  <Text
                    key={c.value}
                    inverse={on && focused}
                    bold={on}
                    color={on ? 'cyan' : 'gray'}
                  >
                    {ci > 0 ? '  ' : ''}
                    {on ? `‹${c.label}›` : ` ${c.label} `}
                  </Text>
                );
              })}
            </Text>
          );
        }
        return (
          <Box key={f.name} flexDirection="column" marginBottom={0}>
            <Box>
              <Box width={labelWidth} flexShrink={0}>
                <Text bold={focused} color={focused ? 'cyan' : undefined}>
                  {focused ? '› ' : '  '}
                  {f.label}
                </Text>
              </Box>
              <Box flexGrow={1}>{control}</Box>
            </Box>
            {err ? (
              <Box marginLeft={labelWidth}>
                <Text color="red">{err}</Text>
              </Box>
            ) : null}
            {focused && f.hint ? (
              <Box marginLeft={labelWidth}>
                <Text color="gray">{f.hint}</Text>
              </Box>
            ) : null}
          </Box>
        );
      })}
      <Box marginTop={1} marginLeft={labelWidth}>
        <Text
          inverse={focus === submitIndex && active}
          bold
          color={focus === submitIndex ? 'cyan' : undefined}
        >
          {` ${props.submitLabel} `}
        </Text>
      </Box>
    </Box>
  );
}

/** Các dòng chữ đã render (từ CLI), không cuộn. */
export function Lines(props: {
  readonly lines: readonly string[];
  readonly color?: string;
}) {
  return (
    <Box flexDirection="column">
      {props.lines.map((l, i) => (
        <Text key={i} color={props.color} wrap="wrap">
          {l === '' ? ' ' : l}
        </Text>
      ))}
    </Box>
  );
}
