// `ocho import`: lấy topology (broker hoặc definitions.json), chạy phiên import
// của compiler, hỏi qua terminal, ghi `ocho.yaml` nguyên tử. Không có "lưu một
// phần": Ctrl-C hay EOF giữa phiên thì không ghi gì.

import {
  type Answer,
  type ImportResult,
  type ImportSession,
  type Question,
  createImportSession,
  loadOchoYaml,
} from '@ochotona/compiler';
import {
  type Actual,
  type Instant,
  type Tolerance,
  planRead,
  actualFromDefinitions,
  topologyFromActual,
} from '@ochotona/model';
import { type I18nKey, format } from '@ochotona/spec';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { bool, str } from '../args';
import {
  identify,
  limitsOf,
  openReader,
  readActual,
  readOptions,
} from '../connect';
import { readContexts } from '../contexts';
import { CliError, type ExitCode, Interrupted, diag, usage } from '../errors';
import { fmtNumber } from '../i18n';
import { LineReader } from '../prompt/terminal';
import { writeJson } from '../render/json';
import type { Session } from '../session';
import { resolveTarget } from '../target';
import { TOOL_VERSION } from '../version';

const TOPOLOGY_COLLECTIONS = [
  'exchanges',
  'queues',
  'bindings',
  'policies',
  'operatorPolicies',
] as const;

const sha256 = (s: string | null) =>
  s === null ? 'none' : createHash('sha256').update(s).digest('hex');

interface OldFile {
  readonly text: string;
  readonly mode: number;
}

async function readOld(s: Session, path: string): Promise<OldFile | null> {
  try {
    const [buf, st] = await Promise.all([
      s.io.fs.readFile(path),
      s.io.fs.stat(path),
    ]);
    return { text: buf.toString('utf8'), mode: st.mode & 0o777 };
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') return null;
    throw usage('file.unreadable', {
      file: path,
      detail: (e as Error).message,
    });
  }
}

async function topologySource(
  s: Session,
  now: Instant,
): Promise<{ actual: Actual; name: string }> {
  const from = str(s.args, 'from');
  if (from) {
    let text: string;
    try {
      text = (await s.io.fs.readFile(resolve(s.io.cwd, from))).toString('utf8');
    } catch (e) {
      throw usage('file.unreadable', {
        file: from,
        detail: (e as Error).message,
      });
    }
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch (e) {
      throw usage('import.bad_definitions', {
        file: from,
        detail: (e as Error).message,
      });
    }
    const r = actualFromDefinitions(doc, { contextName: from, at: now });
    if (!r.ok)
      throw usage('import.bad_definitions', {
        file: from,
        detail: r.error.detail,
      });
    return { actual: r.value, name: from };
  }
  const contexts = await readContexts(s.io, (e) => s.warn(e));
  const target = await resolveTarget(s, contexts.data);
  const reader = openReader(s, target);
  const limits = limitsOf(s);
  // Kế hoạch đọc cho đường dẫn topology và tốc độ (thống kê của queue).
  const plan = planRead({
    requires: new Set(['vhosts', ...TOPOLOGY_COLLECTIONS] as const),
    prometheus: false,
    scope: { vhosts: 'all' },
  });
  try {
    const opts = readOptions(s, limits);
    const identified = await identify(s, reader, plan, target, opts);
    const actual = await readActual(
      s,
      reader,
      plan,
      identified,
      target.name,
      opts,
    );
    return { actual, name: target.name };
  } finally {
    await reader.close();
  }
}

// ------------------------------------------------------------- hỏi đáp

interface Asker {
  /** Một dòng trả lời; EOF thì ném exit 4. */
  line(prompt: string): Promise<string>;
}

function asker(s: Session, reader: LineReader): Asker {
  return {
    async line(prompt) {
      s.io.stderr.write(prompt);
      const l = await reader.next();
      if (l === null) throw usage('import.eof', {}, { key: 'import.eof.next' });
      return l.trim();
    },
  };
}

const TOLERANCE_KEYS: Readonly<Record<string, Tolerance>> = {
  s: 'strict',
  l: 'loose',
  k: 'undeclared',
};

async function askFamily(
  s: Session,
  ask: Asker,
  session: ImportSession,
  q: Extract<Question, { kind: 'family' }>,
  n: { i: number; total: number },
): Promise<void> {
  const p = q.proposal;
  const err = s.io.stderr;
  err.write(
    `\n${s.t('import.family', {
      i: n.i,
      total: n.total,
      template: p.queueTemplate,
      count: p.members.length,
      members: p.members.join(', '),
    })}\n  ${s.t('import.family_where', {
      exchange: p.exchange,
      key: p.routingKeyTemplate,
      vhost: p.vhost,
    })}\n`,
  );
  for (;;) {
    const a = (
      await ask.line(`  ${s.t('import.family_choices')} `)
    ).toLowerCase();
    if (a === '?') {
      err.write(`  ${s.t('import.family_help')}\n`);
      continue;
    }
    if (a === '' || a === 's') {
      session.answer(q.id, { kind: 'family', action: 'skip' });
      return;
    }
    if (a === 'a') {
      session.answer(q.id, { kind: 'family', action: 'accept' });
      return;
    }
    if (a === 'r') {
      for (;;) {
        const param = await ask.line(`  ${s.t('import.param_name')} `);
        const r = session.answer(q.id, {
          kind: 'family',
          action: 'rename',
          param,
        });
        if (r.ok) return;
        err.write(`  ${s.t('import.param_invalid', { param })}\n`);
      }
    }
    err.write(`  ${s.t('import.retry', { choices: 'a, r, s, ?' })}\n`);
  }
}

async function askMembers(
  s: Session,
  ask: Asker,
  session: ImportSession,
  q: Extract<Question, { kind: 'family_members' }>,
): Promise<void> {
  const err = s.io.stderr;
  err.write(
    `\n${s.t('import.member', { family: q.family, queue: q.queue, member: q.member })}\n`,
  );
  for (;;) {
    const a = (
      await ask.line(`  ${s.t('import.member_choices')} `)
    ).toLowerCase();
    if (a === '?') {
      err.write(`  ${s.t('import.member_help')}\n`);
      continue;
    }
    if (a === '' || a === 's' || a === 'a') {
      session.answer(q.id, {
        kind: 'family_members',
        action: a === 'a' ? 'add' : 'skip',
      });
      return;
    }
    err.write(`  ${s.t('import.retry', { choices: 'a, s, ?' })}\n`);
  }
}

async function askTolerance(
  s: Session,
  ask: Asker,
  session: ImportSession,
  q: Extract<Question, { kind: 'tolerance' }>,
  n: { i: number; total: number },
): Promise<void> {
  const err = s.io.stderr;
  const facts = [
    q.rate
      ? s.t('import.rate', { rate: fmtNumber(s.lang, q.rate.perSecond) })
      : null,
    s.t('import.queues', { count: q.queues }),
  ].filter((x): x is string => x !== null);
  err.write(
    `\n${s.t('import.flow', { i: n.i, total: n.total, name: q.flow.name })}   ${facts.join(' · ')}\n  ${format(s.lang, q.consequence as I18nKey, {})}\n`,
  );
  const answer = (a: Answer) => {
    const r = session.answer(q.id, a);
    if (!r.ok) throw new Error(`import: ${r.error.code} ${r.error.detail}`);
  };
  for (;;) {
    const raw = await ask.line(`  ${s.t('import.tolerance_choices')} `);
    const a = raw === 'A' ? 'A' : raw.toLowerCase();
    if (a === '?') {
      err.write(`  ${s.t('import.tolerance_help')}\n`);
      continue;
    }
    if (a === '')
      return answer({ kind: 'tolerance', value: 'undeclared', scope: 'flow' });
    if (TOLERANCE_KEYS[a])
      return answer({
        kind: 'tolerance',
        value: TOLERANCE_KEYS[a],
        scope: 'flow',
      });
    if (a === 'A' || a === 'a') {
      for (;;) {
        const b = (
          await ask.line(`  ${s.t('import.apply_rest')} `)
        ).toLowerCase();
        if (TOLERANCE_KEYS[b])
          return answer({
            kind: 'tolerance',
            value: TOLERANCE_KEYS[b],
            scope: 'exchange',
          });
        err.write(`  ${s.t('import.retry', { choices: 's, l, k' })}\n`);
      }
    }
    err.write(`  ${s.t('import.retry', { choices: 's, l, k, A, ?' })}\n`);
  }
}

/** Hỏi tới khi phiên hết câu hỏi. Dòng đầu mỗi câu ghi tiến độ (`Flow 7/41`). */
async function interview(s: Session, session: ImportSession): Promise<void> {
  const reader = new LineReader(s.io.stdin, s.io.signal);
  const ask = asker(s, reader);
  const totals = new Map<string, number>();
  const done = new Map<string, number>();
  try {
    for (;;) {
      const qs = session.questions();
      if (qs.length === 0) break;
      const phase = session.phase;
      // Tổng của pha: câu đã hỏi cộng câu còn lại lúc bắt đầu pha.
      if (!totals.has(phase)) {
        totals.set(phase, qs.filter((q) => q.kind !== 'family_members').length);
        done.set(phase, 0);
      }
      const q = qs[0];
      const n = { i: done.get(phase)! + 1, total: totals.get(phase)! };
      if (q.kind === 'family') await askFamily(s, ask, session, q, n);
      else if (q.kind === 'family_members')
        await askMembers(s, ask, session, q);
      else await askTolerance(s, ask, session, q, n);
      if (q.kind !== 'family_members') done.set(phase, n.i);
      // Câu đóng theo cả exchange: tiến độ nhảy theo số câu đã biến mất.
      if (q.kind === 'tolerance') {
        const left = session
          .questions()
          .filter((x) => x.kind === 'tolerance').length;
        done.set(phase, totals.get(phase)! - left);
      }
    }
  } finally {
    reader.close();
  }
}

// ------------------------------------------------------------- ghi

async function writeAtomic(
  s: Session,
  out: { path: string; display: string },
  text: string,
  old: OldFile | null,
): Promise<void> {
  const { fs } = s.io;
  const tmp = `${out.path}.tmp-${s.io.pid}`;
  const fail = (detail: string) =>
    new CliError({
      code: 'FILE',
      exitCode: 4,
      data: 'file_write',
      file: out.display,
      msg: { key: 'file.write_failed', params: { file: out.display, detail } },
    });
  try {
    await fs.fsyncWrite(tmp, text, old ? old.mode : 0o644);
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    throw fail((e as Error).message);
  }
  // Băm lại file cũ: người dùng sửa file trong lúc trả lời thì không ghi đè.
  const now = await readOld(s, out.path);
  if (sha256(now?.text ?? null) !== sha256(old?.text ?? null)) {
    await fs.unlink(tmp).catch(() => {});
    throw new CliError({
      code: 'FILE',
      exitCode: 4,
      data: 'file_write',
      file: out.display,
      msg: { key: 'import.changed', params: { file: out.display } },
      next: { key: 'import.changed.next' },
    });
  }
  try {
    await fs.rename(tmp, out.path);
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    throw fail((e as Error).message);
  }
  s.debug(`wrote ${out.display}`);
}

function finalLine(s: Session, file: string, r: ImportResult): string {
  const counts = { strict: 0, loose: 0, undeclared: 0 };
  for (const f of Object.values(r.desired.flows)) counts[f.tolerance]++;
  const unmanaged = Object.values(r.summary.unmanaged).reduce(
    (a, b) => a + (b ?? 0),
    0,
  );
  return s.t('import.wrote', {
    file,
    flows: r.summary.flows,
    strict: counts.strict,
    loose: counts.loose,
    undeclared: counts.undeclared,
    families: r.summary.families,
    unmanaged,
  });
}

export async function importCmd(s: Session): Promise<ExitCode> {
  const { io } = s;
  const now = new Date(io.clock()).toISOString() as Instant;
  const outDisplay = str(s.args, 'out') ?? 'ocho.yaml';
  const out = { path: resolve(io.cwd, outDisplay), display: outDisplay };

  // 2. File cũ
  const old = await readOld(s, out.path);
  if (old) {
    const loaded = loadOchoYaml(old.text, now, outDisplay);
    if (!loaded.ok)
      throw new CliError({
        code: 'IM2',
        exitCode: 4,
        msg: {
          key: 'diag.IM2.message',
          params: { reason: s.t('import.invalid_file') },
        },
        next: { key: 'diag.IM2.next' },
        diagnostics: loaded.error,
      });
  }

  // 3. Topology
  const { actual, name } = await topologySource(s, now);
  const topology = topologyFromActual(actual);
  if (topology.state === 'unknown') {
    const missing = TOPOLOGY_COLLECTIONS.filter(
      (c) => actual[c].state === 'unknown',
    );
    throw new CliError({
      code: 'TOPOLOGY',
      exitCode: 3,
      data: 'during_read',
      msg: {
        key: 'import.topology_unknown',
        params: { collections: missing.join(', ') || topology.path },
      },
      next: { key: 'import.topology_unknown.next' },
    });
  }

  // 4. Phiên
  const session = createImportSession({
    topology: topology.value,
    actual,
    existing: old ? { text: old.text, file: outDisplay } : null,
    context: { name, toolVersion: TOOL_VERSION, now },
  });

  // 5. Hỏi, hoặc mặc định
  const nonInteractive =
    bool(s.args, 'non-interactive') || !io.isTTY.stdin || s.json;
  if (!bool(s.args, 'non-interactive')) {
    if (!io.isTTY.stdin) s.note(s.t('import.auto_non_interactive.stdin'));
    else if (s.json) s.note(s.t('import.auto_non_interactive.json'));
  }
  if (nonInteractive) session.answerDefaults();
  else {
    try {
      await interview(s, session);
    } catch (e) {
      if (e instanceof Interrupted)
        throw new Interrupted('file_write', outDisplay);
      throw e;
    }
  }

  // 6. Kết quả
  const r = session.result();
  if (!r.ok) {
    const e = r.error;
    if (e.code === 'IM1') {
      for (const d of e.differences) io.stderr.write(`  ${d}\n`);
      throw diag(
        'IM1',
        5,
        { step: e.step, count: e.differences.length },
        { data: 'file_write' },
      );
    }
    if (e.code === 'IM2')
      throw new CliError({
        code: 'IM2',
        exitCode: 4,
        msg: {
          key: 'diag.IM2.message',
          params: { reason: s.t('import.invalid_file') },
        },
        next: { key: 'diag.IM2.next' },
        diagnostics: e.diagnostics,
      });
    throw new Error(
      `import session incomplete: ${e.remaining} question(s) left`,
    );
  }
  for (const w of r.value.warnings)
    s.note(s.t('import.below_min_version', { actual: w.actual, min: w.min }));

  // 7, 8. Thay đổi, ghi
  const unchanged = old !== null && old.text === r.value.yaml;
  if (!unchanged) await writeAtomic(s, out, r.value.yaml, old);
  const changes = r.value.changes?.lines ?? [];
  if (s.json) {
    writeJson(s, {
      schema: 'ocho.import/1',
      file: outDisplay,
      written: !unchanged,
      summary: r.value.summary,
      changes,
      warnings: r.value.warnings,
    });
  } else {
    const lines = [...changes];
    lines.push(
      unchanged
        ? s.t('import.unchanged', { file: outDisplay })
        : finalLine(s, outDisplay, r.value),
    );
    io.stdout.write(lines.map((l) => `${l}\n`).join(''));
  }
  return 0;
}
