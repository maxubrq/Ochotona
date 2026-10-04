# @ochotona/spec

Bản máy đọc được của spec Ocho. Mọi thứ nhiều gói, nhiều ngôn ngữ phải hiểu giống nhau đều nằm ở đây dưới dạng dữ liệu: danh mục luật, văn bản tiếng Anh và tiếng Việt, bảng năng lực theo phiên bản broker, bảng khoá argument và policy, loại trừ hệ thống, sổ đăng ký mã, và JSON Schema của các hợp đồng.

Gói không có logic nghiệp vụ và không có phụ thuộc lúc chạy, nên chạy được cả trong trình duyệt.

```
spec ← model ← rules, broker, compiler ← cli
```

## Dùng

```ts
import {
  rule,
  capabilitiesFor,
  defaultsFor,
  keyByArgument,
  format,
  parseVersion,
} from '@ochotona/spec';
import '@ochotona/spec/i18n/en'; // nạp văn bản tiếng Anh

rule('T2').severities; // ['S1', 'S3']

const v = parseVersion('4.3.0-rc.1')!;
capabilitiesFor(v); // { status: 'untested', caps, range }
defaultsFor(v, 'quorum'); // { overflow: 'drop-head', 'dead-letter-strategy': 'at-most-once', 'delivery-limit': 20 }
keyByArgument('x-delivery-limit')?.resolution; // 'lower_wins'

format('en', 'rule.T2.what', { count: 1240, since: '2026-09-12T03:10:00Z' });
// '1240 unroutable messages were dropped since 2026-09-12T03:10:00Z.'
```

Client ngôn ngữ khác đọc thẳng `data/*.json` và `schemas/`, cũng có trong gói npm.

## API

| Nhóm             | Xuất ra                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| Hằng             | `SPEC_VERSION`, `CONTRACTS`, `BROKER_SUPPORT`                                    |
| Phiên bản        | `parseVersion`, `compareVersion`, `compatKey`                                    |
| Luật             | `rules`, `rule`                                                                  |
| Năng lực         | `capabilityRanges`, `capabilitiesFor`, `defaultsFor`                             |
| Khoá             | `keys`, `keyByArgument`, `keyByPolicy`, `keyByCanonical`                         |
| Loại trừ         | `exclusions`, `exclusionsFor`                                                    |
| Mã, mức          | `codes`, `codeEntry`, `blindSpots`, `severities`, `exitCodes`                    |
| Văn bản          | `format`, `registerMessages`; `@ochotona/spec/i18n/en`, `@ochotona/spec/i18n/vi` |
| Schema, liên kết | `schemas`, `docsUrl`                                                             |

Kiểu literal (`RuleCode`, `DiagCode`, `I18nKey`, `Severity`…) được sinh từ dữ liệu.

## Cấu trúc

```
data/          dữ liệu gốc, chỉ sửa ở đây
schemas/data/  schema cho từng file trong data/
schemas/contracts/  finding-1, report-1, snapshot-1, ocho-yaml-0.1
src/gen/       sinh từ data/, có trong git, không sửa tay
src/           hàm tra cứu và format viết tay
scripts/       codegen và kiểm chéo, chỉ dùng lúc dev
```

## Phát triển

```sh
pnpm codegen        # kiểm data/ rồi sinh src/gen (Node ≥ 22.18)
pnpm codegen:check  # như trên, rồi báo lỗi nếu src/gen lệch so với git
pnpm build          # rollup → dist/
pnpm test           # vitest; test dist chạy sau build
pnpm typecheck
```

## Tài liệu

- [Spec của gói](./docs/spec.md): phạm vi, quyết định, chính sách phiên bản, mọi bảng dữ liệu.
- [Sửa dữ liệu](./docs/editing-data.md): thêm luật, mã, văn bản; các kiểm chéo chạy khi codegen.
- [Ghi chú hiện thực](./docs/implementation-notes.md): chỗ mã nguồn khác hoặc thêm so với spec.
