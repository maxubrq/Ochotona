// Hàm nạp cho `TextView`: chạy `explain` của CLI và trả các dòng nó in.

import { explain } from '@ochotona/cli/api';
import type { Nav } from '../context';
import type { Ocho, Target } from '../ocho';
import type { Loaded } from './TextView';

/** Mã luật, điểm mù, mã chẩn đoán: không cần broker. */
export function explainRuleLoader(ocho: Ocho, code: string) {
  return async (width: number): Promise<Loaded> => {
    const argv = ['explain', code];
    const r = await ocho.run(argv, { width }, explain);
    return { lines: r.out, command: ocho.command(argv), warnings: r.err };
  };
}

/**
 * Queue, exchange, flow, hoặc tên trơn (`kind` là `auto`): đọc broker (tối đa
 * sáu request), hỏi mật khẩu nếu cần.
 */
export function explainObjectLoader(
  ocho: Ocho,
  nav: Nav,
  target: Target,
  kind: 'queue' | 'exchange' | 'flow' | 'auto',
  name: string,
  vhost: string,
) {
  return async (width: number, signal: AbortSignal): Promise<Loaded> => {
    const what = kind === 'auto' ? [name] : [kind, name];
    const argv = [
      'explain',
      ...ocho.targetArgs(target),
      ...what,
      ...(kind === 'flow' || vhost === '/' ? [] : ['--vhost', vhost]),
    ];
    const r = await ocho.run(
      argv,
      { width, signal, target, ask: nav.askPassword },
      explain,
    );
    return { lines: r.out, command: ocho.command(argv), warnings: r.err };
  };
}
