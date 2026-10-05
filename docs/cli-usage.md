# Dùng `ocho`: các luồng điển hình

`ocho` đọc một broker RabbitMQ (chỉ đọc, chỉ GET) và nói chỗ nào message có thể mất, theo thứ tự nên sửa. Tài liệu này đi qua những việc người ta thật sự làm với nó, từ lần chạy đầu tới chặn trong CI.

Ví dụ dùng broker `prod` tưởng tượng; chạy thử trên máy thì dựng SUT theo [README gốc](../README.md).

## Bốn thứ cần nắm

| Thứ | Vai trò |
| --- | --- |
| `ocho doctor` | Đọc broker, chấm mọi luật, in báo cáo và **ba việc làm trước**. Lệnh dùng nhiều nhất |
| `ocho.yaml` | Ý định của bạn: luồng nào `strict` (không được mất), `loose` (chấp nhận mất), service nào publish vào luồng nào, rủi ro nào tạm chấp nhận. Không có file thì mọi luồng là `undeclared` |
| `ocho explain` | Trả lời "vì sao": một mã luật, một mã lỗi, hay giá trị hiệu lực của một queue đến từ đâu |
| context | Broker đã lưu (URL, user, lệnh lấy mật khẩu), để khỏi gõ cờ mỗi lần |

**Mức độ.** S1 là an toàn dữ liệu (message có thể mất), S2–S3 là vận hành, S4–S5 là vệ sinh (chỉ hiện với `--verbose`).

**Exit code**, dùng được trong script:

| Mã | Nghĩa |
| --- | --- |
| 0 | Không có `fail` ở mức `--fail-on` trở lên (mặc định S1) |
| 1 | Có `fail` ở mức đó |
| 2 | Không có `fail`, nhưng có luật ở mức đó chưa kiểm được (thiếu quyền, thiếu nguồn dữ liệu) |
| 3 | Không nối được broker, sai mật khẩu, phiên bản không hỗ trợ |
| 4 | Dùng sai: cờ, file context, `ocho.yaml`, ảnh chụp |
| 5 | Lỗi của Ocho |
| 130 | Ctrl-C |

## 0. Chuẩn bị: một user chỉ đọc

Ocho chỉ cần tag `monitoring` và quyền đọc. Đừng dùng user quản trị (Ocho sẽ cảnh báo OC1).

```sh
rabbitmqctl add_user ocho-doctor            # hỏi mật khẩu
rabbitmqctl set_user_tags ocho-doctor monitoring
rabbitmqctl set_permissions -p / ocho-doctor '^$' '^$' '.*'   # lặp cho từng vhost
```

Amazon MQ: tạo user trong console với quyền tương đương.

Cài `ocho`: tải binary ở [GitHub Releases](https://github.com/maxubrq/Ochotona/releases) (tag `cli-v*`), hoặc build từ repo (xem README gốc).

## 1. Lần đầu khám một broker

Mục tiêu: trong vài phút biết broker này có chỗ nào mất message, và sửa chỗ nào trước.

```sh
ocho doctor --url https://rabbit.prod.internal:15671 --user ocho-doctor
# Password for ocho-doctor@rabbit.prod.internal:    (ô nhập ẩn)
```

Đọc báo cáo từ trên xuống:

1. **Dòng đầu**: phiên bản, số node, nguồn dữ liệu nào `[ok]`. Nguồn `[unavailable]` nghĩa là một số luật sẽ "Not checked", kèm cách mở khoá.
2. **`S1 DATA SAFETY`**: mỗi mục có *What happened*, *Is data safe*, *Do next* (kèm lệnh `rabbitmqadmin` sửa sẵn), *Evidence*, *Why*.
3. **`Do these first:`** ba việc nên làm trước, đã xếp theo mức độ, độ khẩn và số đối tượng bị ảnh hưởng.

Hiểu kỹ một mục trước khi sửa:

```sh
ocho explain T5                              # luật: khi nào fail, cơ chế, cách sửa, ví dụ
ocho explain queue orders.created --vhost payments   # từng khoá hiệu lực đến từ argument, policy hay mặc định
```

Sửa (lệnh in trong *Do next*, chạy bằng user có quyền ghi; Ocho không bao giờ tự sửa), rồi chạy lại `ocho doctor` để thấy mục đó biến mất.

Prometheus ở cổng khác 15692? Thêm `--prometheus-url http://host:9419/metrics`, hoặc `--no-prometheus` để bỏ qua.

## 2. Dùng hằng ngày: lưu context

```sh
ocho context add prod --url https://rabbit.prod.internal:15671 --user ocho-doctor \
  --password-command "op read op://infra/rabbit-prod/password"
ocho context add staging --url https://rabbit.stg.internal:15671 --user ocho-doctor \
  --password-command "pass show rabbit/staging"

ocho context list            # * đánh dấu context hiện tại (context thêm đầu tiên)
ocho context use staging
ocho doctor                  # broker hiện tại
ocho doctor --context prod   # một lần, không đổi context hiện tại
```

- `context add` nối thử trước khi lưu; sai thì không lưu gì.
- File `~/.config/ochotona/contexts.yaml` (quyền 0600) chỉ giữ **lệnh** lấy mật khẩu, không giữ mật khẩu. Dùng password manager (`op`, `pass`, `vault kv get -field=…`, `security find-generic-password -w …`).
- Thứ tự lấy mật khẩu: `--password-stdin`, biến `OCHO_PASSWORD`, `password_command` của context, ô nhập ẩn.

## 3. Khai báo ý định bằng `ocho.yaml`

Không có `ocho.yaml`, Ocho không biết queue nào chứa đơn hàng và queue nào chỉ là log, nên mọi thứ là `undeclared` và mức độ là mức thận trọng. Khai báo làm báo cáo chính xác hơn: luồng `strict` nâng rủi ro lên S1, luồng `loose` bỏ qua rủi ro bạn đã chấp nhận.

```sh
cd infra/rabbitmq           # thư mục sẽ commit ocho.yaml
ocho import --context prod  # hỏi dung sai từng luồng: [s]trict, [l]oose, [k]eep undeclared, [A] cho cả exchange
# hoặc không hỏi gì:
ocho import --context prod --non-interactive
# hoặc từ file export, không cần broker:
ocho import --from definitions.json
```

Sửa tay những phần thuộc về bạn (phần `topology` do `import` sinh lại, đừng sửa):

```yaml
flows:
  orders/order.created:
    tolerance: strict          # mất một message là sự cố
    exchange: orders
    routing_key: order.created
    groups: [orders.created]
  events/audit.#:
    tolerance: loose           # log, mất được

services:
  checkout-api:
    user: checkout             # connection của user này publish vào...
    flows: [orders/order.created]   # ...luồng này: R1 (confirm) của nó thành S1

waivers:
  - rule: T9
    object: queue audit
    reason: "audit chỉ giữ 1 ngày, mất là chấp nhận"
    by: max
    until: "2027-01-01"        # hết hạn thì rủi ro hiện lại
```

Rồi:

```sh
ocho doctor                     # tự dùng ./ocho.yaml; dòng cuối đếm "1 waived"
ocho doctor --flow orders/order.created   # chỉ chấm các đối tượng của một luồng
ocho explain flow orders/order.created    # luồng gồm gì, luật nào đang fail trên nó
ocho doctor --no-file           # bỏ qua ocho.yaml để so
```

Commit `ocho.yaml` cùng code hạ tầng. Topology đổi (thêm queue, exchange) thì chạy lại `ocho import`: phần `topology` được sinh lại, còn `flows`, `services`, `waivers`, chú thích của bạn được giữ.

## 4. Chặn trong CI

Chạy `doctor` định kỳ hoặc sau mỗi lần deploy hạ tầng, và làm pipeline đỏ khi có rủi ro mới.

```sh
OCHO_PASSWORD="$RABBIT_RO_PASSWORD" \
ocho doctor --url "$RABBIT_URL" --user ocho-doctor --json --fail-on S2 > report.json
code=$?
jq '.summary' report.json
exit $code
```

- `--json`: stdout có đúng một document `ocho.report/1`, mọi thứ khác ra stderr; lỗi cũng là JSON (`ocho.error/1`).
- `--fail-on S1|S2|S3` chọn mức làm pipeline đỏ.
- Exit 2 (chưa kiểm được) thường do quyền hoặc nguồn dữ liệu: coi là đỏ hay vàng tuỳ đội.
- Lưu `report.json` làm artifact để so giữa các lần chạy.

Ví dụ GitHub Actions:

```yaml
jobs:
  rabbitmq-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Install ocho
        run: |
          v=0.1.1
          curl -fsSLO "https://github.com/maxubrq/Ochotona/releases/download/cli-v$v/ocho-$v-linux-x64"
          curl -fsSLO "https://github.com/maxubrq/Ochotona/releases/download/cli-v$v/SHA256SUMS"
          sha256sum --check --ignore-missing SHA256SUMS
          install -m 0755 "ocho-$v-linux-x64" /usr/local/bin/ocho
      - name: Doctor
        env:
          OCHO_URL: ${{ vars.RABBIT_URL }}
          OCHO_USER: ocho-doctor
          OCHO_PASSWORD: ${{ secrets.RABBIT_RO_PASSWORD }}
        run: ocho doctor --file infra/rabbitmq/ocho.yaml --json --fail-on S1 > report.json
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: ocho-report, path: report.json }
```

Runner CI không vào được mạng của broker? Chạy `doctor --save` ở nơi vào được (luồng 7), rồi CI chấm ảnh chụp bằng `doctor --from`.

## 5. Điều tra: "vì sao queue này lại…"

```sh
ocho explain queue payments.retry --vhost payments
```

In bảng mỗi khoá hiệu lực (`max-length`, `overflow`, `dead-letter-exchange`, `delivery-limit`…): giá trị, lớp đặt ra nó (argument, policy, operator policy, mặc định của phiên bản), policy nào thắng và policy nào bị bỏ qua, luật nào đang fail vì khoá đó, và broker có đồng ý với cách Ocho tính không (`Broker agrees`). `explain` một đối tượng chỉ tốn khoảng 6 request, nên dùng thoải mái trên broker lớn.

Các câu hỏi khác:

```sh
ocho explain orders           # tên trơn: queue hoặc exchange (trùng cả hai thì báo, exit 4)
ocho explain exchange events  # alternate exchange có tồn tại và có binding không (T2)
ocho explain CX9              # mã lỗi: ví dụ 403 ở /api/overview là user thiếu tag
ocho explain LE5              # điểm mù: thứ broker không cho thấy, ai bắt được nó
ocho doctor --debug 2> debug.log   # mỗi request, thời gian từng bước; không bao giờ có mật khẩu
```

## 6. Trước khi nâng cấp RabbitMQ

```sh
ocho doctor --context prod --target-version 4.2
```

Bật thêm các luật nâng cấp (VT*) cho phiên bản đích. Ví dụ trên broker 3.13:

- VT1: classic queue còn mirror bằng policy `ha-mode`, mà 4.x đã bỏ mirroring.
- VT2: quorum queue không dead-letter, không `delivery-limit`, sau 4.0 sẽ nhận giới hạn mặc định 20 và bỏ message độc.
- VT3: tính năng deprecated đang được dùng.

Chạy lại sau mỗi lần sửa cho tới khi sạch, rồi mới nâng cấp.

## 7. Chia sẻ, xem lại, báo lỗi

```sh
ocho doctor --context prod --save prod-2026-10-05.json.gz --redact-hosts
```

- `--save` lưu đúng những gì đã đọc; `.gz` để nén.
- `--redact-hosts` thay tên host, connection, channel bằng mã băm, để gửi ra ngoài được.

Người nhận (hoặc chính bạn tuần sau) chấm lại mà không cần broker:

```sh
ocho doctor --from prod-2026-10-05.json.gz
ocho doctor --from prod-2026-10-05.json.gz --file ocho.yaml --target-version 4.2
ocho doctor --from prod-2026-10-05.json.gz --lang vi     # báo cáo tiếng Việt
```

Gặp `internal error` (exit 5): đính kèm ảnh chụp `--redact-hosts` và dòng `ocho version` vào issue.

## 8. Broker lớn hoặc nhạy cảm tải

Ocho đọc chậm có chủ đích: mặc định 5 request mỗi giây, 2 request song song. Một broker 10.000 queue đọc hết khoảng 8 giây; trên 2.000 queue, `doctor` in ước tính số request và thời gian trước khi đọc.

```sh
ocho doctor --vhost payments --vhost billing   # chỉ vài vhost
ocho doctor --max-rps 2 --concurrency 1        # nhẹ hơn nữa cho broker đang căng
ocho doctor --max-rps 20 --concurrency 4       # nhanh hơn, khi broker rảnh
```

Mọi request là GET; không lệnh nào của Ocho ghi lên broker.

## Chọn nhanh

| Bạn muốn | Lệnh |
| --- | --- |
| Biết broker có mất message không | `ocho doctor` |
| Hiểu một mục trong báo cáo | `ocho explain <mã>` |
| Biết giá trị thật của một queue | `ocho explain queue <tên> --vhost <v>` |
| Khai báo luồng quan trọng | `ocho import`, sửa `ocho.yaml` |
| Tạm chấp nhận một rủi ro | thêm vào `waivers` với `until` |
| Làm đỏ pipeline | `ocho doctor --json --fail-on S2` |
| Chuẩn bị nâng cấp | `ocho doctor --target-version 4.2` |
| Gửi cho người khác xem | `ocho doctor --save x.json.gz --redact-hosts`, rồi `--from` |
| Xem lệnh có cờ gì | `ocho help <lệnh>` |
