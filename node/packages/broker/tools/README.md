# Công cụ của @ochotona/broker

Chỉ dùng trong repo, không phát hành trên npm. Chạy `pnpm build` trước: các công cụ nạp gói từ `dist`.

| Công cụ                | Việc                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `record-raw.ts`        | Ghi fixture thô từ một broker thật vào `fixtures/raw/<label>/<variant>/`, rồi tự che host |
| `redact-raw.ts`        | Che host (và tên với `--redact names`) trong một bản ghi; `--check` quét cả cây           |
| `check-assumptions.ts` | In bảng kiểm giả định GC từ mọi bản ghi, dạng Markdown                                    |
| `mock-mgmt.ts`         | Management API giả lập cho test                                                           |

## Ghi một bản ghi

```sh
OCHO_PASSWORD=… pnpm --filter @ochotona/broker record-raw \
  --url https://b-1.mq.example:443 --user ocho-doctor \
  --label amazon-mq-3.13 --variant full \
  --out ../../fixtures/raw --redact names

pnpm --filter @ochotona/broker redact-raw --check ../../fixtures/raw
pnpm --filter @ochotona/broker check-assumptions ../../fixtures/raw
```

Tuỳ chọn khác của `record-raw`: `--ca <file>`, `--insecure`, `--prometheus off|<url>`, `--max-rps <n>`. Broker của design partner bắt buộc dùng `--redact names`.

Biến thể `nostats` và `listonly` được `check-assumptions` kỳ vọng không có `message_stats` và `churn_rates`. GC1 chỉ hỏng khi có endpoint trả 401 hoặc 403.

## Kịch bản chạy tay

Hai giả định cần broker đang thay đổi trong lúc đọc, nên không kiểm bằng bản ghi.

### GC13, GC24: thứ tự trang khi broker đang đổi

1. Tạo 2.000 queue `gc13-0000` đến `gc13-1999` trên một vhost riêng.
2. Trong một terminal, chạy vòng lặp tạo và xoá queue có tên ngẫu nhiên, khoảng 20 thao tác mỗi giây.
3. Trong terminal khác, chạy `record-raw --variant gc13 --max-rps 2` để việc đọc kéo dài.
4. Kiểm `queues.json`: mọi queue `gc13-*` có mặt đúng một lần, và tên trong mỗi trang tăng dần (`sort=name` giữ đúng qua các trang).

Có queue `gc13-*` bị thiếu hoặc lặp thì GC13 không đạt: model phải phát hiện bằng `page_shift`.

### GC22: Prometheus chỉ có số liệu của node đang trả lời

1. Dùng cluster ba node sau một load balancer chia đều.
2. Gọi `curl -s <lb>:15692/metrics | grep rabbitmq_identity_info` mười lần.
3. Ghi lại nhãn `rabbitmq_node` mỗi lần. Đạt khi nhãn đổi giữa các lần gọi và mỗi response chỉ có một node.
