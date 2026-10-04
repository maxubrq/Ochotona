import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contractAjv } from '../scripts/checks.ts';
import { schemas } from '../src';

const ajv = contractAjv(join(import.meta.dirname, '..'));
const check = (id: string, doc: unknown) => {
  const validate = ajv.getSchema(id)!;
  const ok = validate(doc);
  return ok
    ? []
    : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
};

// Đầu ra mẫu của tab chính, chỉnh theo schema: object có id và label.
const finding = {
  schema: 'ocho.finding/1',
  rule: 'T2',
  severity: 'S1',
  result: 'fail',
  object: {
    id: 'exchange:/:scan.request',
    kind: 'exchange',
    label: 'exchange scan.request',
  },
  what: '1,240 unroutable messages were dropped since 2026-09-12 03:10 UTC.',
  dataSafety: 'No. Those messages are gone, and scan.request can drop more.',
  next: 'Set an alternate exchange on these exchanges through a policy.',
  mechanism:
    'An exchange stores nothing: with no matching binding and no alternate exchange, the broker discards the message and still confirms it.',
  evidence: [
    {
      kind: 'observed',
      source: 'http:/api/overview#message_stats.drop_unroutable',
      value: 1240,
      since: '2026-09-12T03:10:00Z',
      observedAt: '2026-10-04T01:22:10Z',
    },
    {
      kind: 'inferred',
      source: 'definitions',
      note: 'exchange has no alternate-exchange argument or policy',
    },
  ],
  fix: {
    kind: 'policy',
    set: { 'alternate-exchange': 'ocho.unroutable' },
    rabbitmqadmin: 'rabbitmqadmin policies declare …',
  },
  specRef: 'spec/0.4#T2',
  waiver: null,
};

const report = {
  schema: 'ocho.report/1',
  tool: { version: '0.1.0', spec: '0.4' },
  broker: { version: '3.13.7', nodes: 3, metadataStore: 'mnesia' },
  sources: { 'http.list': 'ok', 'http.stats': 'ok', prometheus: 'unavailable' },
  filters: { vhost: null, flow: null, targetVersion: null },
  startedAt: '2026-10-04T01:22:08Z',
  durationMs: 4210,
  findings: [
    finding,
    {
      schema: 'ocho.finding/1',
      rule: 'R1',
      severity: 'S3',
      result: 'not_checked',
      object: { id: 'channel:c1', kind: 'channel', label: 'channel c1' },
      notChecked: {
        reason: 'management statistics are disabled',
        unlock: 'Enable management statistics on the broker',
      },
      specRef: 'spec/0.4#R1',
    },
  ],
  actions: [
    {
      rule: 'T2',
      severity: 'S1',
      objects: 3,
      text: 'Add an alternate exchange to scan.request, scan.result, billing (T2)',
    },
  ],
  blindSpots: [
    'LE2',
    'LE5',
    'LE6',
    'LE8',
    'LE10',
    'LE14',
    'LE17',
    'LE19',
    'LE20',
  ],
  summary: { fail: 9, pass: 21, not_checked: 4, not_applicable: 4, waived: 0 },
  exitCode: 1,
};

const snapshot = {
  schema: 'ocho.snapshot/1',
  tool: { name: 'ocho', version: '0.1.0', spec: '0.4' },
  takenAt: '2026-10-04T01:22:10.000Z',
  context: { name: 'prod', urlHash: 'ab12' },
  redaction: { hosts: true },
  actual: { meta: {}, broker: {} },
};

const ochoYaml = {
  spec: '0.4',
  broker: { min_version: '3.13' },
  families: {
    'scan.request': {
      exchange: 'scan.request',
      routing_key: 'request_{engine_id}',
      queue: 'request_{engine_id}_q',
      members: ['clamav', 'yara', 'pdf'],
    },
  },
  flows: {
    'scan.request': { family: 'scan.request', tolerance: 'strict' },
    'billing.invoice.created': {
      exchange: 'billing',
      routing_key: 'billing.invoice.created',
      groups: [
        'billing.invoice.created.email',
        'billing.invoice.created.ledger',
      ],
      tolerance: 'undeclared',
    },
  },
  waivers: [
    {
      rule: 'T1',
      object: 'queue cache.invalidate',
      reason: 'loose by design',
      by: 'max',
      until: '2027-01-31',
    },
  ],
  topology: {
    queues: [
      {
        vhost: '/',
        name: 'request_clamav_q',
        type: 'quorum',
        durable: true,
        arguments: { 'x-queue-type': 'quorum' },
        flow: 'scan.request',
      },
    ],
  },
};

describe('published contract schemas', () => {
  it('are exported with URN ids', () => {
    expect((schemas.finding1 as { $id: string }).$id).toBe(
      'urn:ochotona:schema:finding:1',
    );
    expect((schemas.report1 as { $id: string }).$id).toBe(
      'urn:ochotona:schema:report:1',
    );
    expect((schemas.snapshot1 as { $id: string }).$id).toBe(
      'urn:ochotona:schema:snapshot:1',
    );
    expect((schemas.ochoYaml01 as { $id: string }).$id).toBe(
      'urn:ochotona:schema:ocho-yaml:0.1',
    );
  });

  it('accept the sample outputs', () => {
    expect(check('urn:ochotona:schema:finding:1', finding)).toEqual([]);
    expect(check('urn:ochotona:schema:report:1', report)).toEqual([]);
    expect(check('urn:ochotona:schema:snapshot:1', snapshot)).toEqual([]);
    expect(check('urn:ochotona:schema:ocho-yaml:0.1', ochoYaml)).toEqual([]);
  });

  it('CL3: a fail without the three facts or evidence is rejected', () => {
    const { evidence: _e, ...noEvidence } = finding;
    expect(check('urn:ochotona:schema:finding:1', noEvidence)).not.toEqual([]);
    const { dataSafety: _d, ...noSafety } = finding;
    expect(check('urn:ochotona:schema:finding:1', noSafety)).not.toEqual([]);
  });

  it('CL2: a not_checked without a reason is rejected', () => {
    const nc = { ...report.findings[1], notChecked: undefined };
    expect(
      check('urn:ochotona:schema:finding:1', JSON.parse(JSON.stringify(nc))),
    ).not.toEqual([]);
  });

  it('rejects unknown fields, bad blind-spot codes and bad exit codes', () => {
    expect(
      check('urn:ochotona:schema:finding:1', { ...finding, extra: 1 }),
    ).not.toEqual([]);
    expect(
      check('urn:ochotona:schema:report:1', { ...report, blindSpots: ['#2'] }),
    ).not.toEqual([]);
    expect(
      check('urn:ochotona:schema:report:1', { ...report, exitCode: 7 }),
    ).not.toEqual([]);
    expect(
      check('urn:ochotona:schema:ocho-yaml:0.1', {
        ...ochoYaml,
        unmanaged: {},
      }),
    ).not.toEqual([]);
  });
});
