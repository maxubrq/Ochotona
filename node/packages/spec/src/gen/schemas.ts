// Sinh bởi scripts/codegen.ts từ data/. Không sửa tay.

export const SCHEMAS: {
  readonly finding1: object;
  readonly report1: object;
  readonly snapshot1: object;
  readonly ochoYaml01: object;
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
};
