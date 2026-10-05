// Sinh bởi scripts/codegen.ts từ data/. Không sửa tay.

export const SCHEMAS: {
  readonly finding1: object;
  readonly report1: object;
  readonly snapshot1: object;
  readonly ochoYaml01: object;
  readonly error1: object;
  readonly explain1: object;
  readonly contexts1: object;
  readonly version1: object;
  readonly import1: object;
} = {
  finding1: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:ochotona:schema:finding:1',
    title: 'ocho.finding/1',
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'rule', 'severity', 'result', 'object', 'specRef'],
    properties: {
      schema: { const: 'ocho.finding/1' },
      rule: { type: 'string', pattern: '^[A-Z]{1,4}[0-9]{1,2}$' },
      severity: { enum: ['S1', 'S2', 'S3', 'S4', 'S5'] },
      result: { enum: ['fail', 'pass', 'not_checked', 'not_applicable'] },
      object: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'label'],
        properties: {
          id: { type: 'string' },
          kind: {
            enum: [
              'broker',
              'node',
              'vhost',
              'exchange',
              'queue',
              'binding',
              'policy',
              'operator_policy',
              'connection',
              'channel',
              'consumer',
            ],
          },
          label: { type: 'string' },
        },
      },
      what: { type: 'string' },
      dataSafety: { type: 'string' },
      next: { type: 'string' },
      mechanism: { type: 'string' },
      notChecked: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string' },
          path: { type: 'string' },
          unlock: { type: 'string' },
        },
      },
      evidence: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'source'],
          properties: {
            kind: { enum: ['observed', 'inferred'] },
            source: { type: 'string' },
            value: {},
            since: { type: 'string', format: 'date-time' },
            observedAt: { type: 'string', format: 'date-time' },
            note: { type: 'string' },
          },
        },
      },
      fix: {
        type: 'object',
        required: ['kind'],
        properties: {
          kind: {
            enum: [
              'policy',
              'argument_migration',
              'client_change',
              'config',
              'none',
            ],
          },
          set: { type: 'object' },
          rabbitmqadmin: { type: 'string' },
        },
      },
      specRef: {
        type: 'string',
        pattern: '^spec/[0-9]+\\.[0-9]+#[A-Z-]+[0-9]+$',
      },
      waiver: {
        oneOf: [
          { type: 'null' },
          {
            type: 'object',
            required: ['reason', 'by', 'until'],
            properties: {
              reason: { type: 'string' },
              by: { type: 'string' },
              until: { type: 'string', format: 'date' },
            },
          },
        ],
      },
    },
    allOf: [
      {
        if: { properties: { result: { const: 'fail' } } },
        then: {
          required: ['what', 'dataSafety', 'next', 'mechanism', 'evidence'],
        },
      },
      {
        if: { properties: { result: { const: 'not_checked' } } },
        then: { required: ['notChecked'] },
      },
    ],
  },
  report1: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:ochotona:schema:report:1',
    title: 'ocho.report/1',
    type: 'object',
    additionalProperties: false,
    required: [
      'schema',
      'tool',
      'broker',
      'sources',
      'filters',
      'findings',
      'actions',
      'blindSpots',
      'summary',
      'exitCode',
    ],
    $defs: {
      sourceState: {
        enum: ['ok', 'unavailable', 'forbidden', 'not_attempted'],
      },
      count: { type: 'integer', minimum: 0 },
    },
    properties: {
      schema: { const: 'ocho.report/1' },
      tool: {
        type: 'object',
        additionalProperties: false,
        required: ['version', 'spec'],
        properties: {
          version: { type: 'string' },
          spec: { type: 'string', pattern: '^[0-9]+\\.[0-9]+$' },
        },
      },
      broker: {
        type: 'object',
        additionalProperties: false,
        required: ['version', 'nodes', 'metadataStore'],
        properties: {
          version: { type: ['string', 'null'] },
          nodes: { type: ['integer', 'null'], minimum: 0 },
          metadataStore: { enum: ['mnesia', 'khepri', null] },
        },
      },
      sources: {
        type: 'object',
        additionalProperties: false,
        required: ['http.list', 'http.stats', 'prometheus'],
        properties: {
          'http.list': { $ref: '#/$defs/sourceState' },
          'http.stats': { $ref: '#/$defs/sourceState' },
          prometheus: { $ref: '#/$defs/sourceState' },
        },
      },
      filters: {
        type: 'object',
        additionalProperties: false,
        required: ['vhost', 'flow', 'targetVersion'],
        properties: {
          vhost: { type: ['string', 'null'] },
          flow: { type: ['string', 'null'] },
          targetVersion: { type: ['string', 'null'] },
        },
      },
      startedAt: { type: 'string', format: 'date-time' },
      durationMs: { $ref: '#/$defs/count' },
      findings: {
        type: 'array',
        items: { $ref: 'urn:ochotona:schema:finding:1' },
      },
      actions: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['rule', 'severity', 'objects', 'text'],
          properties: {
            rule: { type: 'string', pattern: '^[A-Z]{1,4}[0-9]{1,2}$' },
            severity: { enum: ['S1', 'S2', 'S3'] },
            objects: { type: 'integer', minimum: 1 },
            text: { type: 'string' },
          },
        },
      },
      blindSpots: {
        type: 'array',
        uniqueItems: true,
        items: { type: 'string', pattern: '^LE[0-9]+$' },
      },
      summary: {
        type: 'object',
        additionalProperties: false,
        required: ['fail', 'pass', 'not_checked', 'not_applicable', 'waived'],
        properties: {
          fail: { $ref: '#/$defs/count' },
          pass: { $ref: '#/$defs/count' },
          not_checked: { $ref: '#/$defs/count' },
          not_applicable: { $ref: '#/$defs/count' },
          waived: { $ref: '#/$defs/count' },
        },
      },
      internal: {
        $comment:
          'Bugs in Ocho found during the run (InternalIssue). Present only when not empty; the exit code is then 5.',
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'rule', 'object', 'detail'],
          properties: {
            kind: {
              enum: ['exception', 'contract', 'cl4_downgrade', 'invariant'],
            },
            rule: { type: 'string' },
            object: { type: 'string' },
            detail: { type: 'string' },
          },
        },
      },
      exitCode: { enum: [0, 1, 2, 3, 4, 5, 130] },
    },
  },
  snapshot1: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:ochotona:schema:snapshot:1',
    title: 'ocho.snapshot/1',
    $comment:
      'The envelope is closed. The inner shape of actual is checked by @ochotona/model (loadSnapshot, SNAP2, SNAP3).',
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'tool', 'takenAt', 'context', 'redaction', 'actual'],
    properties: {
      schema: { const: 'ocho.snapshot/1' },
      tool: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'version', 'spec'],
        properties: {
          name: { const: 'ocho' },
          version: { type: 'string' },
          spec: { type: 'string' },
        },
      },
      takenAt: { type: 'string', format: 'date-time' },
      context: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'urlHash'],
        properties: { name: { type: 'string' }, urlHash: { type: 'string' } },
      },
      redaction: {
        type: 'object',
        additionalProperties: false,
        required: ['hosts'],
        properties: { hosts: { type: 'boolean' } },
      },
      actual: {
        type: 'object',
        required: ['meta', 'broker'],
        properties: { meta: { type: 'object' }, broker: { type: 'object' } },
      },
    },
  },
  ochoYaml01: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:ochotona:schema:ocho-yaml:0.1',
    title: 'ocho.yaml 0.1',
    $comment:
      'Editor hints only. Full validation (Y1 to Y14, including cross-references such as Y5 and Y13) is done by @ochotona/model.',
    type: 'object',
    additionalProperties: false,
    required: ['spec', 'broker'],
    $defs: {
      name: { type: 'string', minLength: 1 },
      vhost: { type: 'string', minLength: 1, default: '/' },
      args: { type: 'object' },
      tolerance: { enum: ['strict', 'loose', 'undeclared'] },
      names: { type: 'array', items: { $ref: '#/$defs/name' } },
      policy: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'pattern', 'definition'],
        properties: {
          vhost: { $ref: '#/$defs/vhost' },
          name: { $ref: '#/$defs/name' },
          pattern: { type: 'string' },
          apply_to: {
            enum: [
              'all',
              'exchanges',
              'queues',
              'classic_queues',
              'quorum_queues',
              'streams',
            ],
          },
          priority: { type: 'integer' },
          definition: { $ref: '#/$defs/args' },
        },
      },
    },
    properties: {
      spec: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)*$' },
      broker: {
        type: 'object',
        additionalProperties: false,
        required: ['min_version'],
        properties: { min_version: { type: 'string' } },
      },
      families: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          additionalProperties: false,
          required: ['exchange', 'routing_key', 'queue', 'members'],
          properties: {
            vhost: { $ref: '#/$defs/vhost' },
            exchange: { type: 'string' },
            routing_key: { type: 'string' },
            queue: { type: 'string' },
            members: {
              oneOf: [
                { const: 'registry' },
                {
                  type: 'array',
                  items: { type: 'string', pattern: '^[^.*#/+]+$' },
                },
              ],
            },
          },
        },
      },
      flows: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          additionalProperties: false,
          properties: {
            vhost: { $ref: '#/$defs/vhost' },
            tolerance: { $ref: '#/$defs/tolerance' },
            family: { type: 'string' },
            exchange: { type: 'string' },
            routing_key: { type: 'string' },
            groups: { $ref: '#/$defs/names' },
            queue: { type: 'string' },
          },
        },
      },
      services: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          additionalProperties: false,
          required: ['user'],
          properties: {
            user: { $ref: '#/$defs/name' },
            flows: { $ref: '#/$defs/names' },
          },
        },
      },
      waivers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['rule', 'object', 'reason', 'by', 'until'],
          properties: {
            rule: { type: 'string', pattern: '^[A-Z]{1,4}[0-9]{1,2}$' },
            object: {
              oneOf: [
                { type: 'string' },
                {
                  type: 'object',
                  additionalProperties: false,
                  required: ['kind'],
                  properties: {
                    kind: { type: 'string' },
                    vhost: { $ref: '#/$defs/vhost' },
                    name: { type: 'string' },
                  },
                },
              ],
            },
            reason: { type: 'string', minLength: 1 },
            by: { type: 'string', minLength: 1 },
            until: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
          },
        },
      },
      topology: {
        type: 'object',
        additionalProperties: false,
        properties: {
          exchanges: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'type'],
              properties: {
                vhost: { $ref: '#/$defs/vhost' },
                name: { type: 'string' },
                type: { type: 'string' },
                durable: { type: 'boolean' },
                auto_delete: { type: 'boolean' },
                internal: { type: 'boolean' },
                arguments: { $ref: '#/$defs/args' },
                flow: { type: 'string' },
              },
            },
          },
          queues: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name'],
              properties: {
                vhost: { $ref: '#/$defs/vhost' },
                name: { type: 'string' },
                type: { enum: ['classic', 'quorum', 'stream'] },
                durable: { type: 'boolean' },
                auto_delete: { type: 'boolean' },
                arguments: { $ref: '#/$defs/args' },
                flow: { type: 'string' },
              },
            },
          },
          bindings: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['source', 'destination'],
              properties: {
                vhost: { $ref: '#/$defs/vhost' },
                source: { type: 'string' },
                destination: { type: 'string' },
                destination_type: { enum: ['queue', 'exchange'] },
                routing_key: { type: 'string' },
                arguments: { $ref: '#/$defs/args' },
              },
            },
          },
          policies: { type: 'array', items: { $ref: '#/$defs/policy' } },
          operator_policies: {
            type: 'array',
            items: { $ref: '#/$defs/policy' },
          },
        },
      },
    },
  },
  error1: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:ochotona:schema:error:1',
    title: 'ocho.error/1',
    $comment:
      'An error that stops a command before it has a result. Printed on stdout with --json so callers can always parse stdout.',
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'code', 'message', 'data', 'next', 'exitCode'],
    properties: {
      schema: { const: 'ocho.error/1' },
      code: { type: 'string', pattern: '^[A-Z]+[0-9]*$' },
      message: { type: 'string', minLength: 1 },
      data: { type: 'string', minLength: 1 },
      next: { type: 'string' },
      exitCode: { enum: [1, 2, 3, 4, 5, 130] },
      diagnostics: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['file', 'line', 'column', 'code', 'severity', 'message'],
          properties: {
            file: { type: 'string' },
            line: { type: 'integer', minimum: 1 },
            column: { type: 'integer', minimum: 1 },
            endLine: { type: 'integer', minimum: 1 },
            endColumn: { type: 'integer', minimum: 1 },
            code: { type: 'string' },
            severity: { enum: ['error', 'warning'] },
            message: { type: 'string' },
            path: {
              type: 'array',
              items: { anyOf: [{ type: 'string' }, { type: 'integer' }] },
            },
          },
        },
      },
    },
  },
  explain1: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:ochotona:schema:explain:1',
    title: 'ocho.explain/1',
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'kind', 'id'],
    properties: {
      schema: { const: 'ocho.explain/1' },
      kind: {
        enum: ['rule', 'blind_spot', 'code', 'queue', 'exchange', 'flow'],
      },
      id: { type: 'string', minLength: 1 },
      rule: {
        type: 'object',
        required: ['code', 'title', 'severities', 'mechanism', 'specRef'],
        properties: {
          code: { type: 'string' },
          title: { type: 'string' },
          severities: {
            type: 'array',
            items: { enum: ['S1', 'S2', 'S3', 'S4', 'S5'] },
          },
          predicate: { type: 'string' },
          mechanism: { type: 'string' },
          next: { type: 'string' },
          fix: { type: 'string' },
          specRef: { type: 'string' },
          lessonRefs: { type: 'array', items: { type: 'string' } },
          status: { type: 'string' },
          examples: {
            type: 'array',
            items: {
              type: 'object',
              required: ['kind', 'title', 'object', 'result'],
              properties: {
                kind: { enum: ['fail', 'near'] },
                title: { type: 'string' },
                object: { type: 'string' },
                result: {
                  enum: [
                    'pass',
                    'fail',
                    'not_checked',
                    'not_applicable',
                    'none',
                  ],
                },
                severity: { enum: ['S1', 'S2', 'S3', 'S4', 'S5'] },
                variant: { type: 'string' },
              },
            },
          },
        },
      },
      blindSpot: {
        type: 'object',
        required: ['id', 'name', 'caughtBy', 'rules'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          caughtBy: { type: 'string' },
          rules: { type: 'array', items: { type: 'string' } },
          plannedIn: { type: 'string' },
        },
      },
      code: {
        type: 'object',
        required: ['code', 'kind', 'meaning', 'status'],
        properties: {
          code: { type: 'string' },
          kind: { type: 'string' },
          meaning: { type: 'string' },
          status: { type: 'string' },
          message: { type: 'string' },
          next: { type: 'string' },
        },
      },
      object: {
        type: 'object',
        required: ['id', 'label', 'keys', 'policies', 'brokerCheck'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          type: { type: 'string' },
          vhost: { type: 'string' },
          flows: { type: 'array', items: { type: 'string' } },
          tolerance: { enum: ['strict', 'loose', 'undeclared'] },
          keys: {
            type: 'array',
            items: {
              type: 'object',
              required: ['key', 'value', 'layer', 'runtime'],
              properties: {
                key: { type: 'string' },
                value: true,
                layer: { type: 'string' },
                by: { type: ['string', 'null'] },
                runtime: { type: 'boolean' },
                overridden: { type: 'array' },
                rules: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          policies: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'priority', 'applied'],
              properties: {
                name: { type: 'string' },
                kind: { enum: ['policy', 'operator_policy'] },
                priority: { type: 'integer' },
                applied: { type: 'boolean' },
              },
            },
          },
          brokerCheck: { enum: ['agrees', 'disagrees', 'unverified'] },
        },
      },
      flow: {
        type: 'object',
        required: ['name', 'tolerance', 'members'],
        properties: {
          name: { type: 'string' },
          tolerance: { enum: ['strict', 'loose', 'undeclared'] },
          members: {
            type: 'object',
            properties: {
              exchanges: { type: 'array', items: { type: 'string' } },
              queues: { type: 'array', items: { type: 'string' } },
              bindings: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      findings: {
        type: 'array',
        items: { $ref: 'urn:ochotona:schema:finding:1' },
      },
    },
  },
  contexts1: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:ochotona:schema:contexts:1',
    title: 'ocho.contexts/1',
    $comment:
      'Output of ocho context list and ocho context show. Secrets never appear: passwordCommand only says whether one is set.',
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'file', 'current', 'contexts'],
    properties: {
      schema: { const: 'ocho.contexts/1' },
      file: { type: 'string' },
      current: { type: ['string', 'null'] },
      contexts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'name',
            'current',
            'url',
            'user',
            'passwordCommand',
            'ca',
            'insecure',
            'prometheus',
          ],
          properties: {
            name: { type: 'string' },
            current: { type: 'boolean' },
            url: { type: 'string' },
            user: { type: 'string' },
            passwordCommand: { enum: ['set', 'not set'] },
            ca: { type: ['string', 'null'] },
            insecure: { type: 'boolean' },
            prometheus: { type: 'string' },
          },
        },
      },
    },
  },
  version1: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:ochotona:schema:version:1',
    title: 'ocho.version/1',
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'version', 'spec', 'node', 'platform', 'arch'],
    properties: {
      schema: { const: 'ocho.version/1' },
      version: { type: 'string' },
      spec: { type: 'string' },
      node: { type: 'string' },
      platform: { type: 'string' },
      arch: { type: 'string' },
    },
  },
  import1: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:ochotona:schema:import:1',
    title: 'ocho.import/1',
    $comment:
      'Output of ocho import --json after the file is written or found up to date.',
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'file', 'written', 'summary', 'changes', 'warnings'],
    properties: {
      schema: { const: 'ocho.import/1' },
      file: { type: 'string' },
      written: { type: 'boolean' },
      summary: {
        type: 'object',
        required: ['flows', 'families', 'unmanaged'],
        properties: {
          flows: { type: 'integer', minimum: 0 },
          families: { type: 'integer', minimum: 0 },
          newFlows: { type: 'integer', minimum: 0 },
          newFamilies: { type: 'integer', minimum: 0 },
          membersAdded: { type: 'integer', minimum: 0 },
          vanishedFlows: { type: 'integer', minimum: 0 },
          unmanaged: {
            type: 'object',
            additionalProperties: { type: 'integer', minimum: 0 },
          },
          answered: { type: 'integer', minimum: 0 },
          defaulted: { type: 'integer', minimum: 0 },
        },
      },
      changes: { type: 'array', items: { type: 'string' } },
      warnings: {
        type: 'array',
        items: {
          type: 'object',
          required: ['kind'],
          properties: { kind: { type: 'string' } },
        },
      },
    },
  },
};
