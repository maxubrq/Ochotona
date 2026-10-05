# Spec @ochotona/cli v0.1

Oct 4, 2026 · @Max Darius

## Phạm vi và quyết định

`@ochotona/cli` là lớp mỏng: nó phân tích tham số, đọc và ghi đĩa, nói chuyện với terminal, rồi gọi năm gói kia theo đúng thứ tự. Mọi quyết định về dữ liệu (luật nào `fail`, giá trị nào hiệu lực, YAML viết thế nào) đã nằm ở gói khác; CLI chỉ quyết định cách hiện chúng ra.

| Gói này làm | Gói này không làm |
| --- | --- |
| Tham số, biến môi trường, file context, mật khẩu | Gọi HTTP (broker) |
| Đọc, ghi `ocho.yaml`, ảnh chụp, file context | Parse YAML, chuẩn hoá (compiler, model) |
| Hỏi đáp trên terminal cho `import` | Sinh câu hỏi (compiler) |
| Render văn bản, JSON, tiến trình | Dựng finding (rules) |
| Exit code | Chấm luật (rules) |

**Bốn quyết định.**

1. **Lõi là một hàm `run(argv, io)` trả exit code.** `io` gom mọi thứ bên ngoài: `stdout`, `stderr`, `stdin`, `env`, `isTTY`, `columns`, `clock`, `fs`, `exec`, `signal`. File `bin/ocho.ts` chỉ nối `io` thật vào `run`. Nhờ vậy test đầu-cuối chạy trong tiến trình, không spawn, không cần terminal thật.
2. **stdout chỉ chứa kết quả.** Báo cáo văn bản, hoặc đúng một document JSON. Tiến trình, cảnh báo về chính cách dùng CLI (CX5, CX6), nhật ký `--debug` đều đi stderr. `ocho doctor --json | jq` luôn chạy được.
3. **Hỏi mật khẩu bằng ô ẩn khi không có nguồn nào khác.** Ngân sách K1 tới K3 là 3 phút; bắt người lần đầu tạo context rồi cấu hình `password_command` sẽ đốt hết ngân sách đó. `npx @ochotona/cli doctor --url https://… --user ocho-doctor` hỏi mật khẩu một lần là đủ.
4. **Khởi động lười.** `bin` chỉ nạp mã của lệnh đang chạy; `--version` không nạp gì ngoài hằng số phiên bản.

```
packages/cli/
  src/
    bin/ocho.ts            nối io thật
    run.ts                 phân tích tham số, chọn lệnh, bắt lỗi ngoài cùng
    args.ts                ngữ pháp, gợi ý cờ gần đúng
    io.ts                  kiểu IO
    target.ts              context, biến môi trường, mật khẩu
    contexts.ts            đọc, ghi file context, kiểm quyền
    commands/{doctor,import,explain,context,version}.ts
    render/{text,json,progress,errors,layout,color}.ts
    prompt/{terminal,hidden}.ts
    i18n/{en,vi}.json     chữ giao diện riêng của CLI
    exit.ts
```

**Phân phối và ngân sách khởi động.** npm `@ochotona/cli` với lệnh `ocho`; binary đơn Node SEA cho 4 nền tảng như tab v0.1. Ngân sách p95 trên máy CI: `ocho --version` ≤ 100 ms; dòng xác nhận đầu tiên của `doctor` trên stderr ≤ 100 ms; dòng có thông tin broker ≤ 1 giây với broker trong cùng mạng.

## Ngữ pháp dòng lệnh

```
ocho [cờ chung] <lệnh> [tham số] [cờ của lệnh]
```

Cờ đặt trước hay sau tên lệnh đều được. Phân tích bằng `node:util` `parseArgs` chế độ `strict`; cờ lạ → exit 4, kèm gợi ý cờ gần nhất khi khoảng cách Levenshtein ≤ 2 ("unknown flag --vhosts; did you mean --vhost?").

**Cờ chung.**

| Cờ | Biến môi trường | Ý nghĩa |
| --- | --- | --- |
| `--context <tên>` | `OCHO_CONTEXT` | Context trong file context |
| `--url <url>` | `OCHO_URL` | Đích tạm, không cần context; đi kèm `--user` |
| `--user <tên>` | `OCHO_USER` | User cho `--url` |
| `--password-stdin` | — | Đọc mật khẩu từ dòng đầu của stdin |
| — | `OCHO_PASSWORD` | Mật khẩu |
| `--ca <file>` | `OCHO_CA` | CA riêng, PEM |
| `--insecure` | — | Tắt kiểm chứng chỉ (CX5) |
| `--prometheus-url <url>`, `--no-prometheus` | — | Ghi đè phát hiện Prometheus |
| `--max-rps <n>`, `--concurrency <n>` | — | Kiểm soát tải (tab broker) |
| `--lang en\|vi` | `OCHO_LANG` | Ngôn ngữ |
| `--json` | — | Đầu ra JSON |
| `--no-color` | `NO_COLOR` | Tắt màu |
| `--debug` | `OCHO_DEBUG=1` | Nhật ký request ra stderr |
| `--version`, `--help` | — | — |

**Thứ tự ưu tiên** cho mọi giá trị: cờ > biến môi trường > context đang chọn > mặc định. `--url` và `--context` cùng có thì `--url` thắng, kèm một dòng cảnh báo trên stderr.

**Lệnh của v0.1.**

| Lệnh | Cờ riêng |
| --- | --- |
| `doctor` | `--vhost <v>` (lặp được), `--flow <tên>`, `--target-version <x.y>`, `--fail-on S1\|S2\|S3`, `--file <đường dẫn>`, `--no-file`, `--save <file>`, `--redact-hosts`, `--from <file>`, `--why`, `--verbose`, `--experimental` |
| `import` | `--from <definitions.json>`, `--out <đường dẫn>`, `--non-interactive` |
| `explain <đích>` | `--vhost <v>`, `--file <đường dẫn>` |
| `context add <tên>` | `--url`, `--user`, `--ca`, `--password-command '<lệnh>'`, `--prometheus-url`, `--no-prometheus`, `--insecure`, `--no-verify` |
| `context use <tên>`, `context list`, `context show [tên]`, `context remove <tên>` | — |
| `version` | — |
| `help [lệnh]` | — |

`--file` mặc định là `./ocho.yaml` nếu file đó tồn tại; `--no-file` bỏ qua nó hoàn toàn (mọi luồng thành `undeclared`).

**Trợ giúp.** `ocho help <lệnh>` và `ocho <lệnh> --help` in: một dòng mục đích, cú pháp, cờ, ba ví dụ, và với lệnh đọc, dòng cuối cố định "Read-only: this command never writes to the broker." (A5 và CL1 ở tab chính).

## Context, đích kết nối, mật khẩu

`resolveTarget(args, env, io)` dựng `BrokerTarget` cho gói broker. Nó là nơi duy nhất trong CLI chạm tới mật khẩu.

**File context.** `$XDG_CONFIG_HOME/ochotona/contexts.yaml`, mặc định `~/.config/ochotona/contexts.yaml` trên Linux và macOS; `%APPDATA%\ochotona\contexts.yaml` trên Windows. Thư mục tạo với quyền 0700, file 0600. Mỗi lần đọc trên hệ POSIX, quyền rộng hơn 0600 → cảnh báo CX6 trên stderr. File đọc và ghi bằng `compiler.readOchoYaml` với cùng tuỳ chọn an toàn (không anchor, không tag).

```yaml
version: 1
current: prod
contexts:
  prod:
    url: https://b-1234.mq.ap-southeast-1.amazonaws.com
    user: ocho-doctor
    password_command: "op read op://infra/rabbit-prod/password"
    ca: null                      # đường dẫn file PEM
    insecure: false
    prometheus: auto              # auto | off | URL
```

**Mật khẩu, theo thứ tự; nguồn đầu tiên có giá trị thắng.**

1. `--password-stdin`: dòng đầu của stdin, bỏ ký tự xuống dòng cuối.
2. `OCHO_PASSWORD`.
3. `password_command` của context.
4. Ô nhập ẩn, chỉ khi stdin và stderr đều là terminal. Lời nhắc in ra stderr: `Password for ocho-doctor@b-1234.mq…:`.
5. Không có nguồn nào → CX11 (mới), exit 4, gợi ý ba cách.

**Chạy `password_command`.** `execFile('/bin/sh', ['-c', lệnh])`, trên Windows `cmd.exe /d /s /c`. Trần 10 giây; stdin đóng; stdout tối đa 64 KB; lấy dòng đầu, bỏ khoảng trắng hai đầu; dòng rỗng tính là lỗi. Mã thoát khác 0, quá thời gian, hay dòng rỗng → CX7 kèm dòng đầu của stderr của lệnh (không bao giờ kèm stdout, vì stdout có thể là mật khẩu). `--debug` chỉ ghi `password_command: ok (124 ms)`.

**Ô nhập ẩn.** Tắt echo của terminal qua `readline` ở chế độ raw; Ctrl-C trong lúc nhập → exit 130; Enter khi rỗng → hỏi lại một lần rồi CX11. Giả định GC31: cách này chạy đúng trên Windows Terminal và PowerShell.

**CA.** Đọc file PEM thành chuỗi trước khi gọi broker; không đọc được → CX2 kèm đường dẫn.

## Lệnh `doctor`

Trình tự dưới đây là toàn bộ việc của lệnh; mỗi bước ghi gói nào được gọi và lỗi ở bước đó ra exit code nào.

| # | Bước | Gọi | Lỗi |
| --- | --- | --- | --- |
| 1 | Phân tích tham số | `args.ts` | Exit 4 |
| 2 | In dòng xác nhận lên stderr (TTY): `Connecting to prod…` | — | — |
| 3 | Đọc `ocho.yaml` nếu có | `compiler.loadOchoYaml` | Có lỗi YP hoặc Y → in chẩn đoán dạng GNU, exit 4. Cảnh báo YW, Y10 → in, chạy tiếp |
| 4 | Chọn luật, tính đường dẫn cần, lập kế hoạch đọc | `rules.selectRules`, `rules.requiredPaths`, `model.planRead` | — |
| 5 | Dựng đích | `resolveTarget`, `broker.createReader` | CX4, CX10, CX11 → exit 4 |
| 6 | Nhận diện, in ba dòng đầu báo cáo | `reader.identify` | CX1, CX2, CX3, CX8, CX9 → exit 3 |
| 7 | Đọc, có tiến trình | `reader.read` | Ctrl-C → exit 130 |
| 8 | Dựng mô hình | `model.buildActual`, `model.checkInvariants` | Vi phạm bất biến → exit 5 |
| 9 | Gán luồng | `model.buildFlowMap` | — |
| 10 | Chấm luật, chọn ba việc | `rules.runRules`, `rules.planActions` | `internal` không rỗng → báo cáo vẫn in, exit 5 |
| 11 | Lưu ảnh chụp nếu có `--save` | `model.saveSnapshot` | Ghi file lỗi → stderr, không đổi exit code của chẩn đoán |
| 12 | Render | `render/text` hoặc `render/json` | — |
| 13 | Tính exit code | `exit.ts` | — |

**`--from <ảnh chụp>`** thay bước 5 tới 8 bằng `model.loadSnapshot`; SNAP1 tới SNAP3 → exit 4. Dòng đầu báo cáo là `From snapshot taken 2026-10-04 01:22 UTC (context prod)`.

**`--target-version`** làm `selectRules` gồm VT1, VT2; phiên bản đích phải parse được và lớn hơn phiên bản broker, nếu không thì exit 4.

**`--vhost` và `--flow`** truyền vào `planRead` (để chỉ đọc vhost đó) và vào `runRules` (để lọc đối tượng). `--flow` cần `ocho.yaml`; không có file → exit 4.

## Renderer văn bản và tiến trình

Báo cáo văn bản được thiết kế để đọc xong trong 60 giây (tab v0.1, mục báo cáo). Mục này chốt từng chi tiết trình bày để snapshot test có cái để so.

**Bố cục.** Bề rộng = `columns` của stdout nếu là TTY, không thì 80; sàn 60. Văn bản dài được gói theo từ, thụt treo dưới nhãn. Chỉ dùng ký tự ASCII (`[ok]`, `->`, `x5`) để log CI và terminal cũ hiện đúng.

```
Connected to prod in 0.4s · RabbitMQ 3.13.7 · 3 nodes · Mnesia
Sources: HTTP API [ok] · management stats [ok] · Prometheus [unreachable]
214 queues · 37 exchanges · 1 vhost

S1  DATA SAFETY (3)

  T2  exchange scan.request
      Unroutable messages are being dropped
      What happened  1,240 unroutable messages were dropped since
                     2026-09-12 03:10 UTC.
      Is data safe   No. Those messages are gone, and this exchange can
                     drop more.
      Do next        Set an alternate exchange through a policy.
                     ocho explain T2
      Evidence       observed: unroutable counter (cluster)
                     inferred: no alternate-exchange in effective policy
      Why            An exchange stores nothing: with no matching …
```

**Khối theo mức.**

| Mức | Hiện gì |
| --- | --- |
| S1 | Mỗi kết quả một khối, đủ năm nhãn. Cùng (luật, biến thể) có hơn 3 đối tượng thì gộp một khối: `Objects (40): a, b, c and 37 more`, các trường lấy từ đối tượng đầu; `--verbose` tách ra |
| S2, S3 | Như S1 nhưng bỏ `Why`; `--why` hiện lại |
| S4, S5 | Một dòng mỗi luật: `C2 x5 consumers · Prefetch is 1 on a busy queue`; `--verbose` mở ra |
| Chưa kiểm | Gom theo (lý do, cách mở khoá): `Not checked (6): R1 x6 channels · management statistics are disabled · enable the Prometheus plugin or management stats` |
| Điểm mù | Một dòng: `Not visible from the broker: LE2, LE5, LE6, LE10 (client) · LE14, LE17 (lint) · LE8, LE19 (no tool) · ocho explain LE2` |
| Ba việc làm trước | Đánh số, từ `rules.toActionText`; dòng cuối mỗi việc là `ocho explain <mã>` |
| Tổng kết | `38 rules · 9 fail · 21 pass · 4 not checked · 4 n/a · 2 waived · exit 1` |

Nhãn trường ở tiếng Việt: `Chuyện gì`, `Dữ liệu an toàn?`, `Làm gì tiếp`, `Bằng chứng`, `Vì sao`. Chiều rộng cột nhãn tính theo nhãn dài nhất của ngôn ngữ đang dùng.

**Màu.** Chỉ bật khi stdout là TTY, không có `NO_COLOR`, không có `--no-color`, và `TERM` khác `dumb`. S1 đỏ đậm, S2 tím, S3 vàng, S4 và S5 mờ, mã luật đậm, `[ok]` xanh. Mọi thông tin vẫn có bằng chữ khi tắt màu (U6).

**Tiến trình.** Chỉ khi stderr là TTY và không có `--json`. Một dòng tự cập nhật trên stderr, xoá trước khi báo cáo được in: `Reading queues 12/20 pages · 5 req/s · ~14s left`. Sự kiện `throttle`, `retry` đổi phần cuối dòng (`slowed to 2 req/s`). Không phải TTY thì không in tiến trình; `--debug` thay bằng nhật ký từng request.

**Ước tính.** Broker có hơn 2.000 queue thì trước pha kiểm kê in lên stderr: `Reading 12,400 queues: about 84 requests, ~20s. Ctrl-C stops safely; nothing is written.`

## Đầu ra JSON và exit code

**`--json`.** stdout chứa đúng một document, kết thúc bằng một ký tự xuống dòng, không màu, không tiến trình.

- `doctor`: một object `ocho.report/1`. `findings` gồm **mọi** kết quả (cả `pass`, `not_applicable`), dựng bằng `rules.toFinding`; `actions` từ `planActions`; `internal` chứa các `InternalIssue` khi có (trường mới, tuỳ chọn).
- `explain`, `context list`, `context show`, `version`: các schema nhỏ `ocho.explain/1`, `ocho.contexts/1`, `ocho.version/1`.
- Lỗi làm lệnh dừng trước khi có kết quả (CX, YP, Y, SNAP, IM): một object `ocho.error/1` `{ schema, code, message, data, next, exitCode, diagnostics? }` trên stdout, để công cụ gọi Ocho luôn parse được stdout dù thành công hay thất bại.

Bốn schema mới (`explain`, `contexts`, `version`, `error`) cần thêm vào gói spec.

**Exit code của `doctor`, thuật toán đầy đủ.**

1. Ctrl-C → 130.
2. `internal` không rỗng, hoặc vi phạm bất biến → 5.
3. Lỗi cách dùng: cờ sai, CX4, CX10, CX11, lỗi `ocho.yaml`, SNAP → 4.
4. Nhận diện thất bại: CX1, CX2, CX3, CX8, CX9 → 3.
5. `ngưỡng` = `--fail-on`, mặc định S1. Có kết quả `fail` không miễn trừ, không experimental, mức nghiêm trọng bằng hoặc cao hơn `ngưỡng` → 1.
6. Có kết quả `not_checked` của luật mà `meta.severities` chứa một mức bằng hoặc cao hơn `ngưỡng` → 2.
7. Còn lại → 0.

Bước 6 đọc `meta.severities`, không đọc mức của kết quả, vì kết quả `not_checked` không có mức: T1 có thể ra S1, nên T1 chưa kiểm được thì không được coi là "sạch" dưới `--fail-on S1`.

**Exit code của các lệnh khác.**

| Lệnh | 0 | 3 | 4 | 5 | 130 |
| --- | --- | --- | --- | --- | --- |
| `import` | Đã ghi, hoặc không có gì thay đổi | Không đọc được broker, hoặc topology `unknown` | Cờ sai, file cũ có lỗi (IM2), file đổi trong lúc hỏi, stdin đóng giữa phiên | IM1, lỗi nội bộ | Ctrl-C, không ghi gì |
| `explain` | In được | Không đọc được broker | Đích không tồn tại hoặc mơ hồ | Lỗi nội bộ | Ctrl-C |
| `context add` | Đã lưu (và nối thử thành công, trừ khi `--no-verify`) | Nối thử thất bại; context vẫn **không** được lưu | Tên trùng, cờ thiếu | Lỗi nội bộ | Ctrl-C |

## Lệnh `import`

| # | Bước | Gọi | Lỗi |
| --- | --- | --- | --- |
| 1 | Phân tích tham số; `--out` mặc định `./ocho.yaml` | `args.ts` | Exit 4 |
| 2 | Đọc file cũ nếu có, băm nội dung | `compiler.loadOchoYaml` | Có lỗi → IM2, in chẩn đoán, exit 4 |
| 3 | Lấy topology: từ broker (kế hoạch đọc cho đường dẫn topology và tốc độ), hoặc từ `--from definitions.json` | `broker`, `model.buildActual`, `model.topologyFromActual`; hoặc `model.topologyFromDefinitions` | Topology `unknown` → in bộ sưu tập nào và vì sao, exit 3 |
| 4 | Tạo phiên | `compiler.createImportSession` | — |
| 5 | Hỏi, hoặc `answerDefaults` khi không tương tác | `prompt/terminal.ts` | Xem dưới |
| 6 | Lấy kết quả | `session.result()` | IM1 → in bước hỏng và khác biệt, không ghi, exit 5 |
| 7 | In tổng kết và thay đổi | `render/text` | — |
| 8 | Ghi file nguyên tử | `fs` | Xem dưới |

**Khi nào không tương tác.** Có `--non-interactive`, hoặc stdin không phải TTY, hoặc có `--json`. Trường hợp thứ hai và thứ ba in một dòng lên stderr nói rõ đã chuyển sang không tương tác.

**Giao diện câu hỏi.** Mỗi câu một khối như ví dụ ở tab v0.1; giá trị mặc định trong ngoặc vuông; nhận một chữ cái rồi Enter; `?` in giải thích một đoạn về lựa chọn đó. Trả lời sai thì hỏi lại kèm danh sách lựa chọn, không giới hạn số lần. Dòng đầu của mỗi câu ghi tiến độ (`Flow 7/41`). Câu `rename` hỏi tiếp tên tham số và kiểm theo mẫu của compiler ngay tại chỗ.

**Ngắt giữa chừng.** Ctrl-C → không ghi gì, exit 130, in `Nothing was written.`. stdin đóng (EOF) giữa phiên → không ghi, exit 4, gợi ý `--non-interactive`. Không có "lưu một phần": file nửa vời sẽ khiến lần import sau tưởng các luồng chưa hỏi đã được quyết là `undeclared` có chủ đích.

**Ghi nguyên tử.** Ghi vào `<out>.tmp-<pid>` cùng thư mục, `fsync`, băm lại file cũ; băm khác lúc đọc (người dùng sửa file trong lúc trả lời) → xoá file tạm, exit 4, `ocho.yaml changed while import was running; run again`. Băm khớp → `rename` đè lên. Quyền của file mới bằng quyền file cũ, hoặc 0644 nếu tạo mới.

**Dòng cuối.** `Wrote ocho.yaml: 41 flows (12 strict, 3 loose, 26 undeclared), 2 families, 9 unmanaged objects. Next: ocho doctor`.

## Lệnh `explain` và `context`

**Phân giải đích của `explain`**, theo thứ tự, dừng ở dạng đầu tiên khớp:

| Dạng | Ví dụ | Cần broker |
| --- | --- | --- |
| Mã luật có trong `codes.json` | `ocho explain T2` | không |
| Mã điểm mù | `ocho explain LE5` | không |
| Mã chẩn đoán | `ocho explain CX9`, `ocho explain Y4` | không |
| `<loại> <tên>` với loại là `queue`, `exchange`, `flow` | `ocho explain queue orders` | có (`flow` cần thêm `ocho.yaml`) |
| Tên trơn | `ocho explain orders` | có: tìm queue rồi exchange cùng tên trong vhost được chọn; khớp cả hai → exit 4, in hai cách viết rõ |

**Đích là đối tượng.** Kế hoạch đọc chỉ gồm đối tượng đó, các policy, operator policy của vhost, và binding liên quan, nên `explain` trên broker 10.000 queue vẫn trả trong ≤ 2 giây (K5). Đầu ra như ví dụ ở tab v0.1, cộng hai dòng cuối: kết quả các luật áp cho đối tượng đó, và `Broker agrees` hoặc `Broker disagrees (model_mismatch)` từ `effectiveCheck`.

**Đích là mã.** In từ dữ liệu của gói spec: tiêu đề, mức có thể có, vị từ `fail` (văn bản `rule.<MÃ>.predicate`, khoá mới), cơ chế, cách sửa, liên kết spec và lesson, và hai ví dụ lấy từ fixture `fail` và `near` của luật (gói rules xuất bản rút gọn của fixture cho mục đích này).

**`context add`.** Kiểm tên theo `^[a-z0-9][a-z0-9._-]*$`; trùng tên → exit 4. Mặc định nối thử bằng đúng `identify` của broker trước khi lưu; thất bại thì không lưu, exit 3, in chẩn đoán CX. Nối thử thành công thì in một dòng `prod: RabbitMQ 3.13.7 · 3 nodes · user tags monitoring`, và cảnh báo OC1 nếu user có tag `administrator`. Context đầu tiên được thêm tự thành `current`.

**`context show`** in mọi trường trừ bí mật: `password_command` hiện là `set` hoặc `not set`. **`context list`** đánh dấu context hiện tại bằng `*`. **`context remove`** hỏi xác nhận khi stdin là TTY; không phải TTY thì cần `--yes`.

## Lỗi, ngôn ngữ, `--debug`

**Lỗi dừng lệnh** in ra stderr ở chế độ văn bản, luôn đủ ba điều của D5:

```
error CX3: the broker rejected the credentials (HTTP 401)
  Data   nothing was read or changed
  Next   check the user and password of context "prod", or create a monitoring user:
         rabbitmqadmin users declare --name ocho-doctor --password-stdin --tags monitoring
```

Dòng `Data` lấy từ một trong ba câu chung của CLI theo loại lỗi: lỗi trước khi đọc ("nothing was read or changed"), lỗi khi đang đọc ("nothing was changed; the read was incomplete"), lỗi khi ghi file ("the broker was not touched; \<file> is unchanged"). Không lỗi nào của Ocho có câu thứ tư, vì không lệnh nào của v0.1 ghi lên broker.

**Lỗi nội bộ (exit 5):** `internal error: <chi tiết>. This is a bug in Ocho. Please open an issue and attach: ocho doctor --save snapshot.json --redact-hosts`, kèm phiên bản Ocho, Node, hệ điều hành.

**Ngôn ngữ.** Thứ tự: `--lang`, `OCHO_LANG`, `LC_ALL`, `LC_MESSAGES`, `LANG`; giá trị bắt đầu bằng `vi` → tiếng Việt, còn lại tiếng Anh. Số qua `Intl.NumberFormat` của ngôn ngữ (`1,240` và `1.240`). Thời điểm in một dạng cho cả hai ngôn ngữ, không mơ hồ: `2026-09-12 03:10 UTC`. Chữ giao diện riêng của CLI nằm ở `src/i18n/` và qua cùng bộ kiểm đủ bản dịch với gói spec.

**`--debug`.** Ghi lên stderr, mỗi dòng có tiền tố `[debug +123ms]`: thời gian từng bước của lệnh, mỗi request (theo định dạng của tab broker), thay đổi tốc độ, nguồn mật khẩu đã dùng (chỉ tên nguồn, ví dụ `password: OCHO_PASSWORD`), file đã đọc và ghi, số luật được chọn, chi tiết `InternalIssue` kèm stack. Không bao giờ có giá trị bí mật nào.

## Test bắt buộc và định nghĩa hoàn thành

Mọi test đầu-cuối gọi `run(argv, io)` trong tiến trình, với broker là `mock-mgmt` của gói broker phát lại bản ghi thô thật.

| Nhóm | Test | Nghiệm thu |
| --- | --- | --- |
| Báo cáo vàng | Ba broker đại diện (Amazon MQ 3.13, 4.2 có nhiều lỗi, 4.3 sạch) × tiếng Anh, tiếng Việt × 80, 120 cột × màu bật, tắt | Khớp snapshot |
| JSON | Mọi đầu ra `--json` của mọi test, kể cả đường lỗi | stdout parse được và qua đúng schema |
| stdout sạch | Mọi test với `--json` | stdout chỉ có một document; mọi thứ khác ở stderr |
| Exit code | Một ca cho mỗi bước của thuật toán và mỗi ô của bảng exit code các lệnh khác | Đúng mã |
| Tham số | Mọi cờ; cờ lạ có gợi ý; bảng thứ tự ưu tiên cờ, biến môi trường, context | Đúng giá trị thắng |
| Mật khẩu | Từng nguồn; `password_command` quá giờ, mã thoát khác 0, dòng rỗng, nhiều dòng; ô ẩn với TTY giả; CX11 | Đúng nguồn, đúng chẩn đoán |
| File context | Tạo với 0600, 0700; quyền rộng → CX6; đường dẫn Windows | Đúng |
| Import | Kịch bản trả lời qua stdin; Ctrl-C ở từng câu; EOF; file đổi giữa phiên; giả lập sập giữa ghi file tạm và rename; stdin không phải TTY | Đúng file ra hoặc file cũ nguyên vẹn, đúng exit code |
| Explain | Mọi dạng đích; tên mơ hồ; số request với đích là đối tượng | Đúng; ≤ 6 request |
| CL1 | Proxy ghi request cho `doctor`, `import`, `explain`, `context add` | Chỉ GET |
| Bí mật | Hook toàn cục quét stdout, stderr, file đã ghi của mọi test | Không có mật khẩu, không có base64 của `user:pass` |
| Ngân sách | Binary SEA trên máy CI; broker 10.000 queue | `--version` ≤ 100 ms p95; dòng xác nhận ≤ 100 ms; `doctor` ≤ 3 phút ở 5 request mỗi giây; `explain` ≤ 2 giây |

**Cổng phát hành có người.** Không tự động hoá được, nhưng là điều kiện phát hành `0.1.0-alpha`:

- [ ] 5 SRE chưa biết Ocho, trung vị K1 tới phát hiện S1 đúng đầu tiên ≤ 3 phút.
- [ ] Bài thử 5 giây của README trên ít nhất 5 người.
- [ ] Nhật ký chạy tay trên Amazon MQ 3.13 đính kèm bản phát hành.

**Định nghĩa hoàn thành.**

- [ ] Mọi test ở bảng trên xanh trên Node 20, 22 và trên binary SEA của 4 nền tảng.
- [ ] Chữ giao diện đủ hai thứ tiếng.
- [ ] `ocho help` và `--help` của từng lệnh khớp ngữ pháp ở mục trên.
- [ ] Phụ thuộc lúc chạy: năm gói Ocho, `yaml`, `undici`.

## Thay đổi và giả định

| # | Thay đổi | Chỗ cần sửa |
| --- | --- | --- |
| 1 | Ô nhập mật khẩu ẩn; mã mới CX11 (không có nguồn mật khẩu) | Tab chính, mục kết nối; tab spec, `codes.json` |
| 2 | Cờ mới: `--url`, `--user`, `--file`, `--no-file`, `--experimental`, `--why`, `--verbose`, `--no-prometheus`, `--yes` | Tab chính, mục bề mặt lệnh |
| 3 | Schema mới `ocho.error/1`, `ocho.explain/1`, `ocho.contexts/1`, `ocho.version/1`; `ocho.report/1` thêm `internal` tuỳ chọn | Tab spec, mục JSON Schema |
| 4 | `explain` nhận mã điểm mù và mã chẩn đoán; khoá văn bản mới `rule.<MÃ>.predicate`; gói rules xuất bản rút gọn của fixture | Tab spec, tab rules |
| 5 | Model có thêm `topologyFromDefinitions` và phạm vi một đối tượng cho `planRead` | Tab model, API |
| 6 | Báo cáo gộp S1 khi cùng (luật, biến thể) có hơn 3 đối tượng | Tab v0.1, mục báo cáo |
| 7 | `context add` nối thử trước khi lưu; thất bại thì không lưu | Tab chính, mục `ocho context` |
| 8 | `import` không lưu một phần; bảng exit code riêng | Tab v0.1, mục import |

| Mã | Giả định | Kiểm ở |
| --- | --- | --- |
| GC30 | esbuild gói một file cho Node SEA mà khởi tạo lười vẫn giữ `--version` ≤ 100 ms | Ngân sách khởi động trong CI |
| GC31 | Ô nhập ẩn qua `readline` chế độ raw chạy đúng trên Windows Terminal và PowerShell | Chạy tay trên Windows |
| GC32 | `rename` đè file có sẵn là nguyên tử trên Windows (Node gọi `MoveFileEx` với cờ thay thế) | Test giả lập sập trên runner Windows |
