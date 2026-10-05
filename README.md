# Ochotona

Mục đích của Project này là đem lại khả năng làm việc với RabbitMQ một cách tử tế và mượt mà.

## Cấu trúc

| Thư mục              | Nội dung                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `node/`              | Monorepo pnpm, turbo. Các gói `spec`, `model`, `rules`, `broker`, `compiler`, `cli` (lệnh `ocho`), `tui` (lệnh `ocho-tui`) |
| `SUT/`               | Ma trận broker RabbitMQ thật (3.13, 4.0, 4.2, 4.3) trên Docker để test, xem [SUT/README.md](SUT/README.md)                 |
| `node/fixtures/raw/` | Bản ghi thô của SUT, cho test không cần mạng                                                                               |

## Kiểm chứng `ocho` trên SUT, từng bước

Phần dưới dựng broker RabbitMQ 4.2 trên máy, rồi dùng `ocho` đọc nó. SUT cố ý có lỗi cấu hình (policy chồng nhau, quorum queue không dead-letter, publisher không confirm…), nên `doctor` phải tìm ra chúng.

### 1. Cần có

- Docker (có `docker compose`).
- Node ≥ 20 và pnpm.
- Các cổng 42011–42034 còn trống.

### 2. Build CLI

```sh
cd node
pnpm install
pnpm exec turbo run build --filter=@ochotona/cli...   # cli và năm gói nó cần

alias ocho="node $PWD/packages/cli/dist/bin/ocho.js"
ocho version
# ocho 0.1.0 (spec 0.4.0, Node v24.10.0, darwin-arm64)
```

Muốn một file chạy được không cần Node: `pnpm --filter @ochotona/cli build:sea` ra `packages/cli/dist/sea/ocho` cho nền tảng đang chạy, hoặc tải binary dựng sẵn ở GitHub Releases (tag `cli-v*`, xem [cách phát hành](node/packages/cli/docs/release.md)).

### 3. Dựng SUT 4.2

```sh
cd ../SUT
docker compose -f 4.2/docker-compose.yml --profile traffic up -d --wait
```

Lệnh dựng bốn broker và lưu lượng giả (perf-test). Chờ khoảng 20 giây để thống kê kịp có, rồi mới chạy `doctor`.

| Broker     | Management             | Prometheus                     | Có gì                       |
| ---------- | ---------------------- | ------------------------------ | --------------------------- |
| `full`     | http://localhost:42011 | http://localhost:42021/metrics | Đủ nguồn dữ liệu            |
| `nostats`  | http://localhost:42012 | http://localhost:42022/metrics | Tắt thống kê của management |
| `noprom`   | http://localhost:42013 | không có                       | Không bật plugin Prometheus |
| `listonly` | http://localhost:42014 | không có                       | Cả hai                      |

Hai user: `ocho-doctor` / `ocho-doctor` (tag `monitoring`, chỉ đọc, dùng cho `ocho`) và `ocho-admin` / `ocho-admin` (quản trị, chỉ để chạy lưu lượng).

### 4. Lần chạy đầu

```sh
ocho doctor --url http://localhost:42011 --user ocho-doctor \
  --prometheus-url http://localhost:42021/metrics
# Password for ocho-doctor@localhost:   ← gõ ocho-doctor
echo $?   # 1
```

Kết quả mong đợi:

- Dòng đầu: `Connected to localhost … · RabbitMQ 4.2.9 · 1 node · Khepri`, và `Sources: HTTP API [ok] · management stats [ok] · Prometheus [ok]`.
- `S1 DATA SAFETY (3)`: L3 trên queue `overlap`, T4 trên `orders.parking`, T5 trên `orders.created` (vhost `payments`).
- `S3 OPERABILITY`: C1, C2, R1 (lưu lượng không confirm, auto-ack), T1 (`work.backlog`), T2 (`direct`, `orders`), T3, T9, DX2.
- `Do these first:` ba việc, mỗi việc có lệnh `rabbitmqadmin` để sửa.
- Exit code 1, vì có `fail` ở mức S1.

Không truyền `--prometheus-url` thì Ocho thử cổng 15692 cùng host, không có ở SUT, nên nguồn Prometheus là `[unavailable]`. Đó không phải lỗi.

### 5. Lưu context

```sh
ocho context add sut42 --url http://localhost:42011 --user ocho-doctor \
  --prometheus-url http://localhost:42021/metrics \
  --password-command "echo ocho-doctor"
# sut42: RabbitMQ 4.2.9 · 1 node · user tags monitoring

ocho context list
ocho context show sut42    # password_command hiện là "set", không bao giờ in ra
ocho doctor                # từ giờ không cần cờ
```

`context add` nối thử trước khi lưu; sai mật khẩu thì không lưu gì. File context nằm ở `~/.config/ochotona/contexts.yaml`, quyền 0600, chỉ giữ lệnh lấy mật khẩu (thật thì dùng `op read …` hay `pass …`, không dùng `echo`).

### 6. JSON, exit code, tiếng Việt

```sh
ocho doctor --json | jq '.summary'
# { "fail": 14, "pass": 111, "not_checked": 9, "not_applicable": 0, "waived": 0 }

ocho doctor --json > /dev/null; echo $?          # 1: có fail ở S1
ocho doctor --fail-on S3 > /dev/null; echo $?    # 1: tính cả fail S2, S3

ocho doctor --lang vi | head -3
# Đã nối tới sut42 trong 0,1s · RabbitMQ 4.2.9 · 1 node · Khepri
```

stdout chỉ có kết quả (một document JSON với `--json`). Tiến trình, cảnh báo, lỗi đi stderr.

### 7. Giải thích

```sh
ocho explain T5                              # luật: Fails when, cơ chế, cách sửa, hai ví dụ
ocho explain queue overlap                   # giá trị hiệu lực từng khoá, lấy từ đâu
ocho explain orders.created --vhost payments
ocho explain events.unrouted; echo $?        # 4: vừa là queue vừa là exchange
```

`explain queue overlap` phải cho thấy `overlap-a (prio 2, applied) · overlap-b (prio 1, ignored)`, `overflow drop-head` từ mặc định (T3), và `Broker agrees`. `explain` một đối tượng chỉ đọc 6 request, nên vẫn nhanh trên broker lớn.

### 8. Ảnh chụp, đọc không cần broker

```sh
ocho doctor --save snap.json --redact-hosts   # tên host, connection thành mã băm
ocho doctor --from snap.json                  # cùng báo cáo, không nối mạng
```

### 9. Khai báo luồng bằng `ocho.yaml`

```sh
ocho import --non-interactive
# Wrote ocho.yaml: 10 flows (0 strict, 0 loose, 10 undeclared), 0 families, …
```

Mở `ocho.yaml`, đổi `tolerance` của luồng `direct:legacy` từ `undeclared` sang `strict`, rồi:

```sh
ocho doctor                     # T1 trên queue legacy giờ ở S1: luồng strict không chấp nhận classic queue
ocho explain flow direct:legacy
```

Bỏ `--non-interactive` thì `import` hỏi dung sai từng luồng; Enter để giữ mặc định.

### 10. Các biến thể và đường lỗi

```sh
# Tắt thống kê: luật cần thống kê thành "Not checked", có lý do và cách mở khoá
OCHO_PASSWORD=ocho-doctor ocho doctor --url http://localhost:42012 --user ocho-doctor
# Sources: … management stats [unavailable] … · 66 not checked

OCHO_PASSWORD=wrong ocho doctor --url http://localhost:42011 --user ocho-doctor; echo $?
# error CX3: The broker rejected user ocho-doctor at /api/overview with 401.   → exit 3

ocho doctor --url http://localhost:42019 --user ocho-doctor; echo $?
# error CX1: Cannot reach localhost. (ECONNREFUSED)                            → exit 3

ocho doctor --bogus; echo $?
# error: unknown flag --bogus … Next  Run ocho help doctor …                   → exit 4
```

Phiên bản khác: thay `4.2` bằng `3.13`, `4.0`, `4.3` và đổi cổng theo bảng trong [SUT/README.md](SUT/README.md) (ví dụ 3.13 `full` là 31311). Trên 3.13, `--target-version 4.2` bật thêm VT1 (queue `legacy` mirror bằng `ha-mode`) và VT2 (`orders.parking` sẽ nhận delivery limit mặc định sau nâng cấp).

### 11. Giao diện terminal: `ocho-tui`

Cùng những việc trên, nhưng chọn bằng phím mũi tên thay vì nhớ cờ:

```sh
cd node
pnpm exec turbo run build --filter=@ochotona/tui...
alias ocho-tui="node $PWD/packages/tui/dist/bin/ocho-tui.js"

ocho-tui                   # Home: sut42 (● mặc định), Enter mở menu: doctor, explain, import…
ocho-tui --context sut42   # vào thẳng doctor
ocho-tui --from snap.json  # đọc ảnh chụp
```

Doctor hiện danh sách bên trái (làm trước, lỗi theo mức, chưa kiểm, đã qua, điểm mù) và khối chi tiết bên phải; Enter giải thích luật, `o` giải thích queue đang chọn, `/` lọc, `s` lưu ảnh chụp. Mỗi kết quả in mờ lệnh `ocho` tương đương. `?` ở bất kỳ màn hình nào liệt kê phím. Xem [node/packages/tui/README.md](node/packages/tui/README.md).

### 12. Dỡ SUT

```sh
cd SUT
docker compose -f 4.2/docker-compose.yml --profile traffic down -v
ocho context remove sut42 --yes
```

## Tài liệu

- [docs/cli-usage.md](docs/cli-usage.md): các luồng dùng `ocho` điển hình (lần đầu khám broker, context, `ocho.yaml`, CI, điều tra, nâng cấp, chia sẻ ảnh chụp).
- [node/packages/cli/README.md](node/packages/cli/README.md): lệnh `ocho`, exit code, phát triển; spec đầy đủ ở `docs/`.
- [node/packages/tui/README.md](node/packages/tui/README.md): lệnh `ocho-tui`, các màn hình, phím, binary SEA.
- [SUT/README.md](SUT/README.md): ma trận broker, cổng, ghi bản ghi thô.
- README của từng gói trong `node/packages/`.
