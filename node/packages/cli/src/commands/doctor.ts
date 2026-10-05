// `ocho doctor`: đọc broker (hoặc ảnh chụp), chấm luật, in báo cáo.
// Trình tự mười ba bước ở docs/spec.md, mục "Lệnh doctor".

import {
  type Actual,
  type Desired,
  type Instant,
  DEFAULT_CAPABILITY_TABLE,
  buildFlowMap,
  checkInvariants,
  compareVersion,
  loadSnapshot,
  parseVersion,
  planRead,
  saveSnapshot,
} from '@ochotona/model';
import {
  makeCtx,
  planActions,
  readNeeds,
  runRules,
  selectRules,
} from '@ochotona/rules';
import { SPEC_VERSION, type Severity } from '@ochotona/spec';
import { resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { bool, enumFlag, list, str } from '../args';
import {
  identifiedActual,
  identify,
  isAdmin,
  limitsOf,
  openReader,
  readActual,
  readOptions,
} from '../connect';
import { readContexts } from '../contexts';
import { CliError, type ExitCode, InternalError, diag, usage } from '../errors';
import { doctorExit } from '../exit';
import { findOchoFile, loadDesired } from '../ocho-yaml';
import { renderError } from '../render/errors';
import { buildReport, writeJson } from '../render/json';
import { fmtDuration } from '../render/layout';
import { createProgress } from '../render/progress';
import { headLines, inventoryLine, renderBody } from '../render/text';
import type { DoctorOutcome } from '../report';
import type { Session } from '../session';
import { pickTarget, resolveTarget } from '../target';
import { TOOL_VERSION } from '../version';

/** Trên ngần này queue thì in ước tính trước pha kiểm kê. */
const ESTIMATE_ABOVE_QUEUES = 2000;

const iso = (ms: number) => new Date(ms).toISOString() as Instant;

function out(s: Session, lines: readonly string[]): void {
  s.io.stdout.write(lines.map((l) => `${l}\n`).join(''));
}

async function fromSnapshot(s: Session, file: string): Promise<Actual> {
  let text: string;
  try {
    const buf = await s.io.fs.readFile(resolve(s.io.cwd, file));
    text = (file.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8');
  } catch (e) {
    throw usage('file.unreadable', { file, detail: (e as Error).message });
  }
  const r = loadSnapshot(text, DEFAULT_CAPABILITY_TABLE, file);
  if (!r.ok) {
    const e = r.error;
    throw diag(
      e.code,
      4,
      {
        schema: e.message.replace(/^unsupported schema /, ''),
        path: e.path ?? '$',
        count: e.violations?.length ?? 0,
      },
      { extra: [e.message] },
    );
  }
  s.debug(`read snapshot ${file}`);
  return r.value;
}

async function writeSnapshot(
  s: Session,
  file: string,
  actual: Actual,
  opts: { name: string; url: string; now: Instant },
): Promise<void> {
  const json = saveSnapshot(actual, {
    toolVersion: TOOL_VERSION,
    specVersion: SPEC_VERSION,
    takenAt: opts.now,
    contextName: opts.name,
    url: opts.url,
    redactHosts: bool(s.args, 'redact-hosts'),
    randomBytes: s.io.randomBytes,
  });
  const data = file.endsWith('.gz') ? gzipSync(json) : json;
  try {
    await s.io.fs.writeFile(resolve(s.io.cwd, file), data);
    s.debug(`wrote snapshot ${file}`);
  } catch (e) {
    // Ghi file lỗi không đổi exit code của chẩn đoán.
    renderError(
      { ...s, json: false },
      new CliError({
        code: 'FILE',
        exitCode: 4,
        data: 'file_write',
        file,
        msg: {
          key: 'file.write_failed',
          params: { file, detail: (e as Error).message },
        },
      }),
    );
  }
}

export async function doctor(s: Session): Promise<ExitCode> {
  const { io, args } = s;
  const startedMs = io.clock();
  const step = (name: string, since: number) =>
    s.debug(`step ${name}: ${io.clock() - since} ms`);

  // 1. Tham số
  const failOn: Severity =
    enumFlag(args, 'fail-on', ['S1', 'S2', 'S3'] as const) ?? 'S1';
  const vhosts = list(args, 'vhost');
  const flow = str(args, 'flow') ?? null;
  const tvRaw = str(args, 'target-version') ?? null;
  const tv = tvRaw === null ? null : parseVersion(tvRaw);
  if (tvRaw !== null && tv === null)
    throw usage('doctor.target_version_invalid', { value: tvRaw });
  const from = str(args, 'from');
  const save = str(args, 'save');
  const limits = limitsOf(s);
  const now = iso(startedMs);

  // 2. Dòng xác nhận (chỉ khi đọc broker)
  const contexts = from ? null : await readContexts(io, (e) => s.warn(e));
  if (contexts && io.isTTY.stderr && !s.json) {
    const spec = pickTarget(s, contexts.data);
    s.note(s.t('doctor.connecting', { name: spec.context ?? spec.url }));
  }

  // 3. ocho.yaml
  let t0 = io.clock();
  const file = await findOchoFile(s);
  const desired: Desired | null = file ? await loadDesired(s, file, now) : null;
  if (flow !== null) {
    if (!desired) throw usage('doctor.flow_needs_file', { flow });
    if (!desired.flows[flow])
      throw usage('doctor.unknown_flow', {
        flow,
        known: Object.keys(desired.flows).sort().slice(0, 5).join(', ') || '-',
      });
  }
  step('ocho.yaml', t0);

  // 4. Chọn luật, lập kế hoạch đọc
  const rules = selectRules({
    targetVersion: tv !== null,
    includeExperimental: bool(args, 'experimental'),
  });
  const needs = readNeeds(rules);
  const scope = { vhosts: vhosts.length > 0 ? vhosts : ('all' as const) };
  s.debug(`rules selected: ${new Set(rules.map((r) => r.code)).size}`);

  let actual: Actual;
  let name: string;
  let url = '';
  let connectMs: number | null = null;
  let headPrinted = false;

  if (from) {
    // --from thay bước 5 tới 8
    actual = await fromSnapshot(s, from);
    name = actual.meta.contextName;
  } else {
    // 5. Dựng đích
    t0 = io.clock();
    const target = await resolveTarget(s, contexts!.data);
    name = target.name;
    url = target.target.url;
    const reader = openReader(s, target);
    const progress = createProgress(s, limits);
    try {
      const opts = readOptions(s, limits, (e) => progress.onEvent(e));
      let plan = planRead({ ...needs, users: false, scope });
      // 6. Nhận diện, in ba dòng đầu
      const identified = await identify(s, reader, plan, target, opts);
      connectMs = io.clock() - startedMs;
      step('identify', t0);
      if (isAdmin(identified)) {
        s.warn(diag('OC1', 0, { user: target.target.user }));
        plan = planRead({ ...needs, users: needs.wantsUsers, scope });
      }
      if (
        tv &&
        identified.version &&
        compareVersion(tv, identified.version) <= 0
      )
        throw usage('doctor.target_version_not_newer', {
          target: tv.raw,
          version: identified.version.raw,
        });
      if (!s.json) {
        out(
          s,
          headLines(identifiedActual(identified, name, plan), s, {
            name,
            connectMs,
          }),
        );
        headPrinted = true;
      }
      const queues = identified.totals?.queues ?? 0;
      if (queues > ESTIMATE_ABOVE_QUEUES && !s.json)
        s.note(
          s.t('doctor.estimate', {
            queues,
            requests: identified.estimate.requests,
            duration: fmtDuration(identified.estimate.seconds * 1000, s.lang),
          }),
        );
      // 7. Đọc
      t0 = io.clock();
      actual = await readActual(s, reader, plan, identified, name, opts);
      step('read', t0);
    } finally {
      progress.clear();
      await reader.close();
    }
  }

  // 8. Bất biến
  const violations = checkInvariants(actual, DEFAULT_CAPABILITY_TABLE);
  if (violations.length > 0)
    throw new InternalError(
      `${violations.length} model invariant violation(s): ${violations
        .slice(0, 3)
        .map((v) => `${v.code} ${v.path} ${v.detail}`)
        .join('; ')}`,
    );

  // 9, 10. Gán luồng, chấm luật, chọn ba việc
  t0 = io.clock();
  const flows = buildFlowMap(desired, actual);
  const ctx = makeCtx({ actual, desired, flows, targetVersion: tv, now });
  const { results, internal } = runRules(ctx, rules, {
    waivers: desired?.waivers ?? [],
    scope: { vhosts: scope.vhosts, flow },
    mode: 'production',
  });
  const { actions, uncheckedS1 } = planActions(results);
  step('rules', t0);
  for (const i of internal)
    s.debug(`internal ${i.kind} ${i.rule}: ${i.detail}`);

  // 11. Ảnh chụp
  if (save) await writeSnapshot(s, save, actual, { name, url, now });

  // 12, 13. Render, exit code
  const exitCode = doctorExit(results, { failOn, internal: internal.length });
  const outcome: DoctorOutcome = {
    actual,
    results,
    internal,
    actions,
    uncheckedS1,
    rules,
    exitCode,
    failOn,
    filters: { vhosts, flow, targetVersion: tv?.raw ?? null },
    startedAt: now,
    durationMs: io.clock() - startedMs,
    name,
    connectMs,
  };
  if (s.json) {
    writeJson(s, buildReport(outcome, s));
  } else {
    const lines = headPrinted ? [] : headLines(actual, s, { name, connectMs });
    lines.push(inventoryLine(actual, s));
    lines.push(
      ...renderBody(outcome, s, {
        why: bool(args, 'why'),
        verbose: bool(args, 'verbose'),
      }),
    );
    out(s, lines);
  }
  return exitCode;
}
