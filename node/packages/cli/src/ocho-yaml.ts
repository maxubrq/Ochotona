// Tìm và nạp `ocho.yaml` cho `doctor` và `explain`. `--file` mặc định là
// `./ocho.yaml` nếu file đó tồn tại; `--no-file` bỏ qua hoàn toàn.

import { type LocatedDiag, formatGnu, loadOchoYaml } from '@ochotona/compiler';
import type { Desired, Instant } from '@ochotona/model';
import { resolve } from 'node:path';
import { bool, str } from './args';
import { CliError, usage } from './errors';
import type { Session } from './session';

export interface OchoFile {
  /** Đường dẫn như người dùng viết, cho chẩn đoán. */
  readonly display: string;
  readonly path: string;
}

const exists = async (s: Session, path: string) =>
  s.io.fs.stat(path).then(
    (st) => st.isFile(),
    () => false,
  );

/** File sẽ đọc, hoặc `null`. `--file` trỏ tới file không có thì exit 4. */
export async function findOchoFile(s: Session): Promise<OchoFile | null> {
  if (bool(s.args, 'no-file')) return null;
  const flag = str(s.args, 'file');
  if (flag !== undefined) {
    const path = resolve(s.io.cwd, flag);
    if (!(await exists(s, path))) throw usage('file.not_found', { file: flag });
    return { display: flag, path };
  }
  const path = resolve(s.io.cwd, 'ocho.yaml');
  return (await exists(s, path)) ? { display: 'ocho.yaml', path } : null;
}

function printDiagnostics(s: Session, ds: readonly LocatedDiag[]): void {
  for (const d of ds) s.io.stderr.write(`${formatGnu(d, s.lang)}\n`);
}

/**
 * Đọc và dựng `Desired`. Lỗi YP hoặc Y thì exit 4 kèm chẩn đoán dạng GNU;
 * cảnh báo YW, Y10 thì in lên stderr và chạy tiếp.
 */
export async function loadDesired(
  s: Session,
  file: OchoFile,
  now: Instant,
): Promise<Desired> {
  let text: string;
  try {
    text = (await s.io.fs.readFile(file.path)).toString('utf8');
  } catch (e) {
    throw usage('file.unreadable', {
      file: file.display,
      detail: (e as Error).message,
    });
  }
  const loaded = loadOchoYaml(text, now, file.display);
  if (!loaded.ok) {
    const errors = loaded.error.filter((d) => d.severity === 'error');
    const first = errors[0] ?? loaded.error[0];
    throw new CliError({
      code: first.code,
      exitCode: 4,
      msg: {
        key: 'file.invalid',
        params: { file: file.display, count: errors.length },
      },
      next: { key: 'file.invalid.next', params: { file: file.display } },
      diagnostics: loaded.error,
    });
  }
  printDiagnostics(s, loaded.value.warnings);
  s.debug(`read ${file.display}`);
  return loaded.value.desired;
}
