# Spec @ochotona/rules v0.1

Oct 4, 2026 · @Max Darius

Chỗ bản cài đặt khác spec này ghi ở [implementation-notes.md](implementation-notes.md).

## Phạm vi và quyết định

`@ochotona/rules` cài đặt 22 luật đã khai ở `rules.json` của gói spec, cùng bộ máy chạy chúng trên một `Actual`. Đầu ra là danh sách `RuleResult` có cấu trúc và danh sách hành động; chữ hiển thị được dựng sau, theo ngôn ngữ, bằng `toFinding`.

| Gói này làm                                               | Gói này không làm                                           |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| Hàm chấm của từng luật                                    | Đọc broker, dựng `Actual`, tính `Effective` (broker, model) |
| Sinh `not_checked` từ `requires`                          | Metadata và văn bản luật (spec)                             |
| Áp loại trừ hệ thống, dung sai, miễn trừ, cờ experimental | Định dạng terminal, exit code (cli)                         |
| Chọn ba việc làm trước                                    | —                                                           |
| Dựng `finding:1` từ kết quả                               | —                                                           |

**Bốn quyết định.**

1. **Mức do `evaluate` trả, không có hàm `severity` riêng.** Tab v0.1 tách hai hàm; nhưng mức của T2 phụ thuộc bộ đếm, của T1 phụ thuộc số message, tức đúng những dữ liệu `evaluate` đang đọc. Hai hàm đọc cùng dữ liệu sẽ có lúc lệch nhau. Một hàm trả cả kết quả lẫn mức.
2. **Luật được xin thêm dữ liệu giữa chừng.** Một trường chỉ cần trong một nhánh (T1 cần số message chỉ khi luồng `undeclared`) khai ở `optional`; khi nhánh đó cần mà trường `unknown`, luật trả `needs`, và bộ máy biến nó thành `not_checked` với lý do của chính trường đó.
3. **Dung sai `loose` là `pass` có ghi chú, không phải `not_applicable`.** Luật vẫn áp; người dùng đã chấp nhận rủi ro bằng khai báo. Ghi chú `loose_by_declaration` giữ dấu vết của quyết định đó trong JSON.
4. **Luật là hàm thuần.** Không I/O, không đồng hồ (`now` nằm trong `Ctx`), không ngẫu nhiên. Test luật không cần Docker.

```
packages/rules/
  src/
    types.ts         RuleDef, Ctx, Verdict, Evidence, RuleResult
    define.ts        defineRule, kiểu View theo requires
    engine.ts        vòng chạy, loại trừ, miễn trừ, experimental
    actions.ts       ba việc làm trước
    finding.ts       toFinding
    catalog/         T2.ts, R1.ts, … mỗi luật một file
    index.ts
  fixtures/          xem mục fixture
```

Phụ thuộc: `@ochotona/spec`, `@ochotona/model`. Không phụ thuộc gói ngoài.

## Kiểu

```ts
export type Urgency =
  'loss_occurred' | 'active_loss_path' | 'at_risk' | 'hygiene';

export interface RuleDef<
  K extends ObjectKind,
  R extends readonly FieldPath[],
  O extends readonly FieldPath[],
> {
  readonly code: RuleCode; // phải có trong spec.rules
  readonly appliesTo: K; // một loại; L3 khai hai RuleDef cùng mã
  readonly requires: R;
  readonly optional: O;
  evaluate(view: View<K, R, O>, ctx: Ctx): Verdict;
}

export type Verdict =
  | { readonly result: 'pass'; readonly note?: 'loose_by_declaration' }
  | { readonly result: 'not_applicable'; readonly note?: I18nKey }
  | { readonly result: 'needs'; readonly path: FieldPath } // trường optional cần mà unknown
  | {
      readonly result: 'fail';
      readonly severity: Severity;
      readonly urgency: Urgency;
      readonly variant?: string; // chọn khuôn câu, ví dụ 'v313', 'node'
      readonly evidence: readonly Evidence[];
      readonly params: Readonly<
        Record<string, string | number | readonly string[]>
      >;
      readonly fix?: FixSpec;
    };

export interface Evidence {
  readonly kind: 'observed' | 'inferred';
  readonly path: FieldPath;
  readonly prov?: Provenance; // lấy từ Observed; inferred có thể không có
  readonly value?: unknown;
  readonly note?: I18nKey;
}

export interface FixSpec {
  readonly kind:
    'policy' | 'argument_migration' | 'client_change' | 'config' | 'none';
  readonly set?: ArgMap; // khoá policy đề xuất
  readonly rabbitmqadmin?: string; // lệnh dựng sẵn, không có bí mật
}

export interface Ctx {
  readonly actual: Actual;
  readonly index: Indexes;
  readonly flows: FlowMap; // buildFlowMap(desired | null, actual)
  readonly caps: Capabilities;
  readonly version: Version;
  readonly targetVersion: Version | null;
  readonly now: Instant;
}

export interface RuleResult {
  readonly rule: RuleCode;
  readonly object: ObjectRef;
  readonly result: Result; // fail | pass | not_checked | not_applicable
  readonly severity?: Severity; // có khi fail
  readonly urgency?: Urgency;
  readonly variant?: string;
  readonly evidence: readonly Evidence[];
  readonly params: Readonly<
    Record<string, string | number | readonly string[]>
  >;
  readonly fix?: FixSpec;
  readonly note?: string;
  readonly notChecked?: {
    readonly path: FieldPath;
    readonly reason: UnknownReason;
  };
  readonly waiver?: Waiver; // có khi miễn trừ còn hiệu lực
  readonly experimental: boolean;
}
```

`View<K, R, O>` là kiểu sinh từ `requires` và `optional`: trường trong `requires` hiện ra là giá trị trần, trường trong `optional` là `Observed`, trường không khai không có trong view. Đọc một trường không khai là lỗi biên dịch, nên một luật không thể dựa vào dữ liệu mà bộ máy không biết nó cần.

## Ngữ pháp `requires`

`requires` và `optional` là nguồn duy nhất cho hai việc: bộ máy sinh `not_checked`, và `model.planRead` quyết định đọc endpoint, cột nào. Một luật khai thiếu thì vừa không được đọc dữ liệu, vừa không biên dịch được, nên không có đường để dữ liệu cần mà không được đọc.

```
FieldPath := Entity "." Field ("." Field)*
Entity    := broker | node | vhost | exchange | queue | binding | channel
           | connection | consumer | policy | whoami
```

| Dạng                    | Nghĩa                                                                                           | Ví dụ                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Thực thể của chính luật | Trường đó của đối tượng đang chấm phải `known`                                                  | Luật queue khai `queue.effective`                                          |
| `broker.*`, `whoami.*`  | Trường cấp broker phải `known`                                                                  | `broker.counters.unroutableDropped`                                        |
| Thực thể liên quan      | Bộ sưu tập đó `known`, và trường đó `known` ở **mọi** phần tử liên quan tới đối tượng đang chấm | Luật connection khai `channel.publishCount`: mọi channel của connection đó |

Quan hệ giữa các thực thể cố định trong bộ máy, đi qua `Indexes` của model:

| Từ                | Tới        | Qua                     |
| ----------------- | ---------- | ----------------------- |
| exchange          | binding    | `bindingsBySource`      |
| queue             | binding    | `bindingsByDestination` |
| queue             | consumer   | `consumersByQueue`      |
| connection        | channel    | `channelsByConnection`  |
| channel, consumer | connection | trường `connection`     |
| consumer          | queue      | trường `queue`          |

Thêm một quan hệ là thay đổi của bộ máy, có test riêng; luật không tự đi quan hệ ngoài bảng này.

**Nối với kế hoạch đọc.** CLI lấy hợp của `requires` và `optional` của mọi luật được chọn (theo `--target-version`, theo cờ experimental) và đưa cho `model.planRead`. Model đổi mỗi đường dẫn thành endpoint và cột theo bảng ánh xạ ở tab model. Trường `optional` cũng được đọc nếu đọc được; nó chỉ khác `requires` ở chỗ vắng thì luật vẫn chạy.

## Bộ máy chạy luật

`runRules(ctx, options)` chạy mọi luật được chọn trên mọi đối tượng hợp lệ và trả `{ results, actions, internal }`.

**Chọn luật.** Bỏ luật `targetVersionOnly` khi không có `targetVersion` (bỏ hẳn, không ra `not_applicable`). Luật `experimental` vẫn chạy, kết quả mang `experimental: true`.

**Vòng chạy cho mỗi luật, theo thứ tự.**

1. Bộ sưu tập của `appliesTo` là `unknown` → một kết quả duy nhất `not_checked` với đối tượng `{ kind: 'broker' }` và lý do của bộ sưu tập. Không có đối tượng nào để lặp không có nghĩa là luật không có gì để nói; CL2 đòi luật đó hiện ra là chưa kiểm.
2. Lọc đối tượng theo `--vhost`, `--flow` (qua `flows.membersOf`), và loại trừ `exclusionsFor(kind, 'rules')`. Loại trừ có `rulesOutcome: not_applicable_with_note` ra `not_applicable` kèm ghi chú; `skip` thì không ra kết quả.
3. Với mỗi đối tượng, phân giải `requires` theo ngữ pháp ở mục trên. Đường dẫn đầu tiên `unknown` → `not_checked` mang đường dẫn và lý do; không gọi `evaluate`.
4. Gọi `evaluate`. Kết quả `needs` → `not_checked` với lý do của đường dẫn được xin.
5. `fail` có miễn trừ còn hiệu lực (khớp `rule` và `refKey`, `until` ≥ ngày UTC của `now`) → giữ `fail`, gắn `waiver`.
6. Kiểm hợp đồng của kết quả (dưới).

**Kiểm hợp đồng mỗi kết quả `fail`.**

| Kiểm                                                                                  | Trong test | Khi chạy thật                   |
| ------------------------------------------------------------------------------------- | ---------- | ------------------------------- |
| `severity` nằm trong `meta.severities`                                                | ném lỗi    | ghi vào `internal`, giữ nguyên  |
| Khoá của `params` đúng bằng `meta.params`                                             | ném lỗi    | ghi vào `internal`, giữ nguyên  |
| CL4: S1 có ít nhất một bằng chứng `observed`, hoặc dung sai của đối tượng là `strict` | ném lỗi    | hạ xuống S3, ghi vào `internal` |

CL4 là kiểm duy nhất sửa kết quả lúc chạy thật, vì một S1 không có căn cứ là đúng loại báo nhầm mà ngân sách precision ≥ 95% cấm.

**Luật ném ngoại lệ.** Bộ máy bắt, ghi kết quả `not_checked` với lý do `error`, ghi vào `internal`, và chạy tiếp luật khác. CLI in báo cáo bình thường rồi thoát 5 nếu `internal` có lỗi, đúng CL2: không bao giờ thoát 0 khi chính Ocho hỏng.

**Tất định.** Kết quả sắp theo mức (fail trước, theo S1 đến S5), rồi mã luật theo thứ tự trong `rules.json`, rồi `refKey`.

## Tám luật S1

Mỗi luật dưới đây là đặc tả đủ để viết hàm `evaluate` và fixture mà không phải đoán. "Dung sai" là `ctx.flows.toleranceOf(đối tượng)`. Với mọi luật phụ thuộc dung sai: `loose` → `pass` kèm `loose_by_declaration`.

### T2 · exchange không có alternate exchange dùng được

| Mục          | Đặc tả                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requires`   | `exchange.effective`, `binding.destination`                                                                                                                                                                                  |
| `optional`   | `broker.counters.unroutableDropped`                                                                                                                                                                                          |
| `fail` khi   | Exchange có ít nhất một binding đi ra, và `alternate-exchange` hiệu lực: vắng (`reason: missing`), hoặc trỏ tới exchange không tồn tại trong cùng vhost (`dangling`), hoặc trỏ tới exchange không có binding nào (`unbound`) |
| Mức, độ khẩn | `strict`: S1. `undeclared`: S1 khi bộ đếm `known` và > 0, còn lại S3. Độ khẩn: bộ đếm > 0 → `loss_occurred`; không thì `strict` → `active_loss_path`, `undeclared` → `at_risk`                                               |
| Biến thể     | `dropped` (bộ đếm cluster > 0), `dropped_node` (bộ đếm một node > 0), `at_risk`                                                                                                                                              |
| `params`     | `reason`, và khi có bộ đếm: `count`, `since`, `node`                                                                                                                                                                         |
| Bằng chứng   | `inferred` từ `exchange.effective` và danh sách binding; `observed` từ bộ đếm, kèm `prov`                                                                                                                                    |
| Sửa          | `policy`, khoá `alternate-exchange: ocho.unroutable`                                                                                                                                                                         |

**Lệnh sửa phải tôn trọng L3.** Chỉ một policy áp cho một exchange. Nếu exchange đã có `appliedPolicy` P, lệnh sửa là cập nhật định nghĩa của P thêm khoá `alternate-exchange`, giữ mọi khoá cũ. Nếu chưa có, lệnh tạo policy mới `ocho-ae-<tên>` với pattern neo `^<tên đã escape>$`. Tạo một policy mới đè lên P với priority cao hơn sẽ xoá mọi khoá của P khỏi exchange: đó là một bản sửa sinh ra lỗi mới. Văn bản `next` nói thêm rằng `ocho.unroutable` (fanout) và queue của nó phải tồn tại trước.

### R1 · channel publish mà không bật confirm

| Mục          | Đặc tả                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `requires`   | `channel.publishCount`, `channel.confirm`                                                                 |
| `fail` khi   | `publishCount` > 0 và `confirm` = false                                                                   |
| Mức, độ khẩn | Dung sai của channel lấy qua khối `services` theo user. `strict`: S1, `undeclared`: S3; độ khẩn `at_risk` |
| `params`     | `connection`, `user`, `publishCount`                                                                      |
| Bằng chứng   | `observed` cho cả hai trường                                                                              |
| Sửa          | `client_change`                                                                                           |

### C1 · consumer không ack thủ công

| Mục          | Đặc tả                                                                             |
| ------------ | ---------------------------------------------------------------------------------- |
| `requires`   | `consumer.ackRequired`                                                             |
| `fail` khi   | `ackRequired` = false (consumer trên direct reply-to đã bị EX9 loại)               |
| Mức, độ khẩn | Theo dung sai của queue mà consumer đọc. `strict`: S1, `undeclared`: S3; `at_risk` |
| `params`     | `queue`, `connection`                                                              |
| Bằng chứng   | `observed`                                                                         |
| Sửa          | `client_change`                                                                    |

### T1 · classic queue giữ dữ liệu không được mất

| Mục                | Đặc tả                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `requires`         | `queue.type`, `queue.durable`, `queue.autoDelete`                                                                         |
| `optional`         | `queue.consumers`, `queue.ready`, `queue.unacked`                                                                         |
| `fail` khi         | `type` = classic, `durable`, không `autoDelete`; và: `strict`, hoặc `undeclared` với có consumer và `ready + unacked` > 0 |
| Nhánh `undeclared` | Cần cả ba trường `optional`; trường đầu tiên `unknown` → `needs`                                                          |
| Mức, độ khẩn       | `strict`: S1, `undeclared`: S3; `at_risk`                                                                                 |
| `params`           | `messages` (khi biết), `consumers` (khi biết)                                                                             |
| Bằng chứng         | `inferred` từ `queue.type`                                                                                                |
| Sửa                | `argument_migration`: không đổi loại queue tại chỗ được; `next` dẫn tới quy trình MG3                                     |

### T5 · dead-letter có thể làm mất message

| Mục          | Đặc tả                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `requires`   | `queue.type`, `queue.effective`                                                                                              |
| `fail` khi   | Quorum, có `dead-letter-exchange`, và không đồng thời `dead-letter-strategy = at-least-once` với `overflow = reject-publish` |
| Mức, độ khẩn | S1, `active_loss_path`, không phụ thuộc dung sai: dead-letter là đường mà chính người dùng đã chọn để giữ message            |
| `params`     | `strategy`, `overflow`, `strategyLayer`, `overflowLayer`                                                                     |
| Bằng chứng   | `inferred` từ hai mục của `Effective`, kèm lớp và tên policy                                                                 |
| Sửa          | `policy` đặt cả hai khoá, gộp vào policy đang áp như T2                                                                      |

### T4 · message độc bị bỏ hoặc lặp vô hạn

| Mục                     | Đặc tả                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requires`              | `queue.type`, `queue.effective`, `broker.version`                                                                                                                                                                                  |
| `fail`, biến thể `drop` | Quorum, không có `dead-letter-exchange`, và `delivery-limit` hiệu lực có giá trị (đặt rõ, hoặc mặc định 20 từ 4.0)                                                                                                                 |
| `fail`, biến thể `loop` | Quorum, trên 3.13, `delivery-limit` vắng (không giới hạn)                                                                                                                                                                          |
| Mức, độ khẩn            | `drop`: S1, `active_loss_path`. `loop`: S3, `hygiene`: không mất, nhưng message độc chặn queue                                                                                                                                     |
| `params`                | `limit`, `limitLayer` (với `drop`)                                                                                                                                                                                                 |
| Bằng chứng              | `inferred` từ `Effective`; `observed` từ `broker.version`                                                                                                                                                                          |
| Sửa                     | `policy` đặt cùng lúc `delivery-limit = caps.ochoSets.deliveryLimit`, `dead-letter-exchange = caps.retry.mainQueueDeadLetter`, `dead-letter-strategy = at-least-once`, `overflow = reject-publish`, để một lần sửa qua cả T4 và T5 |

### T3 · giới hạn chiều dài bỏ message cũ

| Mục          | Đặc tả                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `requires`   | `queue.effective`                                                                                         |
| `fail` khi   | Có `max-length` hoặc `max-length-bytes`, và `overflow` = `drop-head` (kể cả từ mặc định)                  |
| Mức, độ khẩn | `strict`: S1, `active_loss_path`. `undeclared`: S3, `at_risk`                                             |
| `params`     | `limit`, `limitKind` (`messages` hoặc `bytes`), `overflowLayer`                                           |
| Bằng chứng   | `inferred` từ `Effective`                                                                                 |
| Sửa          | `policy` đặt `overflow = reject-publish`; `next` nhắc publisher phải xử lý nack, tức phải có confirm (R1) |

### T9 · message hoặc cả queue hết hạn mà không qua dead-letter

| Mục                        | Đặc tả                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `requires`                 | `queue.effective`                                                                                           |
| `fail`, biến thể `ttl`     | Có `message-ttl` và không có `dead-letter-exchange`                                                         |
| `fail`, biến thể `expires` | Có `expires`, bất kể dead-letter: queue hết hạn bị xoá cùng mọi message, không message nào được dead-letter |
| Mức, độ khẩn               | `strict`: S1, `active_loss_path`. `undeclared`: S3, `at_risk`                                               |
| `params`                   | `ttlMs` hoặc `expiresMs`, và lớp đặt ra nó                                                                  |
| Bằng chứng                 | `inferred` từ `Effective`                                                                                   |
| Sửa                        | `ttl`: `policy` thêm dead-letter. `expires`: `config`, bỏ `expires` khỏi policy hoặc argument               |

Biến thể `expires` sửa một chỗ sai của tab v0.1, nơi vị từ ghi "`message-ttl` hoặc `expires` mà không có dead-letter": thêm dead-letter không cứu được queue hết hạn.

## Mười bốn luật còn lại

Các ngưỡng số nằm trong `rules.json` của gói spec, trường mới `thresholds`, không viết cứng trong hàm. Hiệu chỉnh ngưỡng sau khi chạy trên broker của design partner là sửa dữ liệu, không sửa code.

| Luật | Áp cho          | `requires` / `optional`                                  | `fail` khi                                                                                                         | Mức, độ khẩn                                                                                                                                                                                                                                             | `params`                                             |
| ---- | --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| L3   | exchange, queue | `policy.pattern`, `policy.priority`, `policy.definition` | `model.matchingPolicies(obj)` có ≥ 2 policy người dùng                                                             | S1 khi một policy thua mang khoá an toàn (`alternate-exchange`, `dead-letter-exchange`, `dead-letter-strategy`, `overflow`, `delivery-limit`) mà policy thắng không có hoặc khác giá trị; còn lại S3. Hoà priority: S3, ghi chú `tie`. Độ khẩn `at_risk` | `winner`, `losers`, `keys`                           |
| VT1  | queue           | `queue.type`, `policy.definition`                        | Có `targetVersion` ≥ 4.0, broker < 4.0, queue classic, policy đang áp có khoá `ha-mode`                            | S1, `at_risk`                                                                                                                                                                                                                                            | `policy`, `targetVersion`                            |
| VT2  | queue           | `queue.type`, `queue.effective`                          | Có `targetVersion` ≥ 4.0, broker < 4.0, quorum, không dead-letter, `delivery-limit` vắng                           | S1, `active_loss_path` (sau nâng cấp)                                                                                                                                                                                                                    | `defaultLimit` (từ bảng năng lực của phiên bản đích) |
| VT3  | broker          | `broker.deprecatedInUse`                                 | Danh sách khác rỗng; một kết quả cho mỗi tính năng                                                                 | S3, `hygiene`                                                                                                                                                                                                                                            | `feature`                                            |
| VT4  | broker          | `node.version`                                           | Các node đang chạy có phiên bản khác nhau                                                                          | S3, `hygiene`                                                                                                                                                                                                                                            | `versions`                                           |
| N1   | connection      | `channel.publishCount`, `channel.consumerCount`          | Cùng một connection AMQP có channel publish (> 0) và channel có consumer                                           | S3, `at_risk`                                                                                                                                                                                                                                            | `publishChannels`, `consumeChannels`                 |
| N2   | connection      | `connection.connectionName`                              | Connection AMQP có `connectionName` = `null`                                                                       | S3, `hygiene`                                                                                                                                                                                                                                            | `user`, `clientProduct`                              |
| N3   | connection      | `connection.heartbeat`                                   | Connection AMQP có heartbeat = 0                                                                                   | S3, `at_risk`                                                                                                                                                                                                                                            | `user`                                               |
| Q3   | connection      | `connection.user` / `whoami.tags`, `user.tags`           | User là `guest`; hoặc user có tag `administrator` (biết được khi trùng `whoami`, hoặc khi đọc được danh sách user) | S3, `hygiene`. Không phải `guest` và không đọc được tag → `needs user.tags`                                                                                                                                                                              | `user`, `reason` (`guest`, `administrator`)          |
| C2   | consumer        | `consumer.prefetch` / `queue.deliverRate`                | Prefetch 0; hoặc prefetch 1 và queue có tốc độ giao > `thresholds.highRate` (100/s)                                | Prefetch 0: S3, `at_risk`. Prefetch 1: S4, `hygiene`; tốc độ `unknown` → `needs`                                                                                                                                                                         | `prefetch`, `queue`, `rate`                          |
| F4   | queue           | `queue.deliverRate`, `queue.redeliverRate`               | Tốc độ giao ≥ `thresholds.minDeliverRate` (1/s) và tỷ lệ giao lại > `thresholds.ratio` (0,5)                       | S3, `at_risk`                                                                                                                                                                                                                                            | `ratio`, `deliverRate`                               |
| DX1  | queue           | `queue.ready`                                            | `ready` > `thresholds.ready` (1.000.000)                                                                           | S3, `hygiene`                                                                                                                                                                                                                                            | `ready`                                              |
| DX2  | node            | `node.diskFreeLimitBytes`, `node.memLimitBytes`          | `diskFreeLimit` < `memLimit`                                                                                       | S3, `at_risk`                                                                                                                                                                                                                                            | `diskFreeLimitBytes`, `memLimitBytes`                |
| DX3  | broker          | `broker.churn`                                           | Tốc độ tạo connection hoặc tạo queue > `thresholds.perSecond` (5/s)                                                | S5, `hygiene`                                                                                                                                                                                                                                            | `kind` (`connection`, `queue`), `rate`               |

**Luật nhiều kết quả trên cùng một đối tượng** (VT3 trên broker): khoá sắp xếp thêm giá trị `params` theo thứ tự khai trong `meta.params`, để tất định.

**N1, N2, N3 chỉ áp cho AMQP 0-9-1**: client MQTT, STOMP, AMQP 1.0 không có channel theo nghĩa này, không gửi `connection_name`, và quản lý keep-alive theo cơ chế riêng. Connection giao thức khác ra `not_applicable`.

**Q3 không bao giờ kết luận "không phải admin" khi không đọc được tag.** Đây là ví dụ rõ nhất của CL2 trong bộ luật: user `monitoring` không thấy tag của user khác, nên Q3 trên mọi connection không phải `guest` là `not_checked`, trừ khi CLI đang chạy bằng user quản trị (khi đó kế hoạch đọc thêm `/api/users`, và OC1 đã cảnh báo về chính việc dùng quyền đó).

## Bằng chứng, độ khẩn, ba việc làm trước

**Khi nào bằng chứng là `observed`.** CL4 dựa hoàn toàn vào ranh giới này, nên nó được định nghĩa theo nguồn của giá trị, không theo cảm giác của người viết luật:

| Giá trị                                                                             | Loại                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Trường đọc thẳng từ API hoặc Prometheus (`confirm`, `ack_required`, bộ đếm, `type`) | `observed`                                       |
| Mục `Effective` lớp `argument`                                                      | `observed`: argument là dữ liệu thô              |
| Mục `Effective` lớp `policy`, `operator_policy`, khi `effectiveCheck = verified`    | `observed`: broker đã tự xác nhận định nghĩa gộp |
| Mục `Effective` lớp `policy`, `operator_policy`, khi `unverified`                   | `inferred`                                       |
| Khoá **vắng** trong `Effective` đã `verified`                                       | `observed` (vắng đã được broker xác nhận)        |
| Mục lớp `builtin_default`, `vhost_default`                                          | `inferred`: đến từ bảng năng lực của Ocho        |
| Luồng, dung sai, tên khớp mẫu                                                       | `inferred`                                       |

Vì vậy T5 trên một queue có dead-letter đặt qua policy đã `verified`, còn strategy rơi vào mặc định, vẫn là S1 hợp lệ: phần "có dead-letter" là `observed`. Còn khi tự kiểm lệch, `Effective` đã thành `unknown` và luật ra `not_checked`, nên không có S1 nào đứng trên một mô hình mà broker không đồng ý.

**Độ khẩn** là bậc cơ chế của trình tự sửa 12.2, do `evaluate` trả cùng mức:

| Độ khẩn            | Nghĩa                                              | Ví dụ                      |
| ------------------ | -------------------------------------------------- | -------------------------- |
| `loss_occurred`    | Đã mất, có số đếm                                  | T2 với bộ đếm > 0          |
| `active_loss_path` | Cấu hình đang bỏ message ngay khi điều kiện xảy ra | T3, T4 `drop`, T5, T9, VT2 |
| `at_risk`          | Một lỗi ở chỗ khác sẽ thành mất                    | T1, C1, R1, L3, N1         |
| `hygiene`          | Ảnh hưởng vận hành, không trực tiếp tới dữ liệu    | N2, DX1, DX3               |

**`planActions(results)`, thuật toán đầy đủ.**

1. Ứng viên: kết quả `fail`, không có miễn trừ còn hiệu lực, không `experimental`, mức S1 đến S3.
2. Gom theo khoá (luật, biến thể, `fix.kind`, vhost) thành hành động; mỗi hành động giữ danh sách đối tượng đã sắp theo `refKey`.
3. Sắp hành động theo: mức; rồi độ khẩn theo thứ tự bảng trên; rồi số đối tượng giảm dần; rồi thứ tự luật trong `rules.json`; rồi vhost.
4. Lấy ba hành động đầu.
5. Trả thêm `uncheckedS1`: số kết quả `not_checked` của luật có S1 trong `meta.severities`, để dòng "No S1–S3 actions" luôn đi kèm con số này khi nó khác 0.

```ts
export interface Action {
  readonly rule: RuleCode;
  readonly variant?: string;
  readonly severity: Severity;
  readonly urgency: Urgency;
  readonly vhost: string;
  readonly objects: readonly ObjectRef[];
  readonly fixKind: FixSpec['kind'];
}
```

## Dựng finding

`toFinding(result, lang, opts)` biến một `RuleResult` thành một object qua được schema `finding:1`. Nó nằm ở gói này, không ở CLI, để bàn đỡ về sau dựng đúng cùng một finding.

| Trường `finding:1`                        | Lấy từ                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `rule`, `result`, `waiver`                | `RuleResult`                                                                                                              |
| `severity`                                | `result.severity` khi `fail`; không thì mức cao nhất trong `meta.severities` (để biết luật bảo vệ bậc nào)                |
| `object`                                  | `{ id: refKey, kind, label: refLabel }`                                                                                   |
| `what`, `dataSafety`, `next`, `mechanism` | `spec.format(lang, 'rule.<MÃ>.<trường>.<biến thể>', params)`; khoá có biến thể vắng thì dùng khoá không biến thể          |
| `notChecked`                              | `{ reason: format('reason.<kind>'), path, unlock: format('reason.<kind>.unlock') }`, với `kind` là `rootReason`           |
| `evidence[]`                              | `kind`; `source` = `prov.path`, hoặc `derived:<FieldPath>` khi không có `prov`; `value`; `since` cho bộ đếm; `observedAt` |
| `fix`                                     | `FixSpec`, với lệnh rabbitmqadmin dựng từ khuôn                                                                           |
| `specRef`                                 | `meta.specRef`                                                                                                            |

**Khoá văn bản có biến thể** là bổ sung cho gói spec: `rule.T2.what.dropped_node`, `rule.T4.what.loop`, `rule.T9.what.expires`. Kiểm chéo ở `codegen` thêm một điều: mọi biến thể mà luật có thể trả phải có đủ khoá ở cả hai ngôn ngữ, hoặc khoá gốc phải dùng được cho biến thể đó.

**Lệnh rabbitmqadmin dựng từ khuôn, không viết cứng.** Khuôn nằm trong dữ liệu của gói spec (`fix-templates.json`), vì cú pháp lệnh của rabbitmqadmin v2 có thể đổi giữa các bản và cần sửa mà không phát hành lại luật (giả định GC25). Mọi giá trị chèn vào lệnh được đặt trong dấu nháy đơn, nháy đơn bên trong được escape theo kiểu POSIX (`'\''`). Lệnh không bao giờ chứa mật khẩu hay URL broker; người dùng tự thêm cờ kết nối của họ.

## Fixture và harness

Fixture có hai tầng dùng chung một định dạng kỳ vọng. Tầng đơn vị chạy trên mỗi commit trong vài giây; tầng tích hợp chạy trên ma trận broker thật như đã mô tả ở tab v0.1.

**Tầng đơn vị** (`fixtures/unit/<MÃ>/<ca>.ts`). Mỗi ca dựng `RawResponses` tổng hợp bằng builder (`brokerAt('4.2.1')`, `aQueue({ type: 'quorum', args: {...} })`, `aPolicy(...)`, `aChannel(...)`), rồi đi qua **chính** `model.buildActual`. Không ca nào được viết tay một `Actual` hay một `Effective`: nếu viết tay, fixture sẽ test luật trên một mô hình mà model thật không bao giờ sinh ra.

```ts
export default fixture({
  rule: 'T5',
  kind: 'near', // fail | near | anti
  title: 'at-least-once and reject-publish set through a policy',
  raw: brokerAt('4.2.1')
    .queue('orders', { type: 'quorum' })
    .policy('dlx', {
      pattern: '^orders$',
      applyTo: 'queues',
      priority: 1,
      definition: {
        'dead-letter-exchange': 'ocho.retry',
        'dead-letter-strategy': 'at-least-once',
        overflow: 'reject-publish',
      },
    })
    .build(),
  desired: null,
  expect: [{ object: 'queue:%2F:orders', result: 'pass' }],
});
```

**Tầng tích hợp** (`fixtures/integration/<MÃ>/<ca>/`): `definitions.json`, `traffic.ts`, `ocho.yaml` tuỳ chọn, `expected.<biến thể>.json`. Định dạng `expect` giống hệt tầng đơn vị.

**Ma trận phủ, sinh tự động.** Script `coverage-matrix.ts` đọc `rules.json` và mọi fixture, rồi kiểm cho mỗi luật đã có ca cho từng ô sau; thiếu một ô là CI hỏng:

- mỗi mức trong `meta.severities`;
- mỗi biến thể luật có thể trả;
- mỗi nhánh `needs`;
- `not_checked` do `requires` vắng;
- `pass` do `loose_by_declaration` (luật phụ thuộc dung sai);
- ít nhất một mẫu `near` và một mẫu `anti`;
- với luật S1: ít nhất một ca `fail` và một ca `near` ở tầng tích hợp.

## API công khai

```ts
export const catalog: readonly AnyRuleDef[];

export function selectRules(opts: {
  targetVersion: boolean;
  includeExperimental: boolean;
  only?: readonly RuleCode[];
}): readonly AnyRuleDef[];

export function requiredPaths(
  rules: readonly AnyRuleDef[],
): readonly FieldPath[]; // cho model.planRead

export function runRules(
  ctx: Ctx,
  rules: readonly AnyRuleDef[],
  opts: {
    waivers: readonly Waiver[];
    scope: { vhosts: readonly string[] | 'all'; flow: string | null };
    mode: 'test' | 'production'; // test: hợp đồng vi phạm thì ném
  },
): { results: readonly RuleResult[]; internal: readonly InternalIssue[] };

export interface InternalIssue {
  readonly kind: 'exception' | 'contract' | 'cl4_downgrade';
  readonly rule: RuleCode;
  readonly object: ObjectRef;
  readonly detail: string;
}

export function planActions(results: readonly RuleResult[]): {
  actions: readonly Action[];
  uncheckedS1: number;
};

export function toFinding(
  r: RuleResult,
  lang: Lang,
  opts?: { fmtNumber?: (n: number) => string },
): Finding;
export function toActionText(
  a: Action,
  lang: Lang,
  labelOf: (ref: ObjectRef) => string,
): string;

export function defineRule<K, R, O>(def: RuleDef<K, R, O>): RuleDef<K, R, O>;
```

CLI gọi theo thứ tự: `selectRules` → `requiredPaths` → `model.planRead` → broker đọc → `model.buildActual` → `model.buildFlowMap` → `runRules` → `planActions` → `toFinding` cho từng kết quả. Có `internal` không rỗng thì CLI in báo cáo rồi thoát 5.

## Test bắt buộc và định nghĩa hoàn thành

| Nhóm        | Test                                                                                  | Nghiệm thu                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Ma trận phủ | `coverage-matrix.ts`                                                                  | Không thiếu ô nào                                                                                                                              |
| Đơn vị      | Mọi fixture tầng đơn vị, chế độ `test`                                                | Xanh; mọi kiểm hợp đồng bật                                                                                                                    |
| Tích hợp    | Ma trận 3.13, 4.2, 4.3 × 4 biến thể nguồn                                             | Recall 100% luật S1; 0 kết quả sai trên mẫu `near`, `anti`                                                                                     |
| Tính chất   | fast-check sinh `RawResponses` ngẫu nhiên hợp lệ, đi qua `buildActual` rồi `runRules` | Không ném; mỗi luật hoặc có kết quả cho mọi đối tượng hợp lệ, hoặc có đúng một `not_checked` cấp broker; chạy hai lần cho JSON giống từng byte |
| Schema      | `toFinding` trên mọi kết quả của mọi fixture, tiếng Anh và tiếng Việt                 | Qua `finding:1`                                                                                                                                |
| Hành động   | Bảng ca cho `planActions`: hoà mức, hoà độ khẩn, miễn trừ, experimental, chỉ có S4    | Đúng thứ tự, đúng `uncheckedS1`                                                                                                                |
| Lệnh sửa    | Mỗi fixture có `fix`, kể cả tên chứa dấu nháy, dấu cách, `/`                          | Snapshot lệnh; chạy được trong `sh -n`                                                                                                         |
| Mutation    | Stryker trên tám luật S1                                                              | Điểm ≥ 85%                                                                                                                                     |
| Hiệu năng   | 10.000 queue, 20.000 binding, 5.000 connection, 20.000 channel, 20.000 consumer       | `runRules` ≤ 1 giây                                                                                                                            |

**Định nghĩa hoàn thành.**

- [ ] 22 luật cài đặt, mỗi luật một file, mỗi file ≤ 120 dòng.
- [ ] Mọi test ở bảng trên xanh.
- [ ] Ngưỡng của DX1, F4, C2, DX3 đọc từ `thresholds` của gói spec.
- [ ] Khuôn lệnh rabbitmqadmin đọc từ `fix-templates.json` và đã được kiểm với rabbitmqadmin v2 bản mới nhất (GC25).
- [ ] Không phụ thuộc lúc chạy ngoài `spec` và `model`.

## Thay đổi và giả định

Các thay đổi dưới đây chưa được chép vào các tab trước; mỗi dòng ghi chỗ cần sửa khi chép.

| #   | Thay đổi                                                                                                                                      | Chỗ cần sửa                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Hàm `severity` gộp vào `evaluate`                                                                                                             | Tab v0.1, mục bộ máy luật và kiểu `RuleDef`         |
| 2   | `Verdict` có thêm `needs`; dung sai `loose` ra `pass` kèm ghi chú                                                                             | Tab v0.1, mục bộ máy luật                           |
| 3   | Thêm `urgency`; ba việc làm trước sắp theo độ khẩn                                                                                            | Tab v0.1, mục báo cáo                               |
| 4   | T9 tách biến thể `expires`, không còn điều kiện "không có dead-letter"                                                                        | Tab v0.1, mục tám luật S1; tab chính, danh mục luật |
| 5   | Tham số của T2 bỏ `exchanges`, thêm `reason`, `count`, `since`, `node`; khoá văn bản theo biến thể                                            | Tab spec, mục văn bản và mục danh mục luật          |
| 6   | Gói spec có thêm `thresholds` trong `rules.json` và file `fix-templates.json`                                                                 | Tab spec                                            |
| 7   | Model có thêm `matchingPolicies(obj)`, bộ sưu tập `users` (chỉ đọc khi CLI chạy bằng user quản trị), thực thể `user` trong ngữ pháp đường dẫn | Tab model, mục `Actual` và API                      |
| 8   | L3 lên S1 khi policy thua mang khoá an toàn mà policy thắng không có                                                                          | Tab chính, danh mục luật                            |

| Mã   | Giả định                                                                                       | Kiểm ở                            |
| ---- | ---------------------------------------------------------------------------------------------- | --------------------------------- |
| GC25 | Cú pháp khai báo và cập nhật policy của rabbitmqadmin v2 khớp khuôn trong `fix-templates.json` | Chạy lệnh sinh ra trên broker thử |
| GC26 | Khoá `ha-mode` hiện trong `definition` của `/api/policies` trên 3.13                           | Bản ghi thô 3.13                  |
| GC27 | `consumer_count` của channel có cả khi thống kê management tắt                                 | Biến thể `nostats`                |
