// Ajv strict với mọi schema hợp đồng của @ochotona/spec, để kiểm mọi đầu ra
// `--json` của test, kể cả đường lỗi.

import { schemas } from '@ochotona/spec';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { expect } from 'vitest';

const ajv = new Ajv2020({
  strict: true,
  strictRequired: false,
  allErrors: true,
});
addFormats.default(ajv);
for (const s of Object.values(schemas)) ajv.addSchema(s as object);

const ID: Record<string, string> = {
  'ocho.report/1': 'urn:ochotona:schema:report:1',
  'ocho.error/1': 'urn:ochotona:schema:error:1',
  'ocho.explain/1': 'urn:ochotona:schema:explain:1',
  'ocho.contexts/1': 'urn:ochotona:schema:contexts:1',
  'ocho.version/1': 'urn:ochotona:schema:version:1',
  'ocho.import/1': 'urn:ochotona:schema:import:1',
};

/** Document qua đúng schema theo trường `schema` của nó. */
export function expectValid(doc: { schema?: string }): void {
  const id = ID[doc.schema ?? ''];
  expect(id, `no contract for ${doc.schema}`).toBeDefined();
  const validate = ajv.getSchema(id)!;
  const ok = validate(doc);
  expect(
    ok ? [] : validate.errors?.map((e) => `${e.instancePath} ${e.message}`),
  ).toEqual([]);
}
