# Ghi chú hiện thực v0.1

Những chỗ mã nguồn khác hoặc thêm so với [spec](./spec.md), và lý do. Khi spec và mã khác nhau mà không có dòng ở đây, đó là lỗi.

## Bổ sung so với spec

| Chỗ                                                | Thay đổi                                                                             | Lý do                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caps.ts`                                          | `CapabilityTable`, `DEFAULT_CAPABILITY_TABLE`, `capabilitiesFor` nằm tạm trong model | `@ochotona/spec` chưa có nội dung. Bảng là dữ liệu thuần, chuyển sang spec mà không đổi hình dạng                                                    |
| `BrokerInfo.reported`                              | Thêm `version`, `unroutableDropped`, `unroutableReturned` đọc thô                    | Ảnh chụp không lưu `broker.version` và `counters` (dữ liệu suy ra), nên cần giữ đầu vào của chúng để tính lại khi nạp. Thêm trường là thay đổi minor |
| `ReadAnomaly.collection`                           | Mỗi bất thường ghi bộ sưu tập của nó                                                 | Để tính `meta.consistency` theo bộ sưu tập                                                                                                           |
| `AnomalyKind`                                      | Thêm `malformed_item`                                                                | Phần tử thiếu trường lõi (tên, vhost) bị bỏ thay vì ném ngoại lệ                                                                                     |
| `resolveEffective`                                 | Đầu vào có thêm `vhostDefaultQueueType`, `observedAt`; kết quả có thêm `anomalies`   | Lớp `vhost_default` cần mặc định của vhost; bất thường `unexpected_operator_key` sinh ra trong lúc gộp                                               |
| `loadSnapshot(json, caps, file?)`                  | Tham số `file` tuỳ chọn                                                              | Điền `meta.fromSnapshot.file`                                                                                                                        |
| `checkInvariants(actual, table?)`                  | Tham số bảng năng lực tuỳ chọn                                                       | INV5 cần biết mặc định dựng sẵn theo phiên bản                                                                                                       |
| `parseTemplate`, `renderTemplate`, `matchTemplate` | Xuất ra công khai                                                                    | `compiler` và `explain` cần dựng tên từ mẫu                                                                                                          |

## Quyết định nhỏ spec chưa nói

- **`queue-type` khi không biết mặc định của vhost.** Không có argument `x-queue-type` và `/api/vhosts` không đọc được thì khoá `queue-type` vắng khỏi `Effective`, thay vì đoán `classic`.
- **Phiên bản cluster `unknown`.** Mặc định dựng sẵn phụ thuộc phiên bản, nên `effective` của mọi queue và exchange thành `unknown: depends_on` trỏ về `broker.version`.
- **`members` của classic queue** là `known([])`.
- **`page_shift`** chỉ kiểm khi phạm vi là mọi vhost, vì `object_totals` tính cho cả cluster. Số đọc được gồm cả phần tử bị bỏ vì `unsupported_type` hoặc `malformed_item`.
- **`dangling_ref`**: chi tiết không chứa tên đối tượng đích, để ảnh chụp che được.
- **Y13** gắn vào luồng khai báo sau trong hai luồng trùng; family `registry` không mở tĩnh được nên không tham gia Y13.
- **Family có thành viên tĩnh** phải có đúng một tham số trong mẫu `queue` (Y6), vì mỗi thành viên là một chuỗi.
- **`diffTopology`** không tự chuẩn hoá; người gọi chạy `normalizeTopology` hai phía trước. `topologyFromActual` bỏ queue `exclusive` vì `TopoQueue` không mang trường đó.
- **Regex PCRE**: kiểm bằng một bộ quét nhỏ bỏ qua ký tự escape và lớp ký tự, nên `\++` hay `[+*]+` không bị coi là lượng từ chiếm hữu.

## Tình trạng so với định nghĩa hoàn thành

| Mục                                                      | Tình trạng                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Test theo bảng "Test bắt buộc"                           | Có cho mọi nhóm, trừ ingest bằng JSON ghi từ broker thật (chưa có `tools/record-raw.ts`); fixture hiện là JSON viết tay trong `test/fixtures.ts` |
| Vòng tròn fast-check 10.000 ca                           | Có, trong `test/topology.test.ts` (YAML được giả lập bằng vòng JSON, vì parse YAML là việc của compiler)                                         |
| Hiệu năng 10.000 queue ≤ 500 ms                          | Có, `test/perf.test.ts`                                                                                                                          |
| Phủ nhánh ≥ 95% cho `ingest/`, `effective.ts`, `flow.ts` | **Chưa đạt**: khoảng 66%, 92%, 72% (`pnpm test:coverage`)                                                                                        |
| Điểm mutation ≥ 80% (Stryker)                            | **Chưa cài**                                                                                                                                     |
| JSON schema `ocho.snapshot/1` trong `@ochotona/spec`     | **Chưa có**; hình dạng hiện được kiểm bằng `src/snapshot-shape.ts`                                                                               |
| TSDoc cho hàm xuất ra                                    | Có cho các hàm chính; chưa rà hết                                                                                                                |
