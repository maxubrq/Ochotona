// Nạp data/, kiểm bằng JSON Schema và kiểm chéo giữa các file.
// Dùng bởi scripts/codegen.ts và test; chỉ dùng lúc dev.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseTemplate, templateParams } from '../src/template.ts';
import { compareRelease, parseVersion } from '../src/version.ts';

type Obj = Record<string, any>;

export interface SpecData {
  spec: Obj;
  codes: Obj[];
  rules: Obj[];
  capabilities: Obj[];
  keys: Obj[];
  exclusions: Obj[];
  blindSpots: Obj[];
  i18n: { en: Record<string, string>; vi: Record<string, string> };
  glossary: Obj[];
  fixTemplates: Obj[];
}

/** File dữ liệu → schema của nó trong schemas/data/. */
export const DATA_FILES = {
  spec: 'spec.json',
  codes: 'codes.json',
  rules: 'rules.json',
  capabilities: 'capabilities.json',
  keys: 'keys.json',
  exclusions: 'exclusions.json',
  blindSpots: 'blind-spots.json',
  en: 'i18n/en.json',
  vi: 'i18n/vi.json',
  glossary: 'i18n/glossary.json',
  fixTemplates: 'fix-templates.json',
} as const;

const SCHEMA_OF: Record<keyof typeof DATA_FILES, string> = {
  spec: 'spec',
  codes: 'codes',
  rules: 'rules',
  capabilities: 'capabilities',
  keys: 'keys',
  exclusions: 'exclusions',
  blindSpots: 'blind-spots',
  en: 'i18n',
  vi: 'i18n',
  glossary: 'glossary',
  fixTemplates: 'fix-templates',
};

export const CONTRACT_FILES = {
  finding1: 'finding-1.json',
  report1: 'report-1.json',
  snapshot1: 'snapshot-1.json',
  ochoYaml01: 'ocho-yaml-0.1.json',
} as const;

const readJson = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));

/** Bỏ `$schema` và `$comment` ở mọi cấp: đó là ghi chú cho người, không phải dữ liệu. */
export function stripMeta<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripMeta) as T;
  if (v && typeof v === 'object') {
    const out: Obj = {};
    for (const [k, x] of Object.entries(v))
      if (k !== '$schema' && k !== '$comment') out[k] = stripMeta(x);
    return out as T;
  }
  return v;
}

export function loadRaw(root: string): Record<keyof typeof DATA_FILES, any> {
  const out = {} as Record<keyof typeof DATA_FILES, any>;
  for (const [k, f] of Object.entries(DATA_FILES))
    out[k as keyof typeof DATA_FILES] = readJson(join(root, 'data', f));
  return out;
}

export function fromRaw(raw: Record<keyof typeof DATA_FILES, any>): SpecData {
  const r = stripMeta(raw);
  return {
    spec: r.spec,
    codes: r.codes.codes,
    rules: r.rules.rules,
    capabilities: r.capabilities.ranges,
    keys: r.keys.keys,
    exclusions: r.exclusions.exclusions,
    blindSpots: r.blindSpots.blindSpots,
    i18n: { en: r.en, vi: r.vi },
    glossary: r.glossary.terms,
    fixTemplates: r.fixTemplates.templates,
  };
}

export function loadContracts(root: string): Record<string, Obj> {
  const out: Record<string, Obj> = {};
  for (const [k, f] of Object.entries(CONTRACT_FILES))
    out[k] = readJson(join(root, 'schemas', 'contracts', f));
  return out;
}

// Ajv strict, trừ strictRequired: khoá trong nhánh if/then được khai ở
// `properties` của schema cha, mà strictRequired chỉ nhìn trong nhánh.
const AJV_OPTIONS = { strict: true, strictRequired: false, allErrors: true };

/** Ajv strict, có `format`, đã nạp sẵn bốn schema hợp đồng. */
export function contractAjv(root: string): Ajv2020 {
  const ajv = new Ajv2020(AJV_OPTIONS);
  addFormats.default(ajv);
  for (const s of Object.values(loadContracts(root))) ajv.addSchema(s);
  return ajv;
}

/** Bước 1: mỗi file data/ qua schema của nó; schema hợp đồng phải biên dịch được. */
export function validateSchemas(
  root: string,
  raw: Record<keyof typeof DATA_FILES, any>,
): string[] {
  const errors: string[] = [];
  const ajv = new Ajv2020(AJV_OPTIONS);
  for (const [k, f] of Object.entries(DATA_FILES)) {
    const name = SCHEMA_OF[k as keyof typeof DATA_FILES];
    const schema = readJson(
      join(root, 'schemas', 'data', `${name}.schema.json`),
    );
    let validate;
    try {
      validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
    } catch (e) {
      errors.push(`schemas/data/${name}.schema.json: ${(e as Error).message}`);
      continue;
    }
    if (!validate(raw[k as keyof typeof DATA_FILES])) {
      for (const e of validate.errors ?? [])
        errors.push(`data/${f}${e.instancePath}: ${e.message}`);
    }
  }
  try {
    const c = contractAjv(root);
    for (const s of Object.values(loadContracts(root))) c.getSchema(s.$id);
  } catch (e) {
    errors.push(`schemas/contracts: ${(e as Error).message}`);
  }
  return errors;
}

// ---------------------------------------------------------------- kiểm chéo

/** Tiền tố do công cụ sở hữu; mọi tiền tố khác thuộc spec lõi. */
export const TOOL_PREFIXES = [
  'CL',
  'CX',
  'DX',
  'EX',
  'GC',
  'IM',
  'INV',
  'LE',
  'OC',
  'SNAP',
  'VT',
  'Y',
  'YP',
  'YW',
];
export const CORE_PREFIXES = [
  'A',
  'C',
  'CT',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'K',
  'L',
  'MG',
  'N',
  'P',
  'Q',
  'R',
  'SQ',
  'T',
  'U',
  'V',
];

const RULE_KEYS = [
  'title',
  'what',
  'dataSafety',
  'next',
  'mechanism',
  'action',
] as const;
const DIAG_KEYS = ['message', 'next'] as const;
/** Văn bản của phiên import: một dòng hệ quả của `strict` cho mỗi dạng đích. */
export const IMPORT_KEYS = [
  'import.consequence.binding',
  'import.consequence.direct',
  'import.consequence.family',
  'import.consequence.fanout',
] as const;
/** Trường có thể có khoá theo biến thể: `rule.T2.what.dropped_node`. */
const VARIANT_FIELDS = ['what', 'dataSafety', 'next', 'mechanism'] as const;
const VARIANT_RE = new RegExp(
  `^rule\\.([A-Z]+[0-9]+)\\.(${VARIANT_FIELDS.join('|')})\\.([a-z][a-z0-9_]*)$`,
);
const SAFETY_PREFIX: Record<string, readonly string[]> = {
  en: ['No. ', 'Yes. ', 'Not known. '],
  vi: ['Không. ', 'Có. ', 'Chưa biết. '],
};
const DEGREE_WORDS: Record<string, readonly string[]> = {
  en: ['critical', 'severe', 'serious', 'dangerous', 'catastrophic'],
  vi: ['nghiêm trọng', 'nguy hiểm', 'trầm trọng'],
};
const BLAME = [/\byou forgot\b/i, /\bbạn quên\b/i, /\byour fault\b/i];
const MARKUP = [/`/, /\*\*/, /\]\(/, /\u001b/, /^#+ /m];
const PLURAL_CATS: Record<string, readonly string[]> = {
  en: ['one', 'other'],
  vi: ['other'],
};

/** Tách mã thành tiền tố và số: `CT-07` → `['CT', 7]`. */
export function splitCode(code: string): [string, number] {
  const m = /^([A-Z]+)-?(\d+)$/.exec(code);
  return m ? [m[1], Number(m[2])] : [code, -1];
}

/** Thứ tự tự nhiên của mã: theo tiền tố, rồi theo số (`CL2` trước `CL10`). */
export function compareCode(a: string, b: string): number {
  const [pa, na] = splitCode(a);
  const [pb, nb] = splitCode(b);
  if (pa !== pb) return pa < pb ? -1 : 1;
  return na - nb;
}

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const cmpVer = (a: string, b: string) =>
  compareRelease(parseVersion(a)!, parseVersion(b)!);

function checkSorted<T>(
  errors: string[],
  where: string,
  xs: readonly T[],
  key: (x: T) => string,
  cmp: (a: string, b: string) => number,
) {
  for (let i = 1; i < xs.length; i++) {
    if (cmp(key(xs[i - 1]), key(xs[i])) >= 0)
      errors.push(
        `${where}: not sorted or duplicate at ${key(xs[i])} (after ${key(xs[i - 1])})`,
      );
  }
}

function duplicates(xs: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const x of xs) (seen.has(x) ? dup : seen).add(x);
  return [...dup];
}

/** Bước 2: mọi kiểm chéo giữa các file. Trả danh sách lỗi, rỗng là xanh. */
export function crossCheck(d: SpecData): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);

  const specMinor = /^(\d+\.\d+)\./.exec(d.spec.spec)?.[1];
  const codeMap = new Map(d.codes.map((c) => [c.code as string, c]));
  const ruleCodes = new Set(d.rules.map((r) => r.code as string));

  // Sắp theo khoá định danh
  checkSorted(errors, 'codes.json', d.codes, (c) => c.code, compareCode);
  checkSorted(errors, 'rules.json', d.rules, (r) => r.code, compareCode);
  checkSorted(errors, 'keys.json', d.keys, (k) => k.canonical, cmpStr);
  checkSorted(
    errors,
    'exclusions.json',
    d.exclusions,
    (x) => x.id,
    compareCode,
  );
  checkSorted(
    errors,
    'blind-spots.json',
    d.blindSpots,
    (b) => b.id,
    compareCode,
  );
  checkSorted(
    errors,
    'capabilities.json',
    d.capabilities,
    (r) => r.from,
    cmpVer,
  );
  checkSorted(errors, 'glossary.json', d.glossary, (t) => t.term, cmpStr);

  // Sổ đăng ký
  for (const c of duplicates(d.codes.map((c) => c.code)))
    err(`codes.json: duplicate code ${c}`);
  for (const c of d.codes) {
    const [prefix] = splitCode(c.code);
    const owner = TOOL_PREFIXES.includes(prefix)
      ? 'tool'
      : CORE_PREFIXES.includes(prefix)
        ? 'spec-core'
        : null;
    if (!owner) err(`codes.json: ${c.code} has an unknown prefix ${prefix}`);
    else if (owner !== c.owner)
      err(`codes.json: ${c.code} must have owner ${owner}, prefix ${prefix}`);
    if (c.enforces !== undefined) {
      const t = codeMap.get(c.enforces);
      if (!t || t.owner !== 'spec-core')
        err(
          `codes.json: ${c.code} enforces ${c.enforces}, which is not a spec-core code`,
        );
    }
    if (c.kind === 'tool-rule' && !ruleCodes.has(c.code))
      err(`codes.json: tool-rule ${c.code} is not in rules.json`);
    if (c.kind === 'exclusion' && !d.exclusions.some((x) => x.id === c.code))
      err(`codes.json: exclusion ${c.code} is not in exclusions.json`);
    if (c.kind === 'lesson-error' && !d.blindSpots.some((b) => b.id === c.code))
      err(`codes.json: lesson-error ${c.code} is not in blind-spots.json`);
  }
  const registered = (
    where: string,
    code: string,
    kinds?: readonly string[],
  ) => {
    const c = codeMap.get(code);
    if (!c) err(`${where}: ${code} is not registered in codes.json`);
    else if (kinds && !kinds.includes(c.kind))
      err(
        `${where}: ${code} is registered as ${c.kind}, expected ${kinds.join(' | ')}`,
      );
  };

  // Luật
  const objectKinds: string[] = d.spec.objectKinds;
  for (const r of d.rules) {
    const w = `rules.json ${r.code}`;
    registered(w, r.code, ['spec-rule', 'forbidden', 'invariant', 'tool-rule']);
    const [prefix] = splitCode(r.code);
    if (prefix !== r.family)
      err(`${w}: family ${r.family} differs from prefix ${prefix}`);
    const levels = (r.severities as string[]).map((s) => Number(s.slice(1)));
    if ([...levels].sort().join() !== levels.join())
      err(`${w}: severities are not sorted`);
    if (r.tier !== Math.min(...levels))
      err(
        `${w}: tier ${r.tier} differs from the highest severity tier ${Math.min(...levels)}`,
      );
    const m = /^spec\/(\d+\.\d+)#(.+)$/.exec(r.specRef);
    if (!m || m[1] !== specMinor)
      err(`${w}: specRef ${r.specRef} must point to spec/${specMinor}`);
    else if (m[2] !== r.code)
      err(`${w}: specRef anchor ${m[2]} differs from the rule code`);
    for (const k of r.appliesTo)
      if (!objectKinds.includes(k))
        err(`${w}: appliesTo ${k} is not an object kind`);
    if (r.targetVersionOnly && r.dependsOnTolerance)
      err(`${w}: a targetVersionOnly rule cannot depend on tolerance`);
    if ('objects' in r.params)
      err(`${w}: params must not declare objects; surfaces fill it`);
    const entry = codeMap.get(r.code);
    if (
      entry &&
      (r.status === 'deprecated') !== (entry.status === 'deprecated')
    )
      err(`${w}: status differs from codes.json`);
  }

  // Văn bản
  const diagCodes = d.codes
    .filter((c) => c.kind === 'diagnostic')
    .map((c) => c.code);
  const required: string[] = [];
  for (const r of d.rules)
    for (const k of RULE_KEYS) required.push(`rule.${r.code}.${k}`);
  for (const c of diagCodes)
    for (const k of DIAG_KEYS) required.push(`diag.${c}.${k}`);
  for (const k of d.spec.reasonKinds)
    required.push(`reason.${k}`, `reason.${k}.unlock`);
  for (const x of d.exclusions) required.push(`exclusion.${x.id}`);
  required.push(...IMPORT_KEYS);
  const requiredSet = new Set(required);
  // Khoá theo biến thể: tuỳ chọn, nhưng phải có ở cả hai ngôn ngữ và thuộc một luật.
  const variantKeys = [
    ...new Set([...Object.keys(d.i18n.en), ...Object.keys(d.i18n.vi)]),
  ].filter((k) => {
    const m = VARIANT_RE.exec(k);
    return m !== null && ruleCodes.has(m[1]);
  });
  const variantSet = new Set(variantKeys);
  for (const k of variantKeys)
    for (const lang of ['en', 'vi'] as const)
      if (!(k in d.i18n[lang])) err(`i18n/${lang}.json: missing variant ${k}`);

  const parsed: Record<
    string,
    Map<string, ReturnType<typeof templateParams>>
  > = {};
  for (const lang of ['en', 'vi'] as const) {
    const table = d.i18n[lang];
    const f = `i18n/${lang}.json`;
    parsed[lang] = new Map();
    for (const k of required) if (!(k in table)) err(`${f}: missing ${k}`);
    for (const [k, v] of Object.entries(table)) {
      if (!requiredSet.has(k) && !variantSet.has(k))
        err(
          `${f}: ${k} does not belong to any rule, code, reason, exclusion or import text`,
        );
      if (v === '' && !k.endsWith('.unlock')) err(`${f}: ${k} is empty`);
      const p = parseTemplate(v);
      if (!p.ok) {
        err(`${f}: ${k}: ${p.error}`);
        continue;
      }
      parsed[lang].set(k, templateParams(p.parts));
      for (const part of p.parts) {
        if (part.t !== 'plural') continue;
        const cats = Object.keys(part.branches).sort().join();
        if (cats !== [...PLURAL_CATS[lang]].sort().join())
          err(
            `${f}: ${k}: plural ${part.name} must use exactly ${PLURAL_CATS[lang].join(', ')}`,
          );
      }
      // Quy tắc viết
      const lower = v.toLowerCase();
      for (const word of DEGREE_WORDS[lang])
        if (lower.includes(word)) err(`${f}: ${k}: degree adjective "${word}"`);
      for (const re of BLAME)
        if (re.test(v)) err(`${f}: ${k}: blaming wording`);
      for (const re of MARKUP)
        if (re.test(v)) err(`${f}: ${k}: Markdown or terminal codes`);
      if (lang === 'vi')
        for (const t of d.glossary)
          for (const bad of t.forbidden)
            if (lower.includes(bad.toLowerCase()))
              err(
                `${f}: ${k}: "${bad}" translates the glossary term "${t.term}"`,
              );
      const len = [...v].length;
      if (k.endsWith('.title') && len > 60)
        err(`${f}: ${k}: title has ${len} characters, max 60`);
      if (/\.mechanism(\.[a-z0-9_]+)?$/.test(k) && len > 200)
        err(`${f}: ${k}: mechanism has ${len} characters, max 200`);
      if (
        (k.endsWith('.dataSafety') || /\.dataSafety\.[a-z0-9_]+$/.test(k)) &&
        !SAFETY_PREFIX[lang].some((s) => v.startsWith(s))
      )
        err(
          `${f}: ${k}: must start with ${SAFETY_PREFIX[lang].map((s) => JSON.stringify(s.trim())).join(', ')}`,
        );
    }
  }
  const keyOf = (m: ReturnType<typeof templateParams> | undefined) =>
    m ? [...m.keys()].sort().join(',') : '';
  for (const k of [...required, ...variantKeys]) {
    const en = parsed.en.get(k);
    const vi = parsed.vi.get(k);
    if (en && vi && keyOf(en) !== keyOf(vi))
      err(
        `i18n: ${k}: parameters differ between en {${keyOf(en)}} and vi {${keyOf(vi)}}`,
      );
  }
  for (const k of [...required, ...variantKeys].filter(
    (k) => k.endsWith('.dataSafety') || /\.dataSafety\.[a-z0-9_]+$/.test(k),
  )) {
    const en = d.i18n.en[k];
    const vi = d.i18n.vi[k];
    if (en === undefined || vi === undefined) continue;
    const ie = SAFETY_PREFIX.en.findIndex((s) => en.startsWith(s));
    const iv = SAFETY_PREFIX.vi.findIndex((s) => vi.startsWith(s));
    if (ie >= 0 && iv >= 0 && ie !== iv)
      err(`i18n: ${k}: en and vi give different answers`);
  }
  for (const r of d.rules) {
    const declared = Object.keys(r.params).sort();
    for (const lang of ['en', 'vi'] as const) {
      const used = new Map<string, boolean>();
      const ruleKeys = [
        ...RULE_KEYS,
        ...variantKeys
          .filter((v) => v.startsWith(`rule.${r.code}.`))
          .map((v) => v.slice(`rule.${r.code}.`.length)),
      ];
      for (const k of ruleKeys) {
        const m = parsed[lang].get(`rule.${r.code}.${k}`);
        if (!m) continue;
        for (const [name, { plural }] of m) {
          if (k === 'action') continue;
          used.set(name, (used.get(name) ?? false) || plural);
        }
      }
      const f = `i18n/${lang}.json rule.${r.code}`;
      if ([...used.keys()].sort().join() !== declared.join())
        err(
          `${f}: parameters {${[...used.keys()].sort()}} differ from rules.json params {${declared}}`,
        );
      for (const [name, plural] of used)
        if (plural && r.params[name] !== 'number')
          err(`${f}: plural parameter ${name} must be declared number`);
      const action = parsed[lang].get(`rule.${r.code}.action`);
      if (action) {
        if (!action.has('objects')) err(`${f}.action: must contain {objects}`);
        for (const name of action.keys())
          if (name !== 'objects' && !(name in r.params))
            err(`${f}.action: parameter ${name} is not declared`);
      }
    }
  }

  // Khuôn lệnh sửa
  for (const t of duplicates(d.fixTemplates.map((t) => t.id)))
    err(`fix-templates.json: duplicate id ${t}`);
  for (const t of d.fixTemplates) {
    const w = `fix-templates.json ${t.id}`;
    registered(w, t.assumption, ['assumption']);
    const used = [...t.command.matchAll(/\{([a-zA-Z0-9]+)\}/g)].map(
      (m: RegExpMatchArray) => m[1],
    );
    if ([...new Set(used)].sort().join() !== [...t.params].sort().join())
      err(
        `${w}: placeholders {${[...new Set(used)].sort()}} differ from params {${[...t.params].sort()}}`,
      );
  }

  // Khoảng phiên bản
  const ranges = d.capabilities;
  if (ranges.length > 0 && ranges[0].from !== d.spec.broker.minSupported)
    err(
      `capabilities.json: first range starts at ${ranges[0].from}, not broker.minSupported ${d.spec.broker.minSupported}`,
    );
  ranges.forEach((r, i) => {
    const last = i === ranges.length - 1;
    if (last && r.to !== undefined)
      err(`capabilities.json: last range must be open-ended`);
    if (!last && r.to === undefined)
      err(`capabilities.json: range ${r.from} has no "to"`);
    if (r.to !== undefined && cmpVer(r.from, r.to) >= 0)
      err(`capabilities.json: range ${r.from} ends at or before it starts`);
    if (!last && r.to !== undefined && r.to !== ranges[i + 1].from)
      err(
        `capabilities.json: ranges ${r.from} and ${ranges[i + 1].from} overlap or leave a gap`,
      );
  });
  for (const t of d.spec.broker.tested)
    if (cmpVer(`${t}.0`, d.spec.broker.minSupported) < 0)
      err(`spec.json: tested ${t} is below minSupported`);

  // Khoá
  for (const field of ['canonical', 'argument', 'policy'] as const)
    for (const x of duplicates(
      d.keys.map((k) => k[field]).filter((x) => x !== undefined),
    ))
      err(`keys.json: duplicate ${field} ${x}`);
  for (const k of d.keys) {
    for (const r of k.usedBy)
      if (!ruleCodes.has(r))
        err(`keys.json ${k.canonical}: usedBy ${r} is not a rule`);
    if ([...k.usedBy].sort(compareCode).join() !== k.usedBy.join())
      err(`keys.json ${k.canonical}: usedBy is not sorted`);
    if (k.assumption !== undefined)
      registered(`keys.json ${k.canonical}`, k.assumption, ['assumption']);
  }

  // Loại trừ
  const MATCH_KINDS: Record<string, readonly string[]> = {
    nameEquals: ['exchange', 'queue'],
    namePrefix: ['exchange', 'queue'],
    exclusive: ['queue'],
    sourceEquals: ['binding'],
    queueEquals: ['consumer'],
    hasOutgoingBindings: ['exchange'],
  };
  for (const x of d.exclusions) {
    registered(`exclusions.json ${x.id}`, x.id, ['exclusion']);
    for (const m of Object.keys(x.match))
      if (!MATCH_KINDS[m]?.includes(x.kind))
        err(
          `exclusions.json ${x.id}: match key ${m} does not apply to ${x.kind}`,
        );
  }

  // Điểm mù
  d.blindSpots.forEach((b, i) => {
    const w = `blind-spots.json ${b.id}`;
    if (b.id !== `LE${i + 1}`)
      err(`${w}: expected LE${i + 1}; LE1 to LE20 must each appear once`);
    registered(w, b.id, ['lesson-error']);
    for (const r of b.rules)
      if (!ruleCodes.has(r)) err(`${w}: rule ${r} does not exist`);
    if ((b.caughtBy === 'doctor') !== b.rules.length > 0)
      err(`${w}: rules must be listed exactly when caughtBy is doctor`);
    if (b.plannedIn !== undefined && !['lint', 'decide'].includes(b.caughtBy))
      err(`${w}: plannedIn only applies to lint or decide`);
  });
  if (d.blindSpots.length !== 20)
    err(`blind-spots.json: expected 20 entries, found ${d.blindSpots.length}`);

  // spec.json
  d.spec.severities.forEach((s: Obj, i: number) => {
    if (s.level !== `S${i + 1}` || s.tier !== i + 1)
      err(`spec.json: severity ${i} must be S${i + 1} with tier ${i + 1}`);
  });

  return errors;
}
