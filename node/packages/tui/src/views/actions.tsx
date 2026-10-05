// Việc người dùng có thể làm từ Home hay menu của một broker. Mỗi việc mở một
// màn hình; form thay cho cờ dòng lệnh, nên không cần nhớ `--vhost`, `--fail-on`…

import { CONTEXT_NAME, context } from '@ochotona/cli/api';
import React from 'react';
import type { Nav } from '../context';
import type { T } from '../i18n';
import type { Ocho, Target } from '../ocho';
import type { FormValues } from '../ui';
import { Doctor } from './Doctor';
import { Explain } from './Explain';
import { FormView } from './FormView';
import { Import } from './Import';
import { TextView } from './TextView';
import { explainObjectLoader } from './explain-load';

export interface Ctx {
  readonly ocho: Ocho;
  readonly nav: Nav;
  readonly t: T;
  readonly cols: number;
}

export function targetLabel(t: T, target: Target): string {
  switch (target.kind) {
    case 'context':
      return target.name;
    case 'url':
      return `${target.user}@${target.url.replace(/^https?:\/\//, '')}`;
    case 'snapshot':
      return target.file;
    case 'cli':
      return t('target.cli');
  }
}

export function runDoctor(
  c: Ctx,
  target: Target,
  flags: readonly string[] = [],
) {
  c.nav.push(
    `${c.t('doctor.title')} · ${targetLabel(c.t, target)}`,
    <Doctor target={target} flags={flags} />,
  );
}

/** Form cho các cờ của `doctor`, rồi chạy. */
export function doctorOptions(
  c: Ctx,
  target: Target,
  initial: readonly string[] = [],
) {
  const { t } = c;
  const flag = (name: string) => {
    const at = initial.lastIndexOf(`--${name}`);
    return at >= 0 ? (initial[at + 1] ?? '') : '';
  };
  const vhosts = initial
    .map((a, i) => (a === '--vhost' ? initial[i + 1] : null))
    .filter((x): x is string => x !== null);
  c.nav.push(
    t('options.title'),
    <FormView
      title={`${t('options.title')} · ${targetLabel(t, target)}`}
      intro={t('options.intro')}
      fields={[
        {
          name: 'vhost',
          kind: 'text',
          label: t('options.vhost'),
          initial: vhosts.join(', '),
          placeholder: t('options.vhost_all'),
          hint: t('options.vhost_hint'),
        },
        {
          name: 'failOn',
          kind: 'choice',
          label: t('options.fail_on'),
          initial: flag('fail-on') || 'S1',
          choices: ['S1', 'S2', 'S3'].map((v) => ({ value: v, label: v })),
          hint: t('options.fail_on_hint'),
        },
        {
          name: 'targetVersion',
          kind: 'text',
          label: t('options.target_version'),
          initial: flag('target-version'),
          placeholder: '4.2',
          hint: t('options.target_version_hint'),
        },
        {
          name: 'flow',
          kind: 'text',
          label: t('options.flow'),
          initial: flag('flow'),
          hint: t('options.flow_hint'),
        },
        {
          name: 'file',
          kind: 'text',
          label: t('options.file'),
          initial: flag('file'),
          placeholder: './ocho.yaml',
          hint: t('options.file_hint'),
        },
        {
          name: 'noFile',
          kind: 'toggle',
          label: t('options.no_file'),
          initial: initial.includes('--no-file'),
          hint: t('options.no_file_hint'),
        },
        {
          name: 'experimental',
          kind: 'toggle',
          label: t('options.experimental'),
          initial: initial.includes('--experimental'),
          hint: t('options.experimental_hint'),
        },
      ]}
      submitLabel={t('options.submit')}
      onSubmit={(v) => {
        c.nav.pop();
        runDoctor(c, target, doctorFlags(v));
      }}
    />,
  );
}

/** Giá trị form → cờ của `ocho doctor`. */
export function doctorFlags(v: FormValues): string[] {
  const out: string[] = [];
  for (const vh of String(v.vhost ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== ''))
    out.push('--vhost', vh);
  if (v.failOn && v.failOn !== 'S1') out.push('--fail-on', String(v.failOn));
  const text = (name: string, flag: string) => {
    const x = String(v[name] ?? '').trim();
    if (x !== '') out.push(`--${flag}`, x);
  };
  text('targetVersion', 'target-version');
  text('flow', 'flow');
  if (v.noFile === true) out.push('--no-file');
  else text('file', 'file');
  if (v.experimental === true) out.push('--experimental');
  return out;
}

export function explainObjectForm(c: Ctx, target: Target) {
  const { t } = c;
  c.nav.push(
    t('explain_object.title'),
    <FormView
      title={`${t('explain_object.title')} · ${targetLabel(t, target)}`}
      intro={t('explain_object.intro')}
      fields={[
        {
          name: 'kind',
          kind: 'choice',
          label: t('explain_object.kind'),
          choices: [
            { value: 'auto', label: t('explain_object.kind_auto') },
            { value: 'queue', label: 'queue' },
            { value: 'exchange', label: 'exchange' },
            { value: 'flow', label: 'flow' },
          ],
        },
        {
          name: 'name',
          kind: 'text',
          label: t('explain_object.name'),
          required: true,
          placeholder: 'orders.created',
        },
        {
          name: 'vhost',
          kind: 'text',
          label: 'vhost',
          initial: '/',
          hint: t('explain_object.vhost_hint'),
        },
      ]}
      submitLabel={t('explain_object.submit')}
      onSubmit={(v) => {
        const kind = String(v.kind) as 'auto' | 'queue' | 'exchange' | 'flow';
        const name = String(v.name).trim();
        const vhost = String(v.vhost).trim() || '/';
        c.nav.replace(
          `${kind === 'auto' ? '' : `${kind} `}${name}`,
          <TextView
            title={`${name} · vhost ${vhost}`}
            load={explainObjectLoader(c.ocho, c.nav, target, kind, name, vhost)}
          />,
        );
      }}
    />,
  );
}

export function rulesBrowser(c: Ctx, target: Target | null) {
  c.nav.push(c.t('explain.browser_title'), <Explain target={target} />);
}

export function importWizard(c: Ctx, target: Target) {
  c.nav.push(
    `${c.t('import.title')} · ${targetLabel(c.t, target)}`,
    <Import target={target} />,
  );
}

/** Chạy `ocho context …` và báo dòng kết quả. */
async function contextCommand(
  c: Ctx,
  argv: string[],
  o: { target?: Target } = {},
): Promise<string> {
  const r = await c.ocho.run(
    argv,
    {
      width: c.cols,
      ...(o.target ? { target: o.target, ask: c.nav.askPassword } : {}),
    },
    context,
  );
  for (const w of r.err) c.nav.toast(w, 'warning');
  return r.out.join(' ');
}

export async function makeCurrent(c: Ctx, name: string) {
  try {
    c.nav.toast(await contextCommand(c, ['context', 'use', name]), 'success');
  } catch (e) {
    c.nav.toast(c.ocho.errorLines(e, c.cols)[0] ?? String(e), 'error');
  }
}

export async function removeContext(c: Ctx, name: string): Promise<boolean> {
  if (!(await c.nav.confirm(c.t('context.confirm_remove', { name }))))
    return false;
  try {
    c.nav.toast(
      await contextCommand(c, ['context', 'remove', name, '--yes']),
      'success',
    );
    return true;
  } catch (e) {
    c.nav.toast(c.ocho.errorLines(e, c.cols)[0] ?? String(e), 'error');
    return false;
  }
}

export function addContext(c: Ctx, existing: readonly string[]) {
  const { t } = c;
  c.nav.push(
    t('add.title'),
    <FormView
      title={t('add.title')}
      intro={t('add.intro')}
      fields={[
        {
          name: 'name',
          kind: 'text',
          label: t('add.name'),
          required: true,
          placeholder: 'prod',
          hint: t('add.name_hint'),
        },
        {
          name: 'url',
          kind: 'text',
          label: 'URL',
          required: true,
          placeholder: 'https://host:15671',
          hint: t('add.url_hint'),
        },
        {
          name: 'user',
          kind: 'text',
          label: t('add.user'),
          required: true,
          initial: 'ocho-doctor',
          hint: t('add.user_hint'),
        },
        {
          name: 'passwordCommand',
          kind: 'text',
          label: t('add.password_command'),
          placeholder: 'op read op://infra/rabbit/password',
          hint: t('add.password_command_hint'),
        },
        {
          name: 'prometheus',
          kind: 'text',
          label: 'Prometheus',
          placeholder: t('add.prometheus_auto'),
          hint: t('add.prometheus_hint'),
        },
        { name: 'noPrometheus', kind: 'toggle', label: t('add.no_prometheus') },
        {
          name: 'ca',
          kind: 'text',
          label: t('add.ca'),
          placeholder: '/path/ca.pem',
          hint: t('add.ca_hint'),
        },
        {
          name: 'insecure',
          kind: 'toggle',
          label: t('add.insecure'),
          hint: t('add.insecure_hint'),
        },
        {
          name: 'verify',
          kind: 'toggle',
          label: t('add.verify'),
          initial: true,
          hint: t('add.verify_hint'),
        },
      ]}
      validate={(v) => {
        const errs: Record<string, string> = {};
        const name = String(v.name).trim();
        if (name !== '' && !CONTEXT_NAME.test(name))
          errs.name = t('add.bad_name');
        if (existing.includes(name)) errs.name = t('add.exists', { name });
        return errs;
      }}
      submitLabel={t('add.submit')}
      onSubmit={async (v) => {
        const name = String(v.name).trim();
        const url = String(v.url).trim();
        const user = String(v.user).trim();
        const argv = ['context', 'add', name, '--url', url, '--user', user];
        const opt = (field: string, flag: string) => {
          const x = String(v[field] ?? '').trim();
          if (x !== '') argv.push(`--${flag}`, x);
        };
        opt('passwordCommand', 'password-command');
        if (v.noPrometheus === true) argv.push('--no-prometheus');
        else opt('prometheus', 'prometheus-url');
        opt('ca', 'ca');
        if (v.insecure === true) argv.push('--insecure');
        if (v.verify !== true) argv.push('--no-verify');
        // Nối thử cần mật khẩu: hỏi ở ô ẩn nếu không có password_command.
        const out = await contextCommand(c, argv, {
          target: { kind: 'url', url, user },
        });
        c.nav.pop();
        c.nav.toast(out, 'success');
      }}
    />,
  );
}

export function connectUrl(c: Ctx) {
  const { t } = c;
  c.nav.push(
    t('connect.title'),
    <FormView
      title={t('connect.title')}
      intro={t('connect.intro')}
      fields={[
        {
          name: 'url',
          kind: 'text',
          label: 'URL',
          required: true,
          placeholder: 'http://localhost:15672',
        },
        {
          name: 'user',
          kind: 'text',
          label: t('add.user'),
          required: true,
          initial: 'ocho-doctor',
        },
      ]}
      submitLabel={t('connect.submit')}
      onSubmit={(v) => {
        c.nav.pop();
        runDoctor(c, {
          kind: 'url',
          url: String(v.url).trim(),
          user: String(v.user).trim(),
        });
      }}
    />,
  );
}

export function openSnapshot(c: Ctx) {
  const { t } = c;
  c.nav.push(
    t('snapshot.title'),
    <FormView
      title={t('snapshot.title')}
      intro={t('snapshot.intro')}
      fields={[
        {
          name: 'file',
          kind: 'text',
          label: t('save.file'),
          required: true,
          initial: 'snap.json',
        },
      ]}
      submitLabel={t('snapshot.submit')}
      onSubmit={(v) => {
        c.nav.pop();
        runDoctor(c, { kind: 'snapshot', file: String(v.file).trim() });
      }}
    />,
  );
}
