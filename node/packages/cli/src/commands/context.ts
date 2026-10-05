// `ocho context add|use|list|show|remove`. File context không bao giờ giữ mật
// khẩu dạng chữ (Q5): chỉ `password_command`.

import { normalizeUrl } from '@ochotona/broker';
import { planRead } from '@ochotona/model';
import { CONTEXT_SUBCOMMANDS, bool, closest, str } from '../args';
import {
  identify,
  isAdmin,
  limitsOf,
  openReader,
  readOptions,
  userTags,
} from '../connect';
import {
  CONTEXT_NAME,
  type ContextEntry,
  type ContextFile,
  readContexts,
  writeContexts,
} from '../contexts';
import { type ExitCode, diag, usage } from '../errors';
import { LineReader } from '../prompt/terminal';
import { writeJson } from '../render/json';
import { labelBlock, labelWidth, table } from '../render/layout';
import type { Session } from '../session';
import { resolveTarget } from '../target';

function print(s: Session, lines: readonly string[]): void {
  s.io.stdout.write(lines.map((l) => `${l}\n`).join(''));
}

function contextsDoc(
  file: string,
  data: ContextFile,
  names: readonly string[],
) {
  return {
    schema: 'ocho.contexts/1',
    file,
    current: data.current,
    contexts: names.map((name) => {
      const c = data.contexts[name];
      return {
        name,
        current: name === data.current,
        url: c.url,
        user: c.user,
        passwordCommand: c.password_command ? 'set' : 'not set',
        ca: c.ca,
        insecure: c.insecure,
        prometheus: c.prometheus,
      };
    }),
  };
}

function needName(s: Session, sub: string): string {
  const name = s.args.positionals[1];
  if (name === undefined) throw usage('context.missing_name', { sub });
  return name;
}

function mustExist(data: ContextFile, name: string): ContextEntry {
  const c = data.contexts[name];
  if (!c)
    throw usage('target.unknown_context', {
      context: name,
      known: Object.keys(data.contexts).sort().join(', ') || '-',
    });
  return c;
}

async function add(s: Session): Promise<ExitCode> {
  const name = needName(s, 'add');
  if (!CONTEXT_NAME.test(name)) throw usage('context.bad_name', { name });
  const url = str(s.args, 'url');
  const user = str(s.args, 'user');
  if (!url || !user) throw usage('context.add_needs', { name });
  const read = await readContexts(s.io, (e) => s.warn(e));
  if (read.data.contexts[name]) throw usage('context.exists', { name });
  const norm = normalizeUrl(url);
  if (!norm.ok)
    throw diag(norm.error.diag, 4, { url }, { extra: [norm.error.detail] });
  const promUrl = str(s.args, 'prometheus-url');
  const entry: ContextEntry = {
    url,
    user,
    password_command: str(s.args, 'password-command') ?? null,
    ca: str(s.args, 'ca') ?? null,
    insecure: bool(s.args, 'insecure'),
    prometheus: bool(s.args, 'no-prometheus') ? 'off' : (promUrl ?? 'auto'),
  };

  // Nối thử bằng đúng `identify` trước khi lưu; thất bại thì không lưu, exit 3.
  if (!bool(s.args, 'no-verify')) {
    const target = await resolveTarget(s, read.data, {
      url,
      user,
      context: name,
      entry,
      caFile: entry.ca,
      insecure: entry.insecure,
      prometheus:
        entry.prometheus === 'auto' || entry.prometheus === 'off'
          ? entry.prometheus
          : { url: entry.prometheus },
      passwordCommand: entry.password_command,
    });
    const reader = openReader(s, target);
    try {
      const plan = planRead({ scope: { vhosts: 'all' } });
      const id = await identify(
        s,
        reader,
        plan,
        target,
        readOptions(s, limitsOf(s)),
      );
      const facts = [
        id.version
          ? `RabbitMQ ${id.version.raw}`
          : s.t('report.version_unknown'),
      ];
      const nodes =
        id.raw.nodes.status === 'ok' ? id.raw.nodes.pages[0]?.body : null;
      if (Array.isArray(nodes))
        facts.push(s.t('report.nodes', { count: nodes.length }));
      facts.push(
        s.t('context.user_tags', { tags: userTags(id).join(', ') || '-' }),
      );
      if (!s.json) print(s, [`${name}: ${facts.join(' · ')}`]);
      if (isAdmin(id)) s.warn(diag('OC1', 0, { user }));
    } finally {
      await reader.close();
    }
  }

  const data: ContextFile = {
    current: read.data.current ?? name,
    contexts: { ...read.data.contexts, [name]: entry },
  };
  const file = await writeContexts(s.io, data);
  s.debug(`wrote ${file}`);
  if (s.json) writeJson(s, contextsDoc(file, data, [name]));
  else
    print(s, [
      s.t(data.current === name ? 'context.saved_current' : 'context.saved', {
        name,
        file,
      }),
    ]);
  return 0;
}

async function use(s: Session): Promise<ExitCode> {
  const name = needName(s, 'use');
  const read = await readContexts(s.io, (e) => s.warn(e));
  mustExist(read.data, name);
  const data = { ...read.data, current: name };
  const file = await writeContexts(s.io, data);
  if (s.json) writeJson(s, contextsDoc(file, data, [name]));
  else print(s, [s.t('context.switched', { name })]);
  return 0;
}

async function list(s: Session): Promise<ExitCode> {
  const read = await readContexts(s.io, (e) => s.warn(e));
  const names = Object.keys(read.data.contexts).sort();
  if (s.json) {
    writeJson(s, contextsDoc(read.file, read.data, names));
    return 0;
  }
  if (names.length === 0) {
    print(s, [s.t('context.none', { file: read.file })]);
    return 0;
  }
  print(
    s,
    table(
      [
        '',
        s.t('context.col.name'),
        s.t('context.col.url'),
        s.t('context.col.user'),
      ],
      names.map((n) => {
        const c = read.data.contexts[n];
        return [n === read.data.current ? '*' : '', n, c.url, c.user];
      }),
    ),
  );
  return 0;
}

async function show(s: Session): Promise<ExitCode> {
  const read = await readContexts(s.io, (e) => s.warn(e));
  const name = s.args.positionals[1] ?? read.data.current;
  if (name === null || name === undefined)
    throw usage('target.none', {}, { key: 'target.none.next' });
  const c = mustExist(read.data, name);
  if (s.json) {
    writeJson(s, contextsDoc(read.file, read.data, [name]));
    return 0;
  }
  const rows: [string, string][] = [
    [
      'name',
      `${name}${name === read.data.current ? ` (${s.t('context.current')})` : ''}`,
    ],
    ['url', c.url],
    ['user', c.user],
    [
      'password_command',
      s.t(c.password_command ? 'context.set' : 'context.not_set'),
    ],
    ['ca', c.ca ?? '-'],
    ['insecure', String(c.insecure)],
    ['prometheus', c.prometheus],
    ['file', read.file],
  ];
  print(
    s,
    labelBlock(
      rows.map(([k, v]) => [k, [v]] as const),
      {
        indent: 0,
        labelWidth: labelWidth(rows.map(([k]) => k)),
        width: s.width,
      },
    ),
  );
  return 0;
}

async function remove(s: Session): Promise<ExitCode> {
  const name = needName(s, 'remove');
  const read = await readContexts(s.io, (e) => s.warn(e));
  mustExist(read.data, name);
  if (!bool(s.args, 'yes')) {
    if (!s.io.isTTY.stdin) throw usage('context.remove_needs_yes', { name });
    s.io.stderr.write(s.t('context.confirm_remove', { name }));
    const reader = new LineReader(s.io.stdin, s.io.signal);
    const answer = await reader.next().finally(() => reader.close());
    if (!/^y(es)?$/i.test((answer ?? '').trim())) {
      s.note(s.t('context.not_removed', { name }));
      return 0;
    }
  }
  const contexts = { ...read.data.contexts };
  delete contexts[name];
  const data: ContextFile = {
    current: read.data.current === name ? null : read.data.current,
    contexts,
  };
  const file = await writeContexts(s.io, data);
  if (s.json)
    writeJson(s, contextsDoc(file, data, Object.keys(contexts).sort()));
  else print(s, [s.t('context.removed', { name })]);
  return 0;
}

export async function context(s: Session): Promise<ExitCode> {
  const sub = s.args.positionals[0];
  if (sub === undefined) throw usage('context.missing_sub');
  switch (sub) {
    case 'add':
      return add(s);
    case 'use':
      return use(s);
    case 'list':
      return list(s);
    case 'show':
      return show(s);
    case 'remove':
      return remove(s);
    default: {
      const near = closest(sub, CONTEXT_SUBCOMMANDS);
      throw near
        ? usage('context.unknown_sub_near', { sub, near })
        : usage('context.unknown_sub', { sub });
    }
  }
}
