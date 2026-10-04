# SUT: ma trận broker RabbitMQ để test

Mỗi thư mục phiên bản (`3.13`, `4.0`, `4.2`, `4.3`) có một `docker-compose.yml` dựng bốn broker, một cho mỗi biến thể nguồn dữ liệu trong thiết kế v0.1:

| Biến thể | Cấu hình |
| --- | --- |
| `full` | Plugin management và Prometheus, `collect_statistics_interval = 1000` |
| `nostats` | Thêm `management_agent.disable_metrics_collector = true` |
| `noprom` | Không bật plugin Prometheus |
| `listonly` | Cả hai |

Cấu hình dùng chung nằm trong `common/`: `conf.d/10-base.conf`, `nostats.conf`, danh sách plugin, và `definitions.json`. File definitions có hai vhost (`/`, `payments`), vài queue classic và quorum, exchange có alternate exchange, policy, operator policy, và hai user:

| User | Mật khẩu | Tag | Dùng cho |
| --- | --- | --- | --- |
| `ocho-admin` | `ocho-admin` | `administrator` | Harness: nạp definitions, chạy lưu lượng |
| `ocho-doctor` | `ocho-doctor` | `monitoring` | Ocho, chỉ đọc (GC1) |

Profile `traffic` chạy thêm một container `perf-test` cho mỗi broker: một producer có confirm và một consumer, 2 message mỗi giây, đủ để có connection, channel, consumer và thống kê.

## Cổng

`<base>` là 31300 (3.13), 40000 (4.0), 42000 (4.2), 43000 (4.3). `n` là 1 đến 4 theo thứ tự `full`, `nostats`, `noprom`, `listonly`.

| Cổng | Dịch vụ |
| --- | --- |
| `<base> + 10 + n` | Management HTTP API |
| `<base> + 20 + n` | Prometheus `/metrics` |
| `<base> + 30 + n` | AMQP |

Ví dụ 4.2 `full`: http://localhost:42011, Prometheus http://localhost:42021/metrics.

## Dùng

```sh
# Dựng một phiên bản, có lưu lượng
docker compose -f 4.2/docker-compose.yml --profile traffic up -d --wait

# Ghi fixture thô cho bốn biến thể vào node/fixtures/raw/rabbitmq-4.2/, kiểm che, in bảng giả định, rồi dỡ
./record.sh 4.2
KEEP=1 ./record.sh 4.2      # giữ broker chạy sau khi ghi
SETTLE=30 ./record.sh 4.2   # chờ lâu hơn trước khi ghi (mặc định 15 giây)

docker compose -f 4.2/docker-compose.yml --profile traffic down -v
```

`record.sh` cần Node chạy được TypeScript trực tiếp (≥ 22.18) và `pnpm install` ở `node/`.

## Điều đã thấy trên broker thật (4 tháng 10 năm 2026)

Khi tắt bộ thu thống kê (`nostats`, `listonly`):

| Hiện tượng | 3.13 | 4.0 | 4.2 | 4.3 |
| --- | --- | --- | --- | --- |
| `/api/channels` | 400 | 400 | 400 | **200, danh sách rỗng** |
| `/api/connections` | đủ, chỉ còn `name`, `node`, `user`, `vhost` | như 3.13 | như 3.13 | **200, danh sách rỗng** |
| `/api/consumers` | 400 | 400 | 400 | 400 |
| `/api/nodes` mất `applications`, `uptime`, `mem_limit` | có | có | có | có |
| `/api/queues` mất `effective_policy_definition` | có | có | không | không |
| `object_totals` mất `channels`, `consumers` | có | có | có | có |

Thông báo của 400: `Stats in management UI are disabled on this node`. Bảng `check-assumptions` đầy đủ nằm trong `node/packages/broker/docs/spec.md`, mục "Kết quả kiểm giả định".

Model đã xử lý ba hiện tượng ảnh hưởng tới kết quả: danh sách rỗng giả và 400 thành `unknown: source_unavailable`, còn bộ đếm Prometheus lấy uptime từ `rabbitmq_erlang_uptime_seconds` khi `/api/nodes` không có (xem `node/packages/model/docs/implementation-notes.md`).
