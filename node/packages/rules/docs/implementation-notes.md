# Ghi chú cài đặt @ochotona/rules v0.1

Chỗ mã khác [spec.md](spec.md), quyết định nhỏ spec chưa nói, và phần định nghĩa hoàn thành còn thiếu.

## Thay đổi đã chép sang gói khác

Bảng "Thay đổi và giả định" của spec có tám dòng; phần thuộc dữ liệu và mã đã làm trong lần cài đặt này.

| #   | Thay đổi                                                        | Đã làm ở                                                                                                                                                        |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | Tham số mới của T2 và các luật khác; khoá văn bản theo biến thể | `spec/data/rules.json` (`params` của 22 luật), `spec/data/i18n/{en,vi}.json`, kiểm chéo trong `spec/scripts/checks.ts` cho khoá `rule.<MÃ>.<trường>.<biến thể>` |
| 6   | `thresholds` trong `rules.json`, file `fix-templates.json`      | `spec/data/rules.json`, `spec/data/fix-templates.json` cùng schema, `fixTemplate()`, `hasMessage()` trong `@ochotona/spec`                                      |
| 7   | `matchingPolicies(obj)`, bộ sưu tập `users` của model           | `model/src/effective.ts`; `Actual.users`, `planRead({ users })`, broker đọc `/api/users` khi kế hoạch có                                                        |
| —   | Giả định GC25, GC26, GC27                                       | Đăng ký trong `spec/data/codes.json`. GC25 đã kiểm (dưới); GC26 thấy đúng trên bản ghi 3.13 (`ha-mode` có trong `definition`)                                   |

Các dòng 1–4 và 8 là sửa văn bản của các tab trước; các tab đó không nằm trong repo này.

`rules.json` cũng đổi `appliesTo` của VT4 từ `node` sang `broker`, cho khớp bảng mười bốn luật: một kết quả cho cả cluster.

## Chỗ khác spec

- **`readNeeds` thêm `'prometheus'` vào `requires`** khi luật cần `broker.counters.unroutableDropped`. `model.planRead` chỉ đọc Prometheus khi `requires` có endpoint đó và cờ `prometheus` bật; trước sửa CLI không bao giờ đọc Prometheus. Thấy khi chạy `ocho doctor` trên SUT 4.2.

| Spec                                                     | Mã                                                                                                                              | Lý do                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Khoá của `params` đúng bằng `meta.params`                | Khoá là tập con của `meta.params`, kiểu đúng (`number`, `string`/`instant`, `list`)                                             | Tham số thay theo biến thể (T2 `at_risk` không có `count`) và theo dữ liệu (T1 chỉ có số khi biết). Thiếu tham số mà khuôn câu cần thì `toFinding` ném, và test schema bắt |
| `Verdict` có `pass`, `not_applicable`, `needs`, `fail`   | Thêm `not_checked` mang lý do                                                                                                   | L3 có thể không kết luận được vì một phép suy ra (pattern ngoài tập PCRE hỗ trợ), không phải vì một trường                                                                 |
| `evaluate` trả một `Verdict`                             | Trả một hoặc một mảng                                                                                                           | VT3 (mỗi tính năng), DX3 (mỗi loại), T9 (`ttl` và `expires` trên cùng queue)                                                                                               |
| `RuleDef` có `code`, `appliesTo`, `requires`, `optional` | Thêm `variants`, `needs`                                                                                                        | Ma trận phủ cần biết biến thể và nhánh `needs` của luật                                                                                                                    |
| `View` chỉ có trường đã khai                             | Thêm `ref` của đối tượng và `prov(path)`                                                                                        | Trường `requires` là giá trị trần nên mất nguồn gốc; bằng chứng `observed` cần `prov`                                                                                      |
| `RuleResult`                                             | Thêm `tolerance`; `notChecked.source` là đường dẫn nguồn của nguyên nhân gốc                                                    | `toFinding` cần đường dẫn nguồn để điền `{path}` của `reason.forbidden`…                                                                                                   |
| Bộ sưu tập `unknown`: `not_checked` cấp broker           | `notChecked.path` là tên thực thể (`queue`, `channel`)                                                                          | Không có `FieldPath` nào đứng cho cả bộ sưu tập                                                                                                                            |
| Chế độ `test` ném khi vi phạm hợp đồng                   | Ngoại lệ của luật cũng ném                                                                                                      | Trong test, nuốt ngoại lệ thành `not_checked` sẽ giấu lỗi của luật                                                                                                         |
| Ba kiểm hợp đồng của `fail`                              | Thêm: `urgency` hợp lệ; bằng chứng chỉ trỏ tới trường đã khai trong `requires`/`optional`; verdict lạ là vi phạm                | Bằng chứng ngoài các trường đã khai là dữ liệu bộ máy không biết luật đọc; verdict sai hình dạng trước đây bị bỏ qua im lặng                                               |
| `requiredPaths` → `model.planRead` đổi đường dẫn         | `readNeeds(rules)` của gói này trả `{ requires, prometheus, wantsUsers }` cho `planRead`                                        | `FieldPath` thuộc gói rules; model không biết nó. Bảng ở `src/read-plan.ts`                                                                                                |
| Truy cập dữ liệu chỉ qua view                            | Luật vẫn đọc `ctx.index`, `ctx.actual.policies` khi cần đối tượng khác (T2 tìm exchange đích của AE, L3 gọi `matchingPolicies`) | Đường dẫn chỉ trả giá trị trường; trường hợp này cần cả đối tượng. Luật vẫn khai trường tương ứng trong `requires` để `not_checked` đúng                                   |

## Quyết định theo luật

- **T2.** Exchange `fanout` có binding luôn pass: mọi message đều được giao, nên không có gì "không định tuyến được". Không có ngoại lệ này thì chính `ocho.unroutable` mà lệnh sửa tạo ra bị báo ở lần chạy sau.
- **T2, bộ đếm.** `dropped` khi bộ đếm cluster > 0, `dropped_node` khi chỉ có số Prometheus của một node. Bộ đếm `known` bằng 0 không thêm bằng chứng.
- **T4.** `loop` khi phiên bản broker < 4.0 (tức 3.13, phiên bản nhỏ nhất được hỗ trợ). `delivery-limit` âm là không giới hạn.
- **T9.** `ttl` và `expires` độc lập; một queue có cả hai ra hai kết quả.
- **L3.** Khoá an toàn chỉ tính khi áp được cho loại đối tượng (`keys.json`): `alternate-exchange` của policy thua trên một quorum queue không làm L3 lên S1.
- **VT2.** Tham số `targetVersion` và `defaultLimit`; `defaultLimit` đọc từ bảng năng lực của phiên bản đích.
- **DX3.** Tốc độ "tạo queue" là `queue_created`, không phải `queue_declared`.
- **N1, N2, N3.** `protocol` rỗng (thống kê tắt, `/api/connections` chỉ còn tên, node, user, vhost) là `unknown: field_absent`, ra `not_checked`; chỉ giao thức đã biết khác `AMQP 0-9-1` mới ra `not_applicable` với ghi chú `protocol`.
- **Q3.** `user.tags` đọc từ `Actual.users`, chỉ `known` khi CLI chạy bằng user quản trị và bật `planRead({ users: true })`; không thì `unknown: source_unavailable`, Q3 ra `not_checked` cho mọi connection không phải `guest` và không trùng user của `whoami`. User có trong danh sách connection nhưng vắng khỏi `/api/users` (xác thực ngoài broker, ví dụ LDAP) ra `not_checked` với `field_absent`, không bao giờ `pass`.
- **Văn bản lớp.** Tham số `*Layer` là `policy <tên>`, `operator policy <tên>`, `argument` hoặc `default`.

## Lệnh sửa

- Luôn dùng `policies declare` với định nghĩa đầy đủ, kể cả khi cập nhật policy P đang áp: khai lại P với cùng tên, pattern, apply-to, priority, và định nghĩa là khoá cũ cộng khoá mới. Không dựa vào lệnh patch, vì declare ghi đè trọn và cú pháp ổn định hơn.
- Chưa có policy: tạo `ocho-ae-<tên>` (exchange) hoặc `ocho-q-<tên>` (queue), pattern `^<tên đã escape>$`, priority 0. Tên theo đối tượng chứ không theo luật: nếu T3 và T5 mỗi luật tạo một policy riêng cho cùng queue thì hai policy cùng priority khớp một queue, đúng lỗi L3.
- **Gộp lệnh** (`mergePolicyFixes`, chạy cuối `runRules`): mọi lệnh nhắm cùng một policy mang hợp các khoá mà mọi luật đề xuất cho policy đó. Không gộp thì áp lệnh của T3 sau lệnh của T5 sẽ xoá khoá của T5, vì mỗi lệnh khai lại P từ định nghĩa đã đọc. Khoá trùng mà khác giá trị: kết quả đứng trước (mức cao hơn, rồi thứ tự luật) thắng. `set` của mỗi kết quả vẫn chỉ là khoá luật đó đề xuất.
- Không biết policy đang áp (`appliedPolicy` `unknown`, hoặc danh sách policy không đọc được) thì chỉ trả `set`, không có lệnh.
- **GC25 đã kiểm** với rabbitmqadmin 2.35.0 trên SUT 3.13 và 4.2 (`test/live.test.ts`): áp mọi lệnh sinh ra theo thứ tự ngược, đọc lại, mọi fail có lệnh đã hết và không có fail mới. Cờ `--vhost` đặt trước `policies` là cờ toàn cục hợp lệ.

## Fixture

- Tầng đơn vị: một file cho mỗi luật (`fixtures/unit/<MÃ>.ts`, xuất mảng `Fixture`) thay vì một file cho mỗi ca, 132 ca cho 22 luật. Kỳ vọng thêm giá trị `result: 'none'` để kiểm loại trừ `skip`.
- Kỳ vọng có thể nêu thêm `urgency`, một phần `params`, `fixSet` và danh sách bằng chứng (`"<kind> <path> <note>"`); tám luật S1 dùng chúng ở các ca chính.
- Tầng tích hợp: chưa có thư mục `definitions.json`, `traffic.ts` riêng cho mỗi ca. Thay vào đó `fixtures/integration/recorded.ts` chạy mọi luật trên 16 bản ghi thô của ma trận `SUT/` (3.13, 4.0, 4.2, 4.3 × `full`, `nostats`, `noprom`, `listonly`), cùng định dạng `expect`. Tên connection, channel trong bản ghi bị che, nên ca của R1, C1 dùng `object: '*'` (đối tượng bất kỳ của luật). Definitions và lưu lượng của SUT đã được bổ sung để mọi luật S1 có ca `fail` và `near` (xem `SUT/README.md`).
- Ma trận phủ chạy qua vitest (`pnpm coverage-matrix`), vì mã dùng import không đuôi theo kiểu bundler nên `node` không chạy thẳng được. Cả hai tầng đủ ô. Ma trận cũng báo biến thể mà fixture thấy luật trả nhưng luật không khai.
- `ruleExamples(code)` xuất ca `fail` đầu tiên và ca `near` đầu tiên của mỗi luật ở tầng đơn vị (tên ca, nhãn đối tượng, kết quả, mức, biến thể) cho `ocho explain <MÃ>` (thay đổi 4 của spec CLI). Dữ liệu ở `src/gen/examples.ts`, sinh bằng `pnpm examples` (chạy fixture thật để lấy nhãn); `test/examples.test.ts` hỏng khi file lệch fixture. Tên ca chỉ có tiếng Anh.

## Phát hiện trên bản ghi thật

- **F4 trên queue rảnh.** Khi thống kê bật mà queue chưa giao message nào, `/api/queues` không có `message_stats`; model từng báo tốc độ là `unknown: field_absent`, nên F4 ra `not_checked` trên mọi queue rảnh. Đã sửa ở model: thống kê bật mà vắng thì là 0.
- **Áp nhiều lệnh sửa cho cùng một policy** từng làm mất khoá của nhau, và policy mới đặt tên theo luật tạo ra lỗi L3. Lộ ra khi áp lệnh trên broker thật; đã sửa (mục Lệnh sửa).
- **DX2** fail trên mọi broker của SUT: `disk_free_limit` mặc định 50 MB nhỏ hơn `mem_limit`. Đúng với luật.

## Tình trạng so với định nghĩa hoàn thành

| Mục                                                               | Tình trạng                                                                                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 22 luật, mỗi luật một file ≤ 120 dòng                             | Có (`src/catalog/`; L3 có hai `RuleDef` trong một file, dài nhất 110 dòng)                                        |
| Ma trận phủ                                                       | Đủ cả hai tầng                                                                                                    |
| Fixture đơn vị ở chế độ `test`                                    | Có, `test/unit-fixtures.test.ts`                                                                                  |
| Tích hợp 3.13, 4.2, 4.3 × 4 biến thể                              | Có trên bản ghi (cả 4.0), `test/recorded.test.ts`; mọi ca `fail` S1 bắt được, không ca `near`, `anti` nào sai     |
| Tính chất (fast-check)                                            | Có, `test/property.test.ts`, 150 ca mỗi lần chạy                                                                  |
| Schema `finding:1`, en và vi                                      | Có, `test/finding.test.ts`                                                                                        |
| Bảng ca `planActions`                                             | Có, `test/actions.test.ts`                                                                                        |
| Lệnh sửa: snapshot, tên có nháy, dấu cách, `/`, `sh -n`           | Có, `test/fix.test.ts`                                                                                            |
| Hiệu năng ≤ 1 giây                                                | Có, `test/perf.test.ts`; khoảng 350 ms cho 162.000 kết quả trên máy dev                                           |
| Mutation ≥ 85% (Stryker) trên tám luật S1                         | 96,6% (`pnpm test:mutation`, khoảng 3 phút). 17 mutant sống: phần lớn tương đương hoặc chỉ đổi giá trị bằng chứng |
| Ngưỡng DX1, F4, C2, DX3 đọc từ `thresholds`                       | Có                                                                                                                |
| Khuôn lệnh đọc từ `fix-templates.json`, đã kiểm với rabbitmqadmin | Có; rabbitmqadmin 2.35.0 trên 3.13 và 4.2 (`pnpm test:live`)                                                      |
| Không phụ thuộc lúc chạy ngoài `spec`, `model`                    | Có                                                                                                                |
| `requiredPaths` → `model.planRead`                                | Có, qua `readNeeds` (bảng `FieldPath` → endpoint ở `src/read-plan.ts`)                                            |

## Stryker

`@stryker-mutator/vitest-runner` 10 không bật được mutant trong worker của vitest 5: dry run thấy đủ test nhưng mọi mutant đều sống, kể cả mutant làm module ném lúc nạp. Cấu hình dùng runner `command`: mỗi mutant chạy `vitest run` trong tiến trình riêng, mutant bật qua biến môi trường. Lệnh gọi thẳng `../../node_modules/vitest/vitest.mjs`, vì trong sandbox của Stryker `npx` không thấy vitest của pnpm.
