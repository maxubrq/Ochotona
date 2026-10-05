// Chữ giao diện riêng của TUI: tiêu đề màn hình, gợi ý phím, nhãn form. Văn bản
// về broker, luật, lỗi đều lấy từ CLI và spec, không dịch lại ở đây. Cùng cú
// pháp khuôn câu với CLI (`{tên}`, số nhiều), qua cùng hàm `translator`.

import { type Lang, type Params, translator } from '@ochotona/cli/api';
import en from './en.json';
import vi from './vi.json';

export const MESSAGES: Readonly<
  Record<Lang, Readonly<Record<string, string>>>
> = { en, vi };

export type T = (key: string, params?: Params) => string;

const translate = translator(MESSAGES, 'tui');

export function bindT(lang: Lang): T {
  return (key, params) => translate(lang, key, params);
}
