# Ghi chú hiện thực v0.1

Những chỗ mã nguồn khác hoặc thêm so với [spec](./spec.md), và lý do. Khi spec và mã khác nhau mà không có dòng ở đây, đó là lỗi.

## Bổ sung so với spec

| Chỗ                         | Thay đổi                                                                                           | Lý do                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/fetch.ts`              | File mới: một GET qua bộ giới hạn, phân loại lỗi, thử lại                                          | `paginate`, `prometheus` và `reader` cùng cần vòng này; để riêng giữ `retry.ts` thuần, dễ phủ nhánh                                                    |
| `Throttle`                  | Thêm chốt cửa sổ trượt: không gửi khi 1 giây vừa qua đã có `max(1, floor(r))` request              | Token bucket thuần cho phép tới `2r` request trong một cửa sổ 1 giây (xả đầy rồi nạp lại), trái với nghiệm thu "không cửa sổ 1 giây nào vượt `maxRps`" |
| `Identified`                | Thêm `raw.prometheus` và `totals`; `capability` là `null` khi overview không có phiên bản đọc được | `read` cần văn bản Prometheus đã lấy ở pha nhận diện, và tổng số đối tượng để tính trần trang                                                          |
| `ReadOptions.onDebug`       | Một dòng mỗi request cho `--debug`                                                                 | Spec mô tả dòng nhật ký nhưng `ReadOptions` chưa có chỗ nhận                                                                                           |
| `BrokerTarget.name`         | Tên context, thay cho origin trong thông báo lỗi                                                   | Spec yêu cầu thay origin bằng tên context, nhưng `BrokerTarget` không mang tên đó                                                                      |
| `EndpointRead.splitByVhost` | Cờ trong kế hoạch của model                                                                        | Số vhost chỉ biết sau khi đọc `/api/vhosts`, nên quyết định "≤ 20 vhost thì đọc theo vhost" phải xảy ra lúc chạy                                       |
| `estimateRead`              | Xuất ra công khai                                                                                  | Test ước tính và CLI tính lại khi đổi `maxRps`                                                                                                         |

## Khác spec

- **Prometheus đọc một lần, ở pha nhận diện.** Phép thử chính là lần đọc: lấy toàn bộ `/metrics`, một lượt, không thử lại, trần 2 giây cho cả request. Pha kiểm kê dùng lại kết quả đó, không gửi thêm. Ước tính vì vậy không tính request Prometheus.
- **URL chỉ có user (`u@host`)** cũng bị từ chối bằng CX4, như `user:pass@`.
- **Phân loại lỗi mạng mở rộng.** Ngoài các mã trong bảng: `SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_GET_ISSUER_CERT(_LOCALLY)`, mọi `ERR_TLS_*`, `ERR_SSL_*` là `tls`; `EHOSTUNREACH`, `ENETUNREACH` như `ECONNREFUSED`; `ETIMEDOUT` là `timeout`. Mã không nhận ra thành `connect`, không thử lại. 5xx ngoài 500, 502, 503, 504 không thử lại.
- **Overview lỗi ở pha nhận diện luôn dừng.** Bảng lỗi ghi "—" cho 404 và body quá lớn; `identify` vẫn trả `failed` với CX1, vì không có overview thì không có phiên bản để đọc tiếp.
- **Throttle dừng theo `Retry-After`** chỉ với 429 và 503, đúng bảng thích nghi. Với 502, 504, `Retry-After` chỉ thay thời gian chờ trước lần thử lại.
- **Số socket** là 5 (concurrency tối đa 4 + 1), vì `Agent` được tạo ở `createReader`, trước khi biết `concurrency` của lần đọc.
- **`totalsOf` cần đủ năm khoá** của `object_totals`. Khi thống kê tắt, broker không trả `channels`, `consumers`, nên tổng là `null`: trần trang rơi về 1.000 và ước tính không tính được trang theo tổng.
- **Trần trang khi không biết tổng** (overview thiếu `object_totals`) là 1.000 trang.
- **Ước tính** với binding, consumer đọc theo vhost: lúc nhận diện chưa biết số vhost nên tính 1 request mỗi endpoint.
- **`aborted.pagesTotal`** là `estimate.requests` của lần nhận diện.
- **Endpoint không có trong kế hoạch** được trả `not_attempted` không kèm `reason`.
- **Sự kiện `warning`**: `slow_broker` phát một lần khi tốc độ xuống 1 request mỗi giây; `retry_after` khi bộ giới hạn dừng theo `Retry-After`. Sự kiện `throttle` phát cả khi tốc độ tăng.
- **undici 7**, không phải 8: undici 8 cần Node ≥ 22.19, trong khi gói hỗ trợ Node 20.

## Công cụ

- `record-raw` nhận `--url`, `--user` và mật khẩu qua biến môi trường `OCHO_PASSWORD`; `--context` sẽ có khi gói cli đọc được context. Nó tự gọi `redact-raw` sau khi ghi, và ghi `prometheus.json` (trạng thái) kèm `prometheus.txt` (văn bản).
- `redact-raw` còn che tên node (`rabbit@<host>`) và mọi chuỗi khớp IPv4, IPv6, `*.amazonaws.com`, `*.internal`. Kiểm chặn commit được nối vào lint-staged của repo (`redact-raw --check-files` cho `fixtures/raw/**`), vì repo chưa có CI; `redact-raw --check <dir>` quét cả cây.
- Các công cụ chạy bằng Node trực tiếp (strip type, Node ≥ 22.18) và nạp `@ochotona/broker` từ `dist`, nên cần `pnpm build` trước.

## Tình trạng so với định nghĩa hoàn thành

| Mục                                                          | Tình trạng                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test theo bảng "Test bắt buộc"                               | Có cho URL, phân trang, phân loại lỗi, thử lại, throttle, nguồn, huỷ, CL1 (ba tầng), bí mật, sự kiện, ước tính. Test bí mật là hook toàn cục (`test/setup.ts`): mọi sự kiện, dòng nhật ký, kết quả và lỗi của reader trong test đi qua `test/secrets.ts` và được quét sau mỗi file |
| Tích hợp trên ma trận 3.13, 4.2, 4.3 × 4 biến thể            | Đã chạy `record-raw` trên ma trận `SUT/` (thêm 4.0) bằng user `monitoring`, cả 16 bản ghi xong. Chưa nối vào CI                                                                                                                                                                    |
| Gây lỗi bằng Toxiproxy                                       | **Chưa có**; thay tạm bằng test mất kết nối trên mock và test phản hồi chậm của throttle                                                                                                                                                                                           |
| Node 20 và 22                                                | **Chưa chạy**; mới chạy trên Node 24                                                                                                                                                                                                                                               |
| Phủ nhánh ≥ 90% cho `retry.ts`, `throttle.ts`, `paginate.ts` | Đạt: 95,6%, 93,3%, 91,3% (`pnpm test:coverage`)                                                                                                                                                                                                                                    |
| Bản ghi thô 3.13, 4.2, 4.3, Amazon MQ trong `fixtures/raw/`  | Có cho 3.13, 4.0, 4.2, 4.3 (đã che). **Thiếu Amazon MQ**                                                                                                                                                                                                                           |
| Bảng `check-assumptions` dán vào spec                        | Có, trong [spec](./spec.md) mục "Kết quả kiểm giả định"                                                                                                                                                                                                                            |
| 10.000 queue ở 5 request mỗi giây ≤ 3 phút                   | **Chưa đo trên broker thật**. Theo công thức ước tính, broker trong test ước tính (10.000 queue, 600 exchange, 1.200 connection, 2.400 channel) cần 37 request, khoảng 9 giây                                                                                                      |
| Phụ thuộc lúc chạy chỉ `spec`, `model`, `undici`             | Đạt                                                                                                                                                                                                                                                                                |
