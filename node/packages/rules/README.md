# @ochotona/rules

22 luật của Ocho và bộ máy chạy chúng trên một `Actual`. Đầu ra là danh sách `RuleResult` có cấu trúc, ba việc làm trước, và finding theo hợp đồng `finding:1`; chữ hiển thị dựng sau, theo ngôn ngữ.

Luật là hàm thuần: không I/O, không đồng hồ (`now` nằm trong `Ctx`), không ngẫu nhiên. Test luật không cần Docker. Phụ thuộc lúc chạy chỉ có `@ochotona/spec` và `@ochotona/model`.

```
spec ← model ← rules ← cli
```

## Nguyên tắc

- **Không đoán (CL2).** Mỗi luật khai `requires` và `optional`. Trường cần mà `unknown` thì luật ra `not_checked` kèm lý do của chính trường đó, không bao giờ `pass`.
- **Đọc gì khai nấy.** Kiểu `View` của luật sinh từ `requires`, `optional`; đọc trường không khai là lỗi biên dịch. Cùng danh sách đó là đầu vào cho kế hoạch đọc của model.
- **Mức do `evaluate` trả.** Một hàm trả cả kết quả, mức, độ khẩn và biến thể, vì chúng đọc cùng dữ liệu.
- **S1 phải có căn cứ (CL4).** S1 cần ít nhất một bằng chứng `observed`, trừ khi đối tượng thuộc luồng `strict`. Chạy thật thì hạ xuống S3 và ghi vào `internal`; trong test thì ném.
- **Tất định.** Cùng đầu vào cho cùng JSON đến từng byte.

## Dùng

```ts
import { buildActual, planRead } from '@ochotona/model';
import {
  makeCtx,
  planActions,
  readNeeds,
  runRules,
  selectRules,
  toFinding,
} from '@ochotona/rules';
import '@ochotona/spec/i18n/en';

const rules = selectRules({ targetVersion: false, includeExperimental: false });
const needs = readNeeds(rules); // endpoint, Prometheus, /api/users cho kế hoạch đọc
const plan = planRead({
  ...needs,
  users: runsAsAdmin && needs.wantsUsers,
  scope,
});

const actual = buildActual(raw, buildContext);
const ctx = makeCtx({ actual, desired, targetVersion: null, now });

const { results, internal } = runRules(ctx, rules, {
  waivers: desired?.waivers ?? [],
  scope: { vhosts: 'all', flow: null },
  mode: 'production',
});

const { actions, uncheckedS1 } = planActions(results); // ba việc làm trước
const findings = results.map((r) => toFinding(r, 'en'));
// internal khác rỗng: in báo cáo bình thường rồi thoát 5
```

## API chính

| Nhóm      | Hàm                                                        |
| --------- | ---------------------------------------------------------- |
| Chọn luật | `catalog`, `selectRules`, `requiredPaths`                  |
| Chạy      | `makeCtx`, `runRules`, `sortResults`                       |
| Hành động | `planActions`, `toActionText`                              |
| Finding   | `toFinding`, `textKey`                                     |
| Lệnh sửa  | `policyFix`, `renderTemplate`, `shellQuote`, `escapeRegex` |
| Viết luật | `defineRule`, `modeOf`; kiểu `RuleDef`, `View`, `Verdict`  |

## Luật

| Nhóm            | Luật                                            |
| --------------- | ----------------------------------------------- |
| An toàn dữ liệu | T1, T2, T3, T4, T5, T9, R1, C1, L3              |
| Nâng cấp        | VT1, VT2 (chỉ với `--target-version`), VT3, VT4 |
| Vận hành        | N1, N2, N3, Q3, C2, F4, DX1, DX2, DX3           |

Metadata, văn bản en/vi, ngưỡng số và khuôn lệnh `rabbitmqadmin` nằm trong dữ liệu của `@ochotona/spec` (`rules.json`, `i18n/`, `fix-templates.json`); hiệu chỉnh chúng là sửa dữ liệu, không sửa code luật.

## Cấu trúc mã

```
src/
  types.ts paths.ts      kiểu; ngữ pháp requires, kiểu View, phân giải quan hệ
  define.ts              defineRule
  engine.ts              vòng chạy, loại trừ, miễn trừ, hợp đồng, sắp xếp
  select.ts ctx.ts       chọn luật, requiredPaths, dựng Ctx
  read-plan.ts           FieldPath → endpoint cho model.planRead
  actions.ts finding.ts  ba việc làm trước, finding:1
  fix.ts helpers.ts      lệnh sửa từ khuôn; bằng chứng, dung sai, ngưỡng
  catalog/               mỗi luật một file
fixtures/
  builder.ts fixture.ts  dựng RawResponses tổng hợp, đi qua model.buildActual thật
  unit/                  ca đơn vị, mỗi luật một file
  integration/           kỳ vọng trên bản ghi thô của ma trận SUT
  coverage-matrix.ts     ô phủ bắt buộc cho mỗi luật
```

## Phát triển

```sh
pnpm build             # rollup → dist/
pnpm test              # vitest: fixture, tích hợp trên bản ghi, tính chất, hiệu năng
pnpm coverage-matrix
pnpm test:mutation     # Stryker trên tám luật S1, ngưỡng 85%
pnpm test:live         # lệnh sửa trên broker SUT thật, xem SUT/README.md
pnpm typecheck
pnpm format
```

## Tài liệu

- [docs/spec.md](docs/spec.md): spec đầy đủ (kiểu, ngữ pháp `requires`, bộ máy, đặc tả từng luật, bằng chứng và độ khẩn, finding, fixture, định nghĩa hoàn thành).
- [docs/implementation-notes.md](docs/implementation-notes.md): chỗ mã khác spec, quyết định theo luật, và phần định nghĩa hoàn thành còn thiếu.
