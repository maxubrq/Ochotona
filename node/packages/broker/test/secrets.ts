// Hook quét bí mật cho cả bộ test: mọi sự kiện, dòng nhật ký, kết quả và lỗi
// mà reader của test đưa ra đều đi qua `track`; `test/setup.ts` quét chúng
// sau mỗi file test.

import type { BrokerReader, ReadOptions } from '../src/index';

/** Mật khẩu dùng chung cho mọi reader trong test. */
export const TEST_PASSWORD = 's3cret-Pa55word';
export const TEST_USER = 'ocho';

const sink: unknown[] = [];

export function track<T>(v: T): T {
  sink.push(v);
  return v;
}

function stringify(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}\n${v.stack ?? ''}`;
  try {
    return (
      JSON.stringify(v, (_k, x) => (x instanceof Error ? stringify(x) : x)) ??
      ''
    );
  } catch {
    return String(v);
  }
}

/** Những bí mật lộ ra trong `values`. */
export function findSecrets(
  values: readonly unknown[],
  password = TEST_PASSWORD,
): string[] {
  const needles = [
    password,
    Buffer.from(`${TEST_USER}:${password}`).toString('base64'),
  ];
  const found: string[] = [];
  for (const v of values) {
    const s = stringify(v);
    for (const n of needles) if (s.includes(n)) found.push(n);
    if (/authorization/i.test(s)) found.push('authorization');
  }
  return found;
}

export function drainSink(): unknown[] {
  return sink.splice(0, sink.length);
}

function tapOpts(opts: ReadOptions = {}): ReadOptions {
  return {
    ...opts,
    onEvent: (e) => {
      track(e);
      opts.onEvent?.(e);
    },
    onDebug: (l) => {
      track(l);
      opts.onDebug?.(l);
    },
  };
}

async function tapCall<T>(p: () => Promise<T>): Promise<T> {
  try {
    return track(await p());
  } catch (e) {
    throw track(e);
  }
}

/** Bọc reader để mọi đầu ra của nó vào sink. */
export function tracked(r: BrokerReader): BrokerReader {
  return {
    identify: (plan, opts) => tapCall(() => r.identify(plan, tapOpts(opts))),
    read: (plan, id, opts) => tapCall(() => r.read(plan, id, tapOpts(opts))),
    stats: () => track(r.stats()),
    close: () => r.close(),
  };
}
