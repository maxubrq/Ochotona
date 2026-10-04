# Spec @ochotona/spec v0.1

Oct 4, 2026 · @Max Darius

## Phạm vi và quyết định

`@ochotona/spec` là bản máy đọc được của Spec v0.4: mọi thứ mà nhiều gói, nhiều ngôn ngữ phải hiểu giống nhau đều nằm ở đây dưới dạng dữ liệu, không nằm rải rác trong code. Gói không có logic nghiệp vụ; nó chỉ có dữ liệu, kiểu sinh từ dữ liệu, và vài hàm tra cứu thuần.

| Gói này giữ | Ai đọc |
| --- | --- |
| Danh mục luật: mã, phạm vi, mức có thể có, tham chiếu spec và lesson | `rules`, `cli`, `ocho-desk` |
| Văn bản tiếng Anh và tiếng Việt của luật, mã chẩn đoán, lý do `unknown` | `cli`, `ocho-desk` |
| Bảng năng lực theo phiên bản broker, gồm mặc định dựng sẵn | `model`, `rules`, `compiler` |
| Bảng khoá argument và policy | `model`, `compiler` |
| Danh sách loại trừ hệ thống | `model`, `rules` |
| Mức nghiêm trọng, kết quả, exit code, sổ đăng ký mọi mã | Mọi gói |
| JSON Schema của bốn hợp đồng: finding, report, snapshot, `ocho.yaml` | Mọi gói, công cụ ngoài, editor |

Ngoài phạm vi: hàm chấm luật (`rules`), thuật toán phân giải giá trị hiệu lực (`model`), định dạng số và ngày theo locale (`cli`).

**Bốn quyết định.**

1. **Dữ liệu gốc là JSON, không phải TypeScript.** Spec lõi hứa client ngôn ngữ khác về sau dùng chung một nghĩa (mục 0 của spec). Nếu dữ liệu gốc là code TS, client Go hay Python phải chép tay và sẽ lệch. Dữ liệu gốc nằm trong `data/*.json`, có JSON Schema riêng; module TS được sinh từ đó lúc build.
2. **Chỉ hàm tra cứu thuần.** Gói được có hàm như `capabilitiesFor(version)` hay `rule('T2')`, nhưng không được có hàm quyết định kết quả. Ranh giới: hàm nào cần `Actual` là hàm sai chỗ.
3. **Một sổ đăng ký cho mọi mã.** Mã luật, mã chẩn đoán, mã giả định, mã bất biến đều đăng ký ở một file, có test chặn trùng. Spec CLI từng đặt DX1 đến DX3 sau khi đặt nhầm D1 đến D3 trùng mã vai trò bàn đỡ; sổ đăng ký biến loại lỗi đó thành lỗi build.
4. **Không phụ thuộc lúc chạy.** Gói không import gì, kể cả `node:` module, để chạy được trong trình duyệt của `ocho-desk` về sau.

## Cấu trúc gói và sinh mã

Người sửa spec chỉ sửa file trong `data/`; mọi thứ khác được sinh ra hoặc kiểm tra từ đó.

```
packages/spec/
  data/
    spec.json              phiên bản spec, phiên bản các hợp đồng
    codes.json             sổ đăng ký mọi mã
    rules.json             danh mục luật
    capabilities.json      bảng năng lực theo phiên bản
    keys.json              bảng khoá argument và policy
    exclusions.json        loại trừ hệ thống
    blind-spots.json       lỗi của lesson và nơi bắt chúng
    i18n/en.json
    i18n/vi.json
  schemas/
    data/                  schema cho từng file trong data/
    contracts/             finding-1.json, report-1.json, snapshot-1.json, ocho-yaml-0.1.json
  src/
    gen/                   sinh từ data/, có trong git, không sửa tay
    lookup.ts              hàm tra cứu viết tay
    index.ts
  scripts/codegen.ts       chỉ dùng lúc dev
```

**Vì sao JSON.** Mọi ngôn ngữ parse JSON không cần thư viện ngoài. YAML dễ đọc hơn nhưng cần thư viện và có những chỗ hiểu khác nhau giữa các bản cài đặt (`no` thành `false`, số bát phân), đúng loại lệch mà gói này tồn tại để chặn. Ghi chú trong JSON dùng khoá `$comment`.

**Quy trình `codegen`, chạy theo thứ tự, dừng ở lỗi đầu tiên.**

1. Kiểm từng file `data/*.json` với schema tương ứng trong `schemas/data/` (Ajv, chế độ strict).
2. Kiểm chéo giữa các file: mọi mã nằm trong `codes.json`; mọi khoá văn bản luật mà `rules.json` đòi đều có ở cả `en.json` và `vi.json`, cùng tập tham số; mọi `specRef` thuộc danh sách neo hợp lệ; các khoảng phiên bản trong `capabilities.json` không chồng nhau và không hở.
3. Sinh `src/gen/*.ts`: dữ liệu dạng `as const` và kiểu literal (`RuleCode = 'T2' | 'R1' | …`, `CapabilityKey`, `I18nKey`).
4. Định dạng bằng Prettier.

**Vì sao commit mã sinh ra.** Người review thấy ngay một thay đổi dữ liệu làm đổi kiểu nào, và các gói khác trong monorepo dùng được mà không cần bước build. CI chạy lại `codegen` rồi `git diff --exit-code src/gen`; lệch là hỏng.

**Quy ước dữ liệu.** Mảng có khoá định danh được sắp theo khoá đó (test kiểm). Không có giá trị `null` mang nghĩa "không biết": trong spec, mọi thứ đều đã biết; thiếu thì khoá vắng mặt và schema nói rõ khoá nào được vắng.

## Phiên bản

Có ba thứ mang số phiên bản và chúng đi độc lập: spec lõi, từng hợp đồng JSON, và chính gói npm. Mục này cũng là bản nháp đầu cho việc 4 của bản đánh giá (chính sách phiên bản cho spec).

```json
{
  "spec": "0.4.0",
  "contracts": { "finding": 1, "report": 1, "snapshot": 1, "ochoYaml": "0.1" },
  "broker": { "minSupported": "3.13.0", "tested": ["3.13", "4.2", "4.3"] }
}
```

**Đơn vị tương thích của spec.** Header `ocho-spec` và trường `spec` trong `ocho.yaml` mang `major.minor`. Từ 1.0 trở đi, hai bên tương thích khi cùng major. Trước 1.0, mỗi minor có thể phá vỡ, nên đơn vị tương thích là `0.minor`: `0.4` và `0.5` được coi là khác major theo nghĩa của mục 6.5 trong spec lõi. Hàm `compatKey(version)` trả `"1"` cho `1.x.y` và `"0.4"` cho `0.4.y`.

**Phân loại thay đổi của gói.**

| Thay đổi | Gói | Hợp đồng | Ghi trong changelog |
| --- | --- | --- | --- |
| Sửa câu chữ, sửa bản dịch | patch | — | Bình thường |
| Thêm luật, thêm khoảng phiên bản broker, thêm khoá | minor | — | Bình thường |
| Sửa một giá trị trong bảng năng lực, đổi mức có thể có của luật | minor | — | Mục "behavior change": nêu luật nào sẽ ra kết quả khác |
| Đánh dấu luật hoặc mã `deprecated` | minor | — | Ngày dự kiến gỡ |
| Gỡ luật hoặc mã | major | — | Chỉ sau thời hạn deprecate |
| Thêm trường tuỳ chọn vào hợp đồng | minor | Giữ số | Bình thường |
| Thêm trường bắt buộc, đổi nghĩa trường | major | Tăng số | Hướng dẫn chuyển đổi |

**Thời hạn deprecate.** Luật hoặc mã được đánh dấu `deprecated` phải tồn tại qua ít nhất hai bản minor và 90 ngày, lấy mốc muộn hơn. Trong thời gian đó nó vẫn chạy, và CLI in một dòng nhắc khi kết quả có dùng tới nó.

## Danh mục luật

`rules.json` mô tả mỗi luật là gì; `@ochotona/rules` cài đặt luật đó chạy thế nào. Hai bên được nối bằng test: mức mà hàm `severity` của luật trả ra phải nằm trong `severities` đã khai, và mọi tham số luật truyền vào khuôn câu phải có trong `params`.

```ts
export interface RuleMeta {
  readonly code: RuleCode;                       // 'T2'
  readonly family: 'T' | 'R' | 'C' | 'N' | 'Q' | 'L' | 'VT' | 'DX' | 'F';
  readonly tier: 1 | 2 | 3 | 4 | 5;              // bậc I6 cao nhất luật bảo vệ
  readonly appliesTo: readonly ObjectKind[];
  readonly severities: readonly Severity[];       // mọi mức luật có thể trả
  readonly dependsOnTolerance: boolean;
  readonly targetVersionOnly: boolean;            // chỉ chạy với --target-version
  readonly sources: readonly ('http.list' | 'http.stats' | 'prometheus')[];  // để tài liệu; requires thật ở rules
  readonly fix: 'policy' | 'argument_migration' | 'client_change' | 'config' | 'none';
  readonly specRef: string;                       // 'spec/0.4#T2'
  readonly lessonRefs: readonly string[];         // ['lesson#9.3']
  readonly params: Readonly<Record<string, 'string' | 'number' | 'instant' | 'list'>>;
  readonly status: 'active' | 'experimental' | 'deprecated';
  readonly since: string;                         // phiên bản gói đầu tiên có luật
  readonly deprecatedAt?: string;                 // ngày, bắt buộc khi status = deprecated
}
```

```json
{
  "code": "T2",
  "family": "T",
  "tier": 1,
  "appliesTo": ["exchange"],
  "severities": ["S1", "S3"],
  "dependsOnTolerance": true,
  "targetVersionOnly": false,
  "sources": ["http.list", "http.stats", "prometheus"],
  "fix": "policy",
  "specRef": "spec/0.4#T2",
  "lessonRefs": ["lesson#2.chang-2", "lesson#9.3"],
  "params": { "count": "number", "since": "instant", "exchanges": "list" },
  "status": "active",
  "since": "0.1.0"
}
```

**Đủ 22 luật của v0.1.** Cột "Lesson" là số thứ tự lỗi trong lesson mục 9; cột "Sửa" quyết định CLI in loại lệnh sửa nào.

| Mã | Áp cho | Mức có thể | Theo dung sai | Nguồn | Sửa | Lesson |
| --- | --- | --- | --- | --- | --- | --- |
| T2 | exchange | S1, S3 | có | list, stats, prometheus | policy | 3 |
| R1 | channel | S1, S3 | có | list, stats | client\_change | 1 |
| C1 | consumer | S1, S3 | có | list | client\_change | 4 |
| T1 | queue | S1, S3 | có | list | argument\_migration | 7 |
| T5 | queue | S1 | không | list | policy | 9 |
| T4 | queue | S1, S3 | không (theo phiên bản) | list | policy | 9 |
| T3 | queue | S1, S3 | có | list | policy | 16 |
| T9 | queue | S1, S3 | có | list | policy | — |
| L3 | exchange, queue | S1, S3 | không | list | config | — |
| VT1 | queue | S1 | không, chỉ với `--target-version` | list | argument\_migration | 7 |
| VT2 | queue | S1 | không, chỉ với `--target-version` | list | policy | 9 |
| VT3 | broker | S3 | không | list | config | — |
| VT4 | node | S3 | không | list | config | — |
| N1 | connection | S3 | không | list | client\_change | 15 |
| N2 | connection | S3 | không | list | client\_change | — |
| N3 | connection | S3 | không | list | client\_change | — |
| Q3 | connection | S3 | không | list | config | — |
| C2 | consumer | S3, S4 | không | list, stats | client\_change | 12 |
| F4 | queue | S3 | không | stats, prometheus | client\_change | 11 |
| DX1 | queue | S3 | không | stats | config | 16 |
| DX2 | node | S3 | không | list | config | §4 |
| DX3 | broker | S5 | không | stats | client\_change | 13, 18 |

Luật `experimental` chạy nhưng không bao giờ làm exit khác 0 và được in dưới một tiêu đề riêng. Đây là đường để thêm luật mới vào bản phát hành mà chưa đặt cược precision S1 lên nó.

## Văn bản và i18n

Mọi câu mà người dùng đọc về một luật, một mã chẩn đoán hay một lý do `unknown` nằm trong `i18n/<lang>.json`. Chữ của giao diện riêng từng bề mặt (tiêu đề "Do these first", nhãn cột) thuộc `cli` hoặc `ocho-desk`, không thuộc gói này.

**Khoá.**

| Khoá | Nội dung | Ràng buộc |
| --- | --- | --- |
| `rule.<MÃ>.title` | Tên phát hiện, dạng mệnh đề | ≤ 60 ký tự |
| `rule.<MÃ>.what` | Chuyện gì xảy ra | Có số và mốc thời gian khi luật có |
| `rule.<MÃ>.dataSafety` | Dữ liệu có an toàn không | Mở đầu bằng câu trả lời: `No.`, `Yes.`, `Not known.` / `Không.`, `Có.`, `Chưa biết.` |
| `rule.<MÃ>.next` | Làm gì tiếp | Đúng một bước, thể mệnh lệnh |
| `rule.<MÃ>.mechanism` | Cơ chế | Một câu, ≤ 200 ký tự |
| `rule.<MÃ>.action` | Dòng trong "ba việc làm trước" | Thể mệnh lệnh, có `{objects}` |
| `diag.<MÃ>.message` | Mã chẩn đoán (Y, SNAP, CX, OC) | Như `what` |
| `diag.<MÃ>.next` | Cách sửa | Như `next` |
| `reason.<kind>` | Vì sao `unknown` | Ví dụ "management statistics are disabled" |
| `reason.<kind>.unlock` | Cách mở khoá luật bị `not_checked` | Bỏ trống được khi không có cách |

**Khuôn câu.** Tham số `{tên}`, và đúng một cấu trúc ICU là số nhiều: `{count, plural, one {# message} other {# messages}}`, với `#` là số đã định dạng. Không dùng `select`, không lồng. Không có ký tự `{` hay `}` theo nghĩa đen; test chặn. Số, thời điểm và danh sách được bề mặt định dạng theo locale; khuôn câu chỉ nhận giá trị thô.

**Quy tắc viết, có test kiểm phần kiểm được.**

1. Thì hiện tại, không đổ lỗi ("you forgot" bị cấm).
2. Không dùng tính từ mức độ (`critical`, `severe`, `nghiêm trọng`): mức đã có ở cột mức.
3. Tiếng Việt giữ nguyên thuật ngữ RabbitMQ đúng như spec lõi: queue, exchange, alternate exchange, policy, dead-letter, consumer. File `i18n/glossary.json` liệt kê các thuật ngữ này; test chặn bản dịch của chúng trong `vi.json`.
4. Không Markdown, không mã màu terminal.
5. Bản tiếng Việt phải có đúng tập tham số của bản tiếng Anh.

**Ví dụ: T2 và T5.**

```json
{
  "rule.T2.title": "Unroutable messages are being dropped",
  "rule.T2.what": "{count, plural, one {# unroutable message was} other {# unroutable messages were}} dropped since {since}.",
  "rule.T2.dataSafety": "No. Those messages are gone, and {exchanges} can drop more.",
  "rule.T2.next": "Set an alternate exchange on these exchanges through a policy.",
  "rule.T2.mechanism": "An exchange stores nothing: with no matching binding and no alternate exchange, the broker discards the message and still confirms it.",
  "rule.T2.action": "Add an alternate exchange to {objects}",
  "rule.T5.title": "Dead-lettering can lose messages",
  "rule.T5.what": "Dead-letter strategy is {strategy} with overflow {overflow}.",
  "rule.T5.dataSafety": "No. A dead-lettered message can be lost before it reaches the parking-lot.",
  "rule.T5.next": "Set dead-letter-strategy at-least-once and overflow reject-publish together.",
  "rule.T5.mechanism": "At-least-once dead-lettering needs overflow reject-publish; without it the broker silently falls back to at-most-once.",
  "rule.T5.action": "Make dead-lettering at-least-once on {objects}"
}
```

```json
{
  "rule.T2.title": "Message không định tuyến được đang bị bỏ",
  "rule.T2.what": "{count, plural, other {# message không định tuyến được đã bị bỏ}} kể từ {since}.",
  "rule.T2.dataSafety": "Không. Các message đó đã mất, và {exchanges} còn có thể làm mất thêm.",
  "rule.T2.next": "Đặt alternate exchange cho các exchange này qua policy.",
  "rule.T2.mechanism": "Exchange không lưu gì: không có binding khớp và không có alternate exchange thì broker bỏ message mà vẫn gửi confirm.",
  "rule.T2.action": "Thêm alternate exchange cho {objects}",
  "rule.T5.title": "Dead-letter có thể làm mất message",
  "rule.T5.what": "Dead-letter strategy là {strategy}, overflow là {overflow}.",
  "rule.T5.dataSafety": "Không. Message bị dead-letter có thể mất trước khi tới parking-lot.",
  "rule.T5.next": "Đặt cùng lúc dead-letter-strategy at-least-once và overflow reject-publish.",
  "rule.T5.mechanism": "Dead-letter at-least-once cần overflow reject-publish; thiếu nó, broker lặng lẽ quay về at-most-once.",
  "rule.T5.action": "Chuyển dead-letter sang at-least-once cho {objects}"
}
```

## Bảng năng lực theo phiên bản

`capabilities.json` là bản máy đọc được của mục 9 trong spec lõi, cộng các mặc định dựng sẵn mà `Effective` cần. Mỗi khoảng phiên bản mang đủ mọi trường; không có kế thừa giữa các khoảng, để đọc một khoảng là thấy hết.

```ts
export interface CapabilityRange {
  readonly from: string;            // bao gồm, '4.0.0'
  readonly to?: string;             // không bao gồm; vắng = tới vô cực
  readonly caps: Capabilities;
}

export interface Capabilities {
  readonly retry: {
    readonly mechanism: 'dlx_ttl_tiers' | 'quorum_delayed_retry';
    readonly transientFailure: 'reject_requeue_false' | 'reject_requeue_true';
    readonly mainQueueDeadLetter: 'ocho.retry' | 'ocho.parking';
  };
  readonly nackCountsTowardDeliveryLimit: boolean;
  readonly consumerTimeoutScope: 'channel' | 'consumer';
  readonly mirroredClassicQueues: 'available' | 'removed';
  readonly metadataStores: readonly ('mnesia' | 'khepri')[];
  readonly metadataDefault: 'mnesia' | 'khepri';
  readonly defaults: {
    readonly classic: { readonly overflow: 'drop-head' };
    readonly quorum: {
      readonly overflow: 'drop-head';
      readonly deadLetterStrategy: 'at-most-once';
      readonly deliveryLimit: number | null;     // null = không giới hạn
    };
  };
  readonly ochoSets: { readonly deliveryLimit: number };   // giá trị Ocho đặt (T4)
  readonly endpoints: {
    readonly deprecatedFeaturesUsed: boolean;
    readonly vhostDefaultQueueType: boolean;
  };
  // /api/{connections,channels,consumers} khi tắt bộ thu thống kê
  readonly statsOffLists: {
    readonly connections: 'listed' | 'rejected' | 'empty';
    readonly channels: 'listed' | 'rejected' | 'empty';
    readonly consumers: 'listed' | 'rejected' | 'empty';
  };
}
```

**Giá trị v0.1.** Spec lõi gộp 4.0 đến 4.2 làm một cột; gói này tách 4.2 riêng vì metadata store mặc định đổi sang Khepri ở 4.2.

| Trường | 3.13 | 4.0, 4.1 | 4.2 | 4.3 trở lên |
| --- | --- | --- | --- | --- |
| `retry.mechanism` | `dlx_ttl_tiers` | `dlx_ttl_tiers` | `dlx_ttl_tiers` | `quorum_delayed_retry` |
| `retry.transientFailure` | `reject_requeue_false` | `reject_requeue_false` | `reject_requeue_false` | `reject_requeue_true` |
| `retry.mainQueueDeadLetter` | `ocho.retry` | `ocho.retry` | `ocho.retry` | `ocho.parking` |
| `nackCountsTowardDeliveryLimit` | true | true | true | false |
| `consumerTimeoutScope` | `channel` | `channel` | `channel` | `consumer` |
| `mirroredClassicQueues` | `available` | `removed` | `removed` | `removed` |
| `metadataStores` | mnesia | mnesia, khepri | mnesia, khepri | khepri |
| `metadataDefault` | mnesia | mnesia | khepri | khepri |
| `defaults.quorum.deliveryLimit` | null | 20 | 20 | 20 |
| `ochoSets.deliveryLimit` | 10 | 10 | 10 | 10 |
| `endpoints.deprecatedFeaturesUsed` | true (GC17) | true | true | true |
| `endpoints.vhostDefaultQueueType` | true (GC15) | true | true | true |
| `statsOffLists.connections` | `listed` | `listed` | `listed` | `empty` |
| `statsOffLists.channels` | `rejected` | `rejected` | `rejected` | `empty` |
| `statsOffLists.consumers` | `rejected` | `rejected` | `rejected` | `rejected` |

`statsOffLists` ghi điều quan sát được trên ma trận `SUT/` (4 tháng 10 năm 2026) khi đặt `management_agent.disable_metrics_collector = true`: `listed` trả phần tử thật (ít trường hơn), `rejected` trả 400, `empty` trả 200 với danh sách rỗng không đáng tin. Model đổi `empty` thành `unknown: source_unavailable`, kể cả khi danh sách có vẻ hợp lệ.

Các mặc định `overflow` và `deadLetterStrategy` giống nhau ở mọi khoảng nên không lặp trong bảng; trong file JSON chúng vẫn có đủ ở từng khoảng.

**Tra cứu.**

```ts
export function capabilitiesFor(v: Version):
  | { status: 'supported'; caps: Capabilities; range: CapabilityRange }
  | { status: 'untested'; caps: Capabilities; range: CapabilityRange }   // trong khoảng, nhưng major.minor ngoài danh sách đã test
  | { status: 'unsupported' };                                          // nhỏ hơn broker.minSupported

export function defaultsFor(v: Version, type: 'classic' | 'quorum' | 'stream'):
  Readonly<Record<string, ArgValue>>;    // khoá chuẩn → giá trị; stream trả {}
```

`untested` không chặn chạy: CLI in một dòng ở pha nhận diện ("RabbitMQ 4.4 is newer than the versions Ocho was tested on") và dùng khoảng cuối. `unsupported` thì CLI dừng với exit 3. `defaultsFor` là thứ model gọi ở bước 6 của thuật toán `Effective`; khoá `delivery-limit` vắng trong kết quả khi giá trị là `null`.

## Bảng khoá argument và policy

`keys.json` là nguồn gốc duy nhất của bảng khoá mà mục `Effective` ở tab model đang in ra. Model không viết cứng tên khoá nào; nó tra bảng này để đổi tên argument và khoá policy về khoá chuẩn, và để biết quy tắc gộp.

```ts
export interface KeyDef {
  readonly canonical: string;                       // 'dead-letter-exchange'
  readonly argument?: string;                       // 'x-dead-letter-exchange'
  readonly policy?: string;                         // 'dead-letter-exchange'
  readonly appliesTo: readonly ('exchange' | 'classic' | 'quorum' | 'stream')[];
  readonly resolution: 'argument_wins' | 'lower_wins' | 'argument_only';
  readonly valueType: 'string' | 'integer' | 'enum';
  readonly enum?: readonly string[];
  readonly unit?: 'ms' | 'bytes' | 'count';
  readonly operatorPolicyAllowed: boolean;
  readonly usedBy: readonly RuleCode[];
  readonly assumption?: AssumptionCode;             // 'GC10'
}
```

```json
{
  "canonical": "delivery-limit",
  "argument": "x-delivery-limit",
  "policy": "delivery-limit",
  "appliesTo": ["quorum"],
  "resolution": "lower_wins",
  "valueType": "integer",
  "unit": "count",
  "operatorPolicyAllowed": true,
  "usedBy": ["T4", "VT2"],
  "assumption": "GC10"
}
```

**Mười một khoá của v0.1.**

| Khoá chuẩn | Argument | Policy | Áp cho | Gộp | Kiểu | Operator policy được đặt |
| --- | --- | --- | --- | --- | --- | --- |
| `alternate-exchange` | `alternate-exchange` | `alternate-exchange` | exchange | argument\_wins | string | không |
| `dead-letter-exchange` | `x-dead-letter-exchange` | `dead-letter-exchange` | classic, quorum | argument\_wins | string | không |
| `dead-letter-routing-key` | `x-dead-letter-routing-key` | `dead-letter-routing-key` | classic, quorum | argument\_wins | string | không |
| `dead-letter-strategy` | `x-dead-letter-strategy` | `dead-letter-strategy` | quorum | argument\_wins | enum | không |
| `overflow` | `x-overflow` | `overflow` | classic, quorum | argument\_wins | enum | không |
| `max-length` | `x-max-length` | `max-length` | classic, quorum | lower\_wins | integer, count | có |
| `max-length-bytes` | `x-max-length-bytes` | `max-length-bytes` | classic, quorum, stream | lower\_wins | integer, bytes | có |
| `message-ttl` | `x-message-ttl` | `message-ttl` | classic, quorum | lower\_wins | integer, ms | có |
| `expires` | `x-expires` | `expires` | classic, quorum | lower\_wins | integer, ms | có |
| `delivery-limit` | `x-delivery-limit` | `delivery-limit` | quorum | lower\_wins | integer, count | có |
| `queue-type` | `x-queue-type` | không có | classic, quorum, stream | argument\_only | enum | không |

**Tra cứu.** `keyByArgument(name)` và `keyByPolicy(name)` trả `KeyDef` hoặc `undefined`. Khoá không có trong bảng là `undefined`; model coi nó là `argument_wins` và đưa vào `Effective` để `explain` in đủ, đúng như tab model đã ghi. Cột "Operator policy được đặt" dùng cho bất thường `unexpected_operator_key`: operator policy mang khoá có giá trị `false` ở cột này là dữ liệu broker không cho phép.

## Loại trừ hệ thống

Danh sách loại trừ trước đây xuất hiện hai lần: ở bộ máy luật (tab v0.1) và ở `normalizeTopology` (tab model), với hai tập hơi khác nhau. Gói này giữ nó một lần, dưới dạng bộ khớp khai báo, và ghi rõ mỗi mục áp cho phạm vi nào.

```ts
export interface Exclusion {
  readonly id: ExclusionCode;                        // 'EX1'
  readonly kind: 'exchange' | 'queue' | 'binding' | 'consumer';
  readonly match: {
    readonly nameEquals?: string;
    readonly namePrefix?: string;
    readonly exclusive?: true;
    readonly sourceEquals?: string;                  // binding
    readonly queueEquals?: string;                   // consumer
    readonly hasOutgoingBindings?: false;            // exchange không mang luồng nào
  };
  readonly scopes: readonly ('topology' | 'rules')[];
  readonly rulesOutcome: 'skip' | 'not_applicable_with_note';
}
```

Các điều kiện trong `match` là AND. Từ vựng của `match` cố định ở sáu khoá trên; thêm khoá mới là thay đổi minor và phải có cài đặt ở cả model và rules trong cùng PR.

| Mã | Đối tượng | Khớp | Topology | Luật | Lý do |
| --- | --- | --- | --- | --- | --- |
| EX1 | exchange | tên `""` | loại | bỏ qua | Exchange mặc định, không cấu hình được |
| EX2 | exchange | tiền tố `amq.` | loại | — | Tiền tố dành riêng, broker tự tạo |
| EX3 | exchange | tiền tố `amq.`, không có binding đi ra | — | bỏ qua | Không mang luồng nào; `amq.topic` có binding (MQTT) vẫn được chấm |
| EX4 | queue | `exclusive` | loại | bỏ qua | Queue tạm của một connection |
| EX5 | queue | tiền tố `amq.gen-` | loại | bỏ qua | Tên do broker sinh |
| EX6 | queue | tiền tố `mqtt-subscription-` | loại | `not_applicable` kèm ghi chú | Thuộc T11, T12, ngoài phạm vi v0.1 |
| EX7 | queue | tiền tố `ocho.` | — | bỏ qua | Đối tượng hệ thống của Ocho, có luật riêng về sau; vẫn nằm trong topology vì Ocho quản lý chúng |
| EX8 | binding | nguồn `""` | loại | bỏ qua | Binding ngầm của exchange mặc định |
| EX9 | consumer | queue `amq.rabbitmq.reply-to` | — | bỏ qua | Direct reply-to bắt buộc không ack; không phải lỗi C1 |

Lý do của mỗi mục có văn bản `exclusion.<MÃ>` trong i18n, để `explain` và ghi chú `not_applicable` in được. EX9 trước đây là một "mẫu gần giống" riêng của C1; chuyển nó thành loại trừ hệ thống làm cho mọi luật đọc consumer cùng được hưởng, không chỉ C1.

## Mức, kết quả, exit code, sổ đăng ký mã

Sổ đăng ký đã bắt được một va chạm thật khi lập: spec lõi mục 5.2 đặt mã S1 đến S4 cho luật số thứ tự producer, trùng với mức nghiêm trọng S1 đến S5 mà CLI in trên mọi dòng. Đề xuất đổi bốn luật đó thành SQ1 đến SQ4 trong spec lõi 0.4.1; chúng chỉ được nhắc ở A4, V1, CT-38 và CT-39.

**Mức, kết quả, exit code.** Ba bảng này nằm trong `spec.json` để mọi bề mặt dùng cùng một định nghĩa.

| Mức | Bậc I6 | Nhãn tiếng Anh | Nhãn tiếng Việt |
| --- | --- | --- | --- |
| S1 | 1 | DATA SAFETY | AN TOÀN DỮ LIỆU |
| S2 | 2 | SEMANTICS | ĐÚNG NGỮ NGHĨA |
| S3 | 3 | OPERABILITY | VẬN HÀNH ĐƯỢC |
| S4 | 4 | PERFORMANCE | HIỆU NĂNG |
| S5 | 5 | COST | CHI PHÍ |

Kết quả: `fail`, `pass`, `not_checked`, `not_applicable`. Exit code: 0, 1, 2, 3, 4, 5 như tab chính, cộng 130 khi Ctrl-C.

**Sổ đăng ký `codes.json`.** Mọi mã do spec lõi đặt hoặc do công cụ phát ra đều có một dòng; test chặn trùng mã giữa mọi tiền tố.

```ts
export interface CodeEntry {
  readonly code: string;               // 'T2', 'Y4', 'CX3'
  readonly owner: 'spec-core' | 'tool';
  readonly kind: 'invariant' | 'forbidden' | 'spec-rule' | 'tool-rule' | 'diagnostic'
               | 'assumption' | 'test' | 'exclusion' | 'model-invariant' | 'cli-invariant';
  readonly meaning: string;            // một dòng tiếng Anh
  readonly enforces?: string;          // mã spec mà luật công cụ này cưỡng chế
  readonly status: 'active' | 'deprecated' | 'proposed';
}
```

**Quy tắc đặt mã luật.** Một luật của doctor được dùng lại mã spec lõi chỉ khi nó cưỡng chế đúng luật spec đó (`enforces` trỏ về chính mã đó). T2 kiểm alternate exchange đúng như T2 của spec; F4 phát hiện vòng lặp requeue, tức chính chuyển trạng thái cấm F4. Luật không có đối ứng trong spec lõi phải dùng tiền tố riêng của công cụ (VT, DX).

| Tiền tố | Chủ | Loại | Ví dụ |
| --- | --- | --- | --- |
| I, F, K, SQ, A, R, C, T, N, H, MG, Q, L, P, D, U, V | spec lõi | luật và bất biến | T2, F4 |
| E1 đến E3 | spec lõi | loại hiệu ứng ngoài | E3 |
| G1 đến G14 | spec lõi | giả định | G14 |
| CT-01 đến CT-46 | spec lõi | test conformance | CT-30 |
| VT, DX | công cụ | luật không có đối ứng spec | VT2 |
| CL | công cụ | bất biến của CLI | CL2 |
| INV | công cụ | bất biến của model | INV5 |
| EX | công cụ | loại trừ hệ thống | EX9 |
| GC | công cụ | giả định của công cụ | GC10 |
| Y | công cụ | chẩn đoán `ocho.yaml` | Y4 |
| SNAP | công cụ | chẩn đoán ảnh chụp | SNAP2 |
| CX | công cụ | chẩn đoán kết nối | CX3 |
| OC | công cụ | cảnh báo về chính cách dùng Ocho | OC1 |

**Mã chẩn đoán kết nối và cảnh báo, mới ở bản này.**

| Mã | Nghĩa |
| --- | --- |
| CX1 | Không nối được tới host (DNS, TCP) |
| CX2 | Chứng chỉ TLS không hợp lệ hoặc CA không khớp |
| CX3 | Broker trả 401 ở `/api/overview` |
| CX4 | URL chứa mật khẩu, bị từ chối |
| CX5 | `--insecure` đang bật |
| CX6 | File context có quyền rộng hơn 0600 |
| CX7 | `password_command` lỗi hoặc quá 10 giây |
| CX8 | Phiên bản broker nhỏ hơn `broker.minSupported` |
| CX9 | Broker trả 403 ở `/api/overview`: user không có tag management nào |
| CX10 | URL không hợp lệ: scheme khác http và https, hoặc có query, fragment |
| OC1 | Lệnh chỉ đọc đang chạy bằng user có tag `administrator` |

Mã của Tiêu chuẩn A (A1 đến A15, B, C, G1, G2) và của khung nghệ nhân không vào sổ, vì công cụ không phát ra chúng. Nhưng chữ A1 của spec lõi (luật nguồn) và A1 của Tiêu chuẩn A (ý định rõ) trùng nhau trong tài liệu; đề xuất từ nay các tài liệu viết mã Tiêu chuẩn A kèm tiền tố, ví dụ `TCA-A15`.

## JSON Schema công bố

Gói công bố bốn schema, draft 2020-12, định danh bằng URN để không phụ thuộc tên miền chưa có: `urn:ochotona:schema:<tên>:<số>`. Schema là đóng (`additionalProperties: false`) và dùng để kiểm đầu ra của chính Ocho trong test. Bên tiêu thụ thì nên bỏ qua trường lạ thay vì kiểm chặt, đúng tinh thần mục 6.5 của spec lõi.

| Schema | File | Ai sinh | Trường chính |
| --- | --- | --- | --- |
| `finding:1` | `schemas/contracts/finding-1.json` | `rules`, qua `cli --json` | `rule`, `severity`, `result`, `object`, `what`, `dataSafety`, `next`, `mechanism`, `evidence[]`, `fix`, `specRef`, `waiver` |
| `report:1` | `report-1.json` | `cli doctor --json` | `tool`, `broker`, `sources`, `filters`, `findings[]`, `actions[]`, `blindSpots[]`, `summary`, `exitCode` |
| `snapshot:1` | `snapshot-1.json` | `model.saveSnapshot` | `tool`, `takenAt`, `context`, `redaction`, `actual` |
| `ocho-yaml:0.1` | `ocho-yaml-0.1.json` | Người dùng, `cli import` | Khoá cấp cao nhất ở tab model |

Schema `ocho-yaml` còn có một vai trò ngoài test: trỏ editor tới nó (`# yaml-language-server: $schema=…` ở dòng đầu file mà `import` ghi) để người dùng có gợi ý và báo lỗi ngay khi gõ, trước cả khi chạy `lint`. Kiểm tra đầy đủ (Y1 đến Y14) vẫn là việc của model, vì schema không diễn đạt được các ràng buộc chéo như Y5 hay Y13.

**`finding:1`, bản đầy đủ.**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:ochotona:schema:finding:1",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema", "rule", "severity", "result", "object", "specRef"],
  "properties": {
    "schema": { "const": "ocho.finding/1" },
    "rule": { "type": "string", "pattern": "^[A-Z]{1,4}[0-9]{1,2}$" },
    "severity": { "enum": ["S1", "S2", "S3", "S4", "S5"] },
    "result": { "enum": ["fail", "pass", "not_checked", "not_applicable"] },
    "object": {
      "type": "object", "additionalProperties": false, "required": ["id", "kind", "label"],
      "properties": {
        "id": { "type": "string" },
        "kind": { "enum": ["broker", "node", "vhost", "exchange", "queue", "binding",
                            "policy", "operator_policy", "connection", "channel", "consumer"] },
        "label": { "type": "string" }
      }
    },
    "what": { "type": "string" },
    "dataSafety": { "type": "string" },
    "next": { "type": "string" },
    "mechanism": { "type": "string" },
    "notChecked": {
      "type": "object", "required": ["reason"],
      "properties": { "reason": { "type": "string" }, "path": { "type": "string" },
                      "unlock": { "type": "string" } }
    },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false, "required": ["kind", "source"],
        "properties": {
          "kind": { "enum": ["observed", "inferred"] },
          "source": { "type": "string" },
          "value": {},
          "since": { "type": "string", "format": "date-time" },
          "observedAt": { "type": "string", "format": "date-time" },
          "note": { "type": "string" }
        }
      }
    },
    "fix": {
      "type": "object", "required": ["kind"],
      "properties": {
        "kind": { "enum": ["policy", "argument_migration", "client_change", "config", "none"] },
        "set": { "type": "object" },
        "rabbitmqadmin": { "type": "string" }
      }
    },
    "specRef": { "type": "string", "pattern": "^spec/[0-9]+\\.[0-9]+#[A-Z-]+[0-9]+$" },
    "waiver": {
      "oneOf": [
        { "type": "null" },
        { "type": "object", "required": ["reason", "by", "until"],
          "properties": { "reason": { "type": "string" }, "by": { "type": "string" },
                          "until": { "type": "string", "format": "date" } } }
      ]
    }
  },
  "allOf": [
    { "if": { "properties": { "result": { "const": "fail" } } },
      "then": { "required": ["what", "dataSafety", "next", "mechanism", "evidence"] } },
    { "if": { "properties": { "result": { "const": "not_checked" } } },
      "then": { "required": ["notChecked"] } }
  ]
}
```

Hai nhánh `allOf` cuối là CL3 và CL2 viết thành schema: một `fail` thiếu một trong ba điều hoặc thiếu bằng chứng, hay một `not_checked` thiếu lý do, sẽ hỏng test ngay trên đầu ra.

## Điểm mù và tham chiếu

`blind-spots.json` ghi cho mỗi lỗi trong lesson mục 9 công cụ nào bắt được nó, để dòng "điểm mù" cuối báo cáo doctor được sinh từ dữ liệu, không viết tay. Mỗi lỗi có mã LE1 đến LE20; không dùng `#2` như bản nháp `ocho.report/1`, và không dùng tiền tố L vì L1 đến L8 đã là luật cấu hình theo lớp của spec lõi.

| Mã | Lỗi | Bắt bằng | Mã luật |
| --- | --- | --- | --- |
| LE1 | Publish không confirm | doctor | R1 |
| LE2 | Dual write | client | — |
| LE3 | Không xử lý unroutable | doctor | T2 |
| LE4 | Auto-ack ở vùng chặt | doctor | C1 |
| LE5 | Ack trước commit | client | — |
| LE6 | Consumer không idempotent | client | — |
| LE7 | Classic queue cho dữ liệu quan trọng | doctor | T1, VT1 |
| LE8 | Tin thứ tự toàn cục | không công cụ nào | — |
| LE9 | Dead-letter at-most-once | doctor | T5, T4, VT2 |
| LE10 | Không phân biệt UNKNOWN | client | — |
| LE11 | Requeue ngay khi lỗi | doctor | F4 |
| LE12 | Prefetch 0 hoặc 1 không đo | doctor | C2 |
| LE13 | Một connection mỗi message | doctor | DX3 |
| LE14 | Chung channel giữa thread | lint (v0.2) | — |
| LE15 | Publisher và consumer chung connection | doctor | N1 |
| LE16 | Queue làm kho | doctor | DX1, T3 |
| LE17 | TTL theo message cho retry | lint (v0.2) | — |
| LE18 | Tạo queue động không giới hạn | doctor | DX3 |
| LE19 | Cluster trải nhiều region | không công cụ nào | — |
| LE20 | RabbitMQ làm RPC đồng bộ cho mọi thứ | decide (v0.2) | — |

Dòng điểm mù của doctor liệt kê các mã có "Bắt bằng" khác `doctor`, nhóm theo công cụ sẽ bắt chúng. Khi `lint` ra đời, chỉ cần sửa cột này; báo cáo tự đổi theo.

**Tham chiếu.**

| Loại | Dạng | Ví dụ |
| --- | --- | --- |
| `specRef` | `spec/<major.minor>#<mã>` | `spec/0.4#T2` |
| `lessonRefs` | `lesson#<mục>` hoặc `lesson#<mục>.<mục con>` | `lesson#9`, `lesson#2.chang-2` |
| Liên kết tài liệu | Khuôn trong `spec.json`, trường `docs.spec` | Xem dưới |

```json
{
  "docs": {
    "spec": "https://github.com/<org>/ochotona/blob/v{toolVersion}/docs/spec/{specVersion}.md#{anchor}",
    "lesson": "https://github.com/<org>/ochotona/blob/v{toolVersion}/docs/lesson.md#{anchor}"
  }
}
```

`anchor` là mã viết thường (`t2`, `ct-30`). Liên kết gắn với thẻ phiên bản của công cụ, để phát hiện của bản 0.1.0 luôn dẫn tới đúng văn bản spec lúc phát hành, kể cả khi spec đã đổi. `<org>` chờ chốt tên tổ chức GitHub.

## API công khai

Gói xuất dữ liệu, kiểu, và đúng các hàm tra cứu dưới đây. Kiểu nguyên thuỷ dùng chung (`Version`, `ArgValue`, `Severity`, `Tolerance`, `ObjectKind`) chuyển từ model sang đây, vì spec đứng dưới model trong chiều phụ thuộc; model xuất lại chúng nên code gọi không đổi.

```ts
// Hằng
export const SPEC_VERSION: '0.4.0';
export const CONTRACTS: { finding: 1; report: 1; snapshot: 1; ochoYaml: '0.1' };
export const BROKER_SUPPORT: { minSupported: '3.13.0'; tested: readonly ['3.13', '4.2', '4.3'] };

// Kiểu nguyên thuỷ, sinh từ data/
export type Severity = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
export type Result = 'fail' | 'pass' | 'not_checked' | 'not_applicable';
export type Tolerance = 'strict' | 'loose' | 'undeclared';
export type ObjectKind = 'broker' | 'node' | 'vhost' | 'exchange' | 'queue' | 'binding'
  | 'policy' | 'operator_policy' | 'connection' | 'channel' | 'consumer' | 'flow' | 'family';
export type RuleCode = 'T2' | 'R1' | /* … */ 'DX3';
export type DiagCode = 'Y1' | /* … */ 'OC1';
export type ExclusionCode = 'EX1' | /* … */ 'EX9';
export type AssumptionCode = 'GC1' | /* … */ 'GC17';
export type I18nKey = 'rule.T2.title' | /* … */ string;
export type Lang = 'en' | 'vi';
export type ArgValue = /* như tab model */;
export interface Version { /* như tab model */ }

// Phiên bản
export function parseVersion(s: string): Version | null;
export function compareVersion(a: Version, b: Version): -1 | 0 | 1;
export function compatKey(v: Version): string;                      // '1' hoặc '0.4'

// Luật
export const rules: readonly RuleMeta[];
export function rule(code: RuleCode): RuleMeta;

// Năng lực, khoá, loại trừ
export const capabilityRanges: readonly CapabilityRange[];
export function capabilitiesFor(v: Version): CapabilityLookup;
export function defaultsFor(v: Version, type: 'classic' | 'quorum' | 'stream'): Readonly<Record<string, ArgValue>>;
export const keys: readonly KeyDef[];
export function keyByArgument(name: string): KeyDef | undefined;
export function keyByPolicy(name: string): KeyDef | undefined;
export function keyByCanonical(name: string): KeyDef | undefined;
export const exclusions: readonly Exclusion[];
export function exclusionsFor(kind: Exclusion['kind'], scope: 'topology' | 'rules'): readonly Exclusion[];

// Mã, điểm mù, mức
export const codes: readonly CodeEntry[];
export function codeEntry(code: string): CodeEntry | undefined;
export const blindSpots: readonly BlindSpot[];
export const severities: readonly { level: Severity; tier: 1 | 2 | 3 | 4 | 5; label: Record<Lang, string> }[];
export const exitCodes: Readonly<Record<0 | 1 | 2 | 3 | 4 | 5 | 130, string>>;

// Văn bản
export function format(
  lang: Lang, key: I18nKey, params: Readonly<Record<string, string | number>>,
  fmtNumber?: (n: number) => string,
): string;

// Schema và liên kết
export const schemas: { finding1: object; report1: object; snapshot1: object; ochoYaml01: object };
export function docsUrl(kind: 'spec' | 'lesson', anchor: string,
  v: { toolVersion: string; specVersion: string }): string;
```

**Văn bản tách theo ngôn ngữ.** `format` nạp bảng văn bản qua đường dẫn con `@ochotona/spec/i18n/en` và `@ochotona/spec/i18n/vi`, để bàn đỡ chạy trong trình duyệt chỉ tải ngôn ngữ đang dùng. Khoá vắng trong ngôn ngữ được chọn thì rơi về tiếng Anh và ghi một cảnh báo phát triển; test ở mục dưới bảo đảm điều này không xảy ra trong bản phát hành.

**`format` là logic duy nhất có trọng lượng trong gói.** Nó thay `{tên}`, xử lý đúng một dạng `plural` với `one` và `other` theo `Intl.PluralRules` của ngôn ngữ, và gọi `fmtNumber` cho `#` nếu có. Tham số thiếu thì ném lỗi lập trình; tham số thừa thì bỏ qua.

**`rule(code)` ném lỗi** khi mã không tồn tại. Vì `RuleCode` là kiểu literal, chuyện này chỉ xảy ra khi đọc mã từ dữ liệu ngoài; nơi đọc dữ liệu ngoài dùng `codeEntry`, trả `undefined`.

## Test bắt buộc và định nghĩa hoàn thành

Phần lớn test của gói này chạy ở bước `codegen`, nên một dữ liệu sai không thể đi tới gói nào khác: build hỏng trước.

**Kiểm chéo ở `codegen`.**

| Kiểm | Hỏng khi |
| --- | --- |
| Mã duy nhất | Hai dòng trong `codes.json` trùng `code`, ở bất kỳ tiền tố nào |
| Mã đã đăng ký | Một mã trong `rules.json`, `exclusions.json`, `blind-spots.json`, `keys.json` (`assumption`) không có trong `codes.json` |
| `enforces` | Trỏ tới mã không phải `owner: spec-core` |
| Văn bản đủ | Một khoá bắt buộc của luật, mã chẩn đoán, lý do, loại trừ vắng ở `en` hoặc `vi` |
| Tham số khớp | Tập tham số của một khoá khác nhau giữa `en` và `vi`, hoặc khác `params` của luật |
| Quy tắc viết | `title` > 60 ký tự; `mechanism` > 200 ký tự; `dataSafety` không mở đầu đúng; có `{` hoặc `}` theo nghĩa đen; thuật ngữ trong `glossary.json` bị dịch trong `vi` |
| Khoảng phiên bản | Chồng nhau, hở, không bắt đầu từ `minSupported`, hoặc một khoảng thiếu trường |
| Khoá | Trùng `canonical`, trùng tên argument, trùng khoá policy |
| Điểm mù | LE1 đến LE20 không xuất hiện đúng một lần, hoặc mã luật không tồn tại |
| Mã sinh ra | `git diff --exit-code src/gen` khác rỗng |

**Test của hàm tra cứu.**

| Đầu vào `capabilitiesFor` | Kết quả |
| --- | --- |
| `3.12.9` | `unsupported` |
| `3.13.0`, `3.13.7` | `supported`, khoảng 3.13 |
| `4.1.5` | `untested`, khoảng 4.0 đến 4.1 (4.1 không nằm trong danh sách đã test) |
| `4.2.0` | `supported`, khoảng 4.2 |
| `4.3.0-rc.1` | `untested`, khoảng 4.3 |
| `4.4.0`, `5.0.0` | `untested`, khoảng cuối |

Dòng `4.3.0-rc.1` là quy tắc cần ghi rõ: tra khoảng theo `major.minor.patch` và bỏ qua `pre`. Theo semver thì `4.3.0-rc.1` nhỏ hơn `4.3.0` và sẽ rơi vào khoảng 4.2; nhưng một bản rc của 4.3 mang hành vi của 4.3, chẳng hạn cơ chế retry. Tra theo semver thuần sẽ chấm sai đúng ở các luật phụ thuộc phiên bản.

`format`: số nhiều `one` và `other` ở tiếng Anh, chỉ `other` ở tiếng Việt; thiếu tham số thì ném lỗi; `fmtNumber` được gọi cho `#`.

**Hợp đồng với gói khác**, chạy trong CI của `@ochotona/rules` nhưng do gói này định nghĩa: mọi mức mà hàm `severity` trả ra nằm trong `severities` đã khai; mọi tham số luật truyền ra nằm trong `params`; mọi đầu ra `--json` của CLI qua schema `finding:1` và `report:1`.

**Định nghĩa hoàn thành.**

- [ ] Đủ chín file `data/` với 22 luật, 11 khoá, 4 khoảng phiên bản, 9 loại trừ, 20 điểm mù, mọi mã của spec lõi và của công cụ.
- [ ] `codegen` xanh với toàn bộ kiểm chéo ở trên.
- [ ] Bản `dist` không import gì và chạy được trong môi trường trình duyệt (test bằng runtime không có `node:`).
- [ ] Kích thước: phần không có văn bản ≤ 150 KB; mỗi ngôn ngữ ≤ 60 KB.
- [ ] Bốn schema hợp đồng công bố, và đầu ra mẫu trong tab chính, tab v0.1 qua được chúng.

## Thay đổi và giả định

Tab này có hiệu lực hơn các tab trước ở mọi chỗ nói về dữ liệu dùng chung; hai dòng dẫn chiếu đã được thêm vào tab model.

| # | Thay đổi | Ảnh hưởng |
| --- | --- | --- |
| 1 | `Version`, `ArgValue`, `Severity`, `Tolerance`, `ObjectKind`, `parseVersion`, `compareVersion` chuyển từ model sang spec | Model xuất lại; code gọi không đổi |
| 2 | Bảng khoá ở mục `Effective` của tab model là bản in của `keys.json`; thêm cột operator policy được đặt | Model không viết cứng tên khoá |
| 3 | Loại trừ hệ thống hợp nhất thành EX1 đến EX9 | Bộ máy luật và `normalizeTopology` đọc cùng một danh sách |
| 4 | Consumer trên direct reply-to thành loại trừ EX9 | Thay cho mẫu gần giống riêng của C1 |
| 5 | Tra khoảng năng lực bỏ qua phần pre-release | `4.3.0-rc.1` mang hành vi của 4.3; so sánh semver vẫn dùng cho phiên bản cluster |
| 6 | Bảng năng lực tách 4.2 khỏi 4.0, 4.1 | Metadata store mặc định đổi ở 4.2 |
| 7 | Điểm mù dùng mã LE1 đến LE20 | Thay cho `#2` trong bản nháp `ocho.report/1` |
| 8 | Mã mới: CX1 đến CX8, OC1, EX1 đến EX9, LE1 đến LE20 | Đăng ký trong `codes.json` |

**Đề xuất sửa spec lõi 0.4.1.**

1. Đổi S1 đến S4 (số thứ tự producer, mục 5.2) thành SQ1 đến SQ4; sửa các chỗ nhắc ở A4, V1, CT-38, CT-39.
2. Viết mã Tiêu chuẩn A kèm tiền tố `TCA-` trong mọi tài liệu của dự án.

| Mã | Giả định | Kiểm ở |
| --- | --- | --- |
| GC17 | `/api/deprecated-features/used` có từ 3.13 | JSON thô ghi từ 3.13 |
| GC18 | Broker từ chối khai báo exchange tên bắt đầu bằng `amq.`, nên EX2 không bỏ sót cấu hình của người dùng | Thử khai báo trên 3.13, 4.2, 4.3 |
| GC19 | `Intl.PluralRules` có đủ dữ liệu `en`, `vi` trong Node 20 bản chuẩn và trong trình duyệt | Test `format` trên cả hai môi trường |
