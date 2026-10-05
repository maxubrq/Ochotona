// Trạng thái dùng chung của TUI qua React context: cầu nối CLI, ngôn ngữ, điều
// hướng (chồng màn hình), thông báo, hộp thoại; và trạng thái của từng màn hình
// (có đang ở trên cùng không, gợi ý phím, có đang gõ chữ không).

import type { Lang } from '@ochotona/cli/api';
import { createContext, useContext, useEffect } from 'react';
import type React from 'react';
import type { T } from './i18n';
import type { AskPassword, Ocho } from './ocho';

export interface Hint {
  /** Phím như người dùng thấy: `↑↓`, `⏎`, `/`. */
  readonly key: string;
  readonly label: string;
}

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Nav {
  push(title: string, node: React.ReactNode): void;
  /** Về màn hình trước; ở màn hình gốc thì thoát. */
  pop(): void;
  /** Thay màn hình trên cùng (form xong thì sang kết quả). */
  replace(title: string, node: React.ReactNode): void;
  toast(text: string, kind?: ToastKind): void;
  askPassword: AskPassword;
  confirm(message: string): Promise<boolean>;
  quit(): void;
}

export interface AppState {
  readonly ocho: Ocho;
  readonly nav: Nav;
  readonly lang: Lang;
  readonly t: T;
  readonly cols: number;
  /** Số dòng cho thân màn hình (trừ dòng tiêu đề và dòng gợi ý). */
  readonly bodyRows: number;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const s = useContext(AppContext);
  if (!s) throw new Error('useApp outside <App>');
  return s;
}

export interface ScreenState {
  /** Màn hình đang ở trên cùng và không có hộp thoại: nhận phím. */
  readonly active: boolean;
  setHints(hints: readonly Hint[]): void;
  /** Đang gõ chữ: phím tắt chung (q, ?, L, Esc) tạm tắt. */
  setTyping(typing: boolean): void;
}

export const ScreenContext = createContext<ScreenState>({
  active: true,
  setHints: () => {},
  setTyping: () => {},
});

export function useScreen(): ScreenState {
  return useContext(ScreenContext);
}

/** Gợi ý phím của màn hình, hiện ở dòng cuối. */
export function useHints(hints: readonly Hint[]): void {
  const { setHints } = useScreen();
  const key = JSON.stringify(hints);
  useEffect(() => setHints(hints), [key, setHints]);
}
