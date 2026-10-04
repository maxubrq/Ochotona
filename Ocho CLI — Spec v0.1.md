# Ocho CLI — Spec v0.1

Oct 4, 2026 · @Max Darius

## Kết luận

Ocho CLI v0.1 là công cụ chỉ đọc gồm ba lệnh: `ocho doctor`, `ocho import`, `ocho explain`. Nó chạy trên mọi broker 3.13 đến 4.3, kể cả Amazon MQ, không cần sửa dòng code nào của ứng dụng, và trả lời trong vài phút câu hỏi trung tâm của spec: broker này đang mất message im lặng ở đâu.

Năm quyết định của bản này:

1. **Doctor đi trước, chỉ đọc đi trước.** CLI một mình không đưa được luồng nào lên A1, vì confirm, ack sau commit và chặn trùng nằm trong client. Nhưng 11 trên 20 lỗi trong danh mục lỗi (lesson, mục 9) lộ ra từ trạng thái broker, trong đó có 5 trên 10 lỗi-làm-hỏng. Đó là giá trị CLI giao được ngay, trên hệ thống đang chạy.
2. **Không làm lại rabbitmqadmin v2.** Ocho không có lệnh khai báo hay xoá từng queue. Phần thao tác đối tượng và nâng cấp xanh-lam đã có công cụ chính thức tốt; Ocho làm phần ngữ nghĩa: luồng, dung sai, custody, luật.
3. **Không bao giờ xanh im lặng.** Luật nào CLI không đọc được dữ liệu thì báo "chưa kiểm" kèm lý do, không bao giờ báo "đạt". Đây là I1 áp vào chính CLI.
4. **Import tách đôi.** Phần hiểu được thành `flows` và `families`; phần chưa hiểu giữ nguyên từng byte trong khối `unmanaged`. Nhờ vậy `plan` ngay sau `import` cho 0 thay đổi (U3), và đội chuyển sang Ocho theo từng luồng thay vì cả broker một lúc.
5. **Khai dung sai là ma sát cấu thành.** CLI không tự đoán luồng nào `strict`, luồng nào `loose`. Nó hỏi một lần cho mỗi luồng, ghi vào `ocho.yaml`, và mọi phát hiện sau đó dựa trên câu trả lời đó.

Thước đo dẫn của v0.1: từ lúc cài tới phát hiện thật đầu tiên trên một broker đang chạy ≤ 3 phút. Chỉ số bảo vệ đi kèm: ≥ 95% phát hiện mức S1 được người dùng xác nhận là đúng.

## Vị trí của CLI

Ý định một câu, không có chữ "và": **thấy mọi chỗ broker đang làm rơi message trước khi khách hàng thấy.** README mở bằng câu này, và bài thử 5 giây (việc 6 của bản đánh giá) chấm trên câu này.

| Người dùng | Việc họ mang tới CLI | Lệnh | Bản |
| --- | --- | --- | --- |
| SRE, DevOps vào hệ thống có sẵn | Broker đang hở ở đâu, policy nào đang thắng | `doctor`, `explain`, `import` | v0.1 |
| Dev viết luồng mới | Dựng luồng đúng mẫu, chặn lỗi ở CI | `init --pattern`, `lint`, `patterns` | v0.2 |
| Tech lead | Có nên dùng broker không, dùng mẫu nào | `decide` | v0.2 |
| DevOps đưa thay đổi lên | Biết trước thay đổi nào nóng, nào phải migrate | `plan`, `apply`, `eject`, `members` | v0.3 |
| AI agent viết code messaging | Một con mắt máy đọc được ở vùng dung sai chặt | mọi lệnh với `--json` | v0.1 trở đi |

Ranh giới với công cụ sẵn có. Ocho không cạnh tranh ở phần mà công cụ chính thức đã làm tốt; nó dùng chúng làm đích hoặc chỉ sang chúng.

| Công cụ | Làm tốt | Ocho làm gì với nó |
| --- | --- | --- |
| [rabbitmqadmin v2](https://lib.rs/crates/rabbitmqadmin) | Thao tác từng đối tượng qua HTTP API; hỗ trợ mạnh việc chuyển 3.13 sang 4.x | Không lặp lại. Khi sửa tay là cách nhanh nhất, phát hiện của `doctor` in sẵn lệnh rabbitmqadmin tương ứng |
| rabbitmqctl, rabbitmq-diagnostics | Chẩn đoán từ bên trong node | Không phụ thuộc. Cần quyền shell trên node, nên không chạy được trên broker managed |
| Definitions JSON, Terraform, Messaging Topology Operator | Áp trạng thái khai báo | Là đích xuất của `plan` và `apply` (P5), không phải đối thủ |
| `@ochotona/client` | Confirm, ack sau commit, chặn trùng | Dùng chung compiler và danh mục luật với CLI |
| `ocho-desk` | Sổ custody, replay, đối soát liên tục | CLI không giữ trạng thái chạy. Việc cần chạy liên tục thuộc bàn đỡ |

Hệ quả cho thiết kế: CLI chỉ nói chuyện với broker qua HTTP API và endpoint Prometheus. Đó là hai cửa có ở broker tự vận hành lẫn broker managed.

## Bản đồ tầng SFIM

Giá trị của CLI v0.1 nằm ở T1 và T2; T5 là cược có chủ đích; T4 chưa được cấp ngân sách vì QT-1. Phân bổ thời gian của v0.1: 70% cho T0 đến T2, 20% cho T3, 10% cho T5.

| Tầng | Thành phần trong CLI | Điều kiện loại trừ đã kiểm | Test trong 90 ngày | Mặt âm và cách chặn |
| --- | --- | --- | --- | --- |
| T0 | Apache-2.0, file NOTICE, quét license phụ thuộc ở CI; tên "Ochotona for RabbitMQ", không dùng logo RabbitMQ | Có văn bản bắt buộc (license, nhãn hiệu), không phải kỳ vọng thị trường | Kiểm từng điều khoản trước mỗi bản phát hành | T0⁻: ghi "for RabbitMQ" nhưng giao diện trông như sản phẩm chính thức. Chặn: README nói rõ dự án độc lập ở dòng đầu |
| T1 | Cài một lệnh; chạy được trên broker managed; TLS và CA riêng; `--json`; exit code cho CI; lệnh đọc không bao giờ ghi; không in bí mật | Ngưỡng do thị trường đặt: rabbitmqadmin v2 đã có gần hết những thứ này | Gắn nhãn 50 issue mới nhất của rabbitmqadmin-ng theo loại khiếu nại; mỗi loại xuất hiện ≥ 3 lần là một dòng T1 | T1⁻ không áp dụng: không có bản trả phí |
| T2 | Độ phủ luật mức S1 phát hiện được từ bên ngoài, trên mỗi phiên bản broker | Người dùng nói được mức họ muốn ("bắt thêm lỗi X"); có so sánh trực tiếp với `rabbitmq-diagnostics` | So sánh cặp mù: 5 SRE xem hai báo cáo doctor của cùng một broker, chênh nhau 1, 2, 3 luật S1; tìm mức chênh mà 4/5 nhận ra | T2⁻: thêm luật S4, S5 để số luật tăng. Chặn: release note chỉ đếm luật S1, S2 |
| T3 | Doctor nói một con số người dùng không biết: "exchange `orders` đã làm rơi 1.240 message không định tuyến được kể từ lần khởi động node" | Nội dung chia sẻ nói về broker, không về người dùng, nên là T3 chứ không phải T4 | Đếm lượt nhắc không được mời (issue, bài viết, ảnh chụp terminal) ở tuần 1, 12, 26 | T3⁻: phóng đại mức nghiêm trọng để gây sốc. Chặn: mỗi con số kèm nguồn và mốc thời gian đếm (A13) |
| T4 | Không làm ở v0.1 | Miền vận hành độ tin cậy có tính bản sắc với SRE, nên T4 khả thi về sau | Không chạy | Thiết kế trước để tránh: không làm huy hiệu "Ocho certified" nhị phân; nếu có, là thẻ vector theo luồng, dựng từ dữ liệu của chính họ |
| T5 | Mỗi phát hiện giải thích cơ chế và dẫn tới mục spec; `eject` | Viết được thành một câu (dưới bảng) | Test gỡ sản phẩm sau `eject` (dưới bảng) | T5⁻: CLI sinh topology đúng, đội không còn hiểu vì sao đúng. Chặn: không có chế độ tự sửa im lặng; mọi bản sửa hiện ra cùng lý do |
| T6 | Không có ngân sách | Đối thủ sao chép được một luật trong một chu kỳ, nên luật đơn lẻ không phải T6 | Điền phiếu tiền đăng ký trước bản 1.0 | T6⁻: nếu "điểm doctor" thành chỉ số cả ngành, đội sẽ tối ưu điểm thay vì tối ưu custody. Chặn: không xuất điểm tổng, chỉ xuất danh sách phát hiện |

**Schema mục tiêu của T5.** Hiện tại dev nghĩ "hàm publish trả về là message đã an toàn". Sau Ocho họ hỏi "ý định này đang ở vùng custody nào, nếu rơi thì ai biết".

**Kiểm toán thoái kỹ năng.** Năng lực có thể teo: hiểu vì sao queue cần alternate exchange, vì sao dead-letter phải at-least-once. Cách nâng cấp thay vì thay thế: CLI làm phần cơ học (đọc broker, sinh policy) nhưng không bao giờ giấu lý do; mỗi phát hiện có trường `mechanism` một câu và đường dẫn tới mục lesson tương ứng.

**Tiền đăng ký test gỡ sản phẩm.** 90 ngày sau khi một đội design partner chạy `eject`, ≥ 70% queue mới mà đội tạo ra vẫn có alternate exchange, kiểu quorum cho luồng không được mất, và dead-letter at-least-once. Đo bằng `rabbitmqadmin` xuất definitions và một script độc lập, không bằng chính Ocho.

## Hành trình của CLI

CLI có chín khoảnh khắc; v0.1 phủ năm khoảnh khắc đầu. Khoảnh khắc đặc trưng của CLI là K3 (đỉnh, mới), ① `decide` (đỉnh) và ⑩ `eject` (kết), khớp với bốn khoảnh khắc đặc trưng của bản đánh giá.

| # | Khoảnh khắc | Người | Đường hỏng phải thiết kế | Thiết kế trong CLI | Ngân sách | Bản |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | Cài đặt | Dev, SRE | Máy không có Node; mạng công ty chặn npm | `npx @ochotona/cli`, và binary đơn cho Linux, macOS, Windows | ≤ 60 giây | v0.1 |
| K2 | Nối broker lần đầu | SRE | Sai URL, CA riêng, user thiếu quyền, management plugin tắt | Mỗi lỗi nói ba điều (D5) và in sẵn lệnh tạo user `monitoring` | Phản hồi đầu ≤ 1 giây | v0.1 |
| K3 | Doctor lần đầu | SRE, DevOps | Broker 10.000 queue; thống kê management đã tắt; Amazon MQ không có Prometheus | Báo trước số đối tượng và thời gian ước tính; luật thiếu dữ liệu báo "chưa kiểm"; Ctrl-C an toàn | Phát hiện thật đầu tiên ≤ 3 phút tính từ K1 | v0.1 |
| K4 | Import, khai dung sai | SRE, tech lead | Tên queue không theo quy ước; đoán sai họ topology | Đề xuất họ topology kèm bằng chứng; hỏi strict hay loose theo từng luồng; phần chưa hiểu vào `unmanaged` | ≤ 10 phút cho broker 200 queue | v0.1 |
| K5 | Explain một queue | SRE trực | Hai policy cùng khớp; operator policy đè giá trị | In từng key: giá trị hiệu lực, policy thắng, policy thua, vì sao | ≤ 2 giây | v0.1 |
| K6 | Lint trong CI | Dev, AI agent | Lỗi phát hiện lúc chạy thay vì lúc review | `ocho lint` không cần broker; mã luật ổn định | ≤ 5 giây cho 100 luồng | v0.2 |
| ① | Quyết định có dùng broker | Tech lead | Chọn broker theo thói quen | `decide` chạy cây quyết định, dám trả về "đừng dùng broker" | ≤ 10 câu hỏi | v0.2 |
| ④ ⑧ | Đưa thay đổi lên | DevOps | Policy đè nhau; thay đổi tưởng nóng nhưng phải migrate | `plan` gắn nhãn `hot`, `migrate`, `restart`, `redeploy`; `apply` sinh kế hoạch hoàn tác | Kế hoạch đọc được trong ≤ 2 phút | v0.3 |
| ⑩ | Rời Ocho | Mọi người | Bị khoá | `eject` xuất definitions thuần và danh sách việc gỡ khỏi ứng dụng | ≤ 1 lệnh | v0.3 |

Ba tiêu chí của Tiêu chuẩn A có hệ quả riêng cho CLI:

- **A15 áp lên cả broker.** HTTP API của management chậm và tốn tài nguyên trên broker lớn. Doctor không được biến một lần chẩn đoán thành tải cho ops: đọc theo trang, chỉ lấy cột cần, giới hạn mặc định 5 request mỗi giây.
- **A5 cho lệnh đọc.** Doctor, import, explain không bao giờ ghi lên broker, kể cả khi user có quyền ghi. Câu này in trong `--help` của từng lệnh.
- **Quy tắc đỉnh và kết cho K3.** Báo cáo doctor kết thúc bằng đúng ba việc nên làm trước, xếp theo trình tự sửa 12.2, không phải danh sách 40 dòng.

## Bất biến của CLI

Mười luật dưới đây áp cho mọi lệnh, mọi bản. Mã `CL` để bộ test và review tham chiếu; khi một tính năng mâu thuẫn với bất biến, tính năng phải sửa.

1. **CL1. Lệnh đọc không ghi.** `doctor`, `import`, `explain`, `lint`, `decide`, `patterns` không gửi request nào ngoài GET tới broker. Cưỡng chế bằng kiểu: lệnh đọc chỉ nhận interface `BrokerReader`, không có phương thức ghi. Kiểm bằng proxy ghi lại mọi request trong test; một request không phải GET là test hỏng.
2. **CL2. Không xanh im lặng.** Mỗi luật trả về đúng một trong bốn kết quả: `fail`, `pass`, `not_checked` kèm lý do, `not_applicable`. Dòng tổng kết luôn in số luật `not_checked`, và exit code phân biệt "sạch" với "sạch trong phần đã kiểm".
3. **CL3. Mỗi phát hiện nói đủ.** Mã luật, ba điều theo D5 (chuyện gì, dữ liệu có an toàn không, làm gì tiếp), cơ chế một câu, nguồn dữ liệu, mốc thời gian của số liệu, mục spec (U5, A13).
4. **CL4. Thấy khác với đoán.** Bằng chứng có hai loại: `observed` (đọc thẳng từ broker) và `inferred` (suy từ tên, mẫu, thống kê). Một phát hiện S1 chỉ được dựa trên `observed`, hoặc trên `inferred` khi luồng đã được khai `strict`.
5. **CL5. Không tự sửa im lặng.** Lệnh đọc chỉ in cách sửa. Mọi thay đổi lên broker đi qua `plan` rồi `apply`, có dry-run và kế hoạch hoàn tác.
6. **CL6. Không thành tải cho broker.** Đọc theo trang, chỉ lấy cột cần, mặc định 5 request mỗi giây, tự giảm tốc khi broker trả chậm hơn 2 giây.
7. **CL7. Không gọi ra ngoài.** Không telemetry, không kiểm tra phiên bản mới qua mạng, không tải luật từ internet lúc chạy (U8). Danh mục luật đi kèm bản cài.
8. **CL8. Một nguồn luật.** Mã, văn bản, mức nghiêm trọng và mục spec của mọi luật nằm trong gói `@ochotona/spec`, dùng chung cho CLI, client và bàn đỡ (A9). CLI không viết cứng câu chữ nào của luật.
9. **CL9. Quyết định của người dùng nằm ở một chỗ.** Mọi thứ người dùng quyết (dung sai, họ topology, luật được miễn kèm lý do) nằm trong `ocho.yaml` có trong git. Thư mục cấu hình của CLI chỉ giữ ngữ cảnh kết nối, không giữ quyết định (B2).
10. **CL10. JSON là hợp đồng.** Mọi lệnh có `--json` với trường `schema` có phiên bản; đổi nghĩa một trường là thay đổi major. Văn bản trên terminal được phép đổi giữa các bản.

## Kiến trúc

CLI là lớp mỏng trên bốn gói dùng chung; client và bàn đỡ về sau dùng lại đúng các gói này. Sơ đồ đi kèm ở cuối mục.

| Gói | Trách nhiệm | Không làm |
| --- | --- | --- |
| `@ochotona/spec` | Danh mục luật (mã, mức, văn bản ba điều, mục spec), bảng năng lực theo phiên bản, schema JSON của `ocho.yaml` | Không gọi mạng, không có logic chạy |
| `@ochotona/model` | Hai mô hình cùng hình dạng: `Desired` (từ `ocho.yaml`) và `Actual` (từ broker); hàm `diff` | Không biết broker là gì |
| `@ochotona/compiler` | `ocho.yaml` → `Desired` → definitions, policy, user; chọn chiến lược theo `broker.min_version` (mục 9 của spec) | Không đọc broker |
| `@ochotona/broker` | Đọc broker qua ba nguồn, dựng `Actual`, ghi mỗi trường kèm nguồn và thời điểm | Lệnh đọc chỉ thấy `BrokerReader` (CL1) |
| `@ochotona/cli` | Phân tích tham số, gọi các gói trên, in văn bản hoặc JSON | Không có luật nào viết cứng (CL8) |

**Ba nguồn dữ liệu, có thứ tự.** Thống kê của management plugin đã nằm trong [danh sách tính năng bị deprecate](https://www.rabbitmq.com/release-information/deprecated-features-list), khuyến nghị chuyển sang plugin Prometheus. Vì vậy doctor không được dựa vào một nguồn duy nhất.

| Nguồn | Luôn có | Cho biết | Khi vắng |
| --- | --- | --- | --- |
| HTTP API: định nghĩa và danh sách đối tượng | Có, kể cả Amazon MQ | Queue, exchange, binding, policy, user, quyền, connection, channel, consumer | CLI dừng ở K2, nói ba điều |
| HTTP API: thống kê management | Không: có thể bị tắt | Tốc độ publish, redeliver, cờ confirm của channel, số unroutable bị bỏ | Luật phụ thuộc chuyển sang `not_checked` |
| Prometheus, cổng 15692 | Không: broker managed thường không mở | Bộ đếm toàn cục, chi tiết theo queue | Như trên |

**Mô hình `Actual`.** Mỗi trường là một bộ ba `{value, source, observedAt}`. Luật đọc bộ ba chứ không đọc giá trị trần, nên một luật biết nó đang dựa trên gì và báo `not_checked` khi thiếu. Đây là chỗ CL2 và CL4 được cưỡng chế bằng kiểu, không bằng kỷ luật.

**Luật là hàm thuần.** `(Actual, Desired | null, Capabilities) → Finding[]`. Không I/O, không đồng hồ. Nhờ vậy cả bộ luật chạy được trên ảnh chụp broker lưu thành file, và test luật không cần Docker.

**Ảnh chụp broker.** `ocho doctor --save snap.json` lưu `Actual` đã che bí mật; `ocho doctor --from snap.json` chạy lại không cần mạng. Dùng cho ba việc: gửi kèm issue, chạy luật mới trên broker cũ, và bộ test hồi quy.

**Ngôn ngữ và phân phối.** TypeScript trên Node 20+, cùng ngôn ngữ với client để dùng chung compiler. Phát hành qua npm và binary đơn đóng bằng Node SEA, để ops không phải cài Node (A15). Khởi động lười: chỉ nạp gói của lệnh đang chạy, giữ phản hồi đầu dưới 1 giây (U7).

&#91;embedded content: kiến trúc CLI · 3 bề mặt, 4 gói, 3 nguồn dữ liệu\]

Nét đứt là thứ có thể vắng: client và bàn đỡ chưa có ở v0.1, thống kê và Prometheus có thể không đọc được. Chỉ HTTP API danh sách là nền bắt buộc.

## Bề mặt lệnh

v0.1 có ba lệnh nghiệp vụ và một lệnh kết nối. `ocho context` chưa có trong U2 của spec; đề xuất bổ sung ở mục giả định.

### `ocho doctor`

```
ocho doctor [--context <tên>] [--vhost <v>] [--flow <f>]
            [--target-version <x.y>] [--fail-on S1|S2|S3]
            [--save <file>] [--from <file>] [--json] [--lang en|vi]
```

Chạy theo bốn pha, mỗi pha in dòng của nó ngay khi xong:

1. **Nhận diện** (≤ 1 giây): phiên bản từng node, Khepri hay Mnesia, feature flag, tính năng deprecate còn được cho phép, nguồn dữ liệu nào đọc được. Cluster có node lệch phiên bản thì báo ngay.
2. **Kiểm kê**: đếm đối tượng; trên 2.000 queue thì in số request và thời gian ước tính trước khi đọc, có thanh tiến trình, Ctrl-C an toàn.
3. **Chấm luật**: chạy danh mục ở mục luật. Có `ocho.yaml` thì dùng dung sai đã khai; không có thì chỉ chấm luật cấu trúc.
4. **Báo cáo**: nhóm theo mức S1 đến S5, rồi theo đối tượng; kết thúc bằng ba việc làm trước và dòng đếm `fail · pass · not_checked · n/a`.

`--target-version 4.2` thêm nhóm luật nâng cấp, chỉ những thay đổi làm đổi an toàn message chứ không lặp phần rabbitmqadmin v2 đã làm. Ví dụ cụ thể nhất: từ 4.0 quorum queue có `delivery-limit` mặc định 20; queue không có dead-letter sẽ bắt đầu bỏ message độc mà trước đó chỉ giao lại vô hạn. Đây là một đường mất im lặng mới do chính lần nâng cấp sinh ra.

Ví dụ đầu ra trên một broker Amazon MQ 3.13:

```
$ ocho doctor --context prod
Connected to prod in 0.4s · RabbitMQ 3.13.7 · 3 nodes · Mnesia
Sources: HTTP API [ok] · management stats [ok] · Prometheus [unreachable]
214 queues · 37 exchanges · 1 vhost

S1  DATA SAFETY (3)
  T2  Unroutable messages are being dropped
      What happened: 1,240 unroutable messages dropped broker-wide
                     since 2026-09-12 03:10 UTC (node start)
      Is data safe:  no. Those 1,240 are gone. 3 exchanges without an
                     alternate exchange can drop more: scan.request,
                     scan.result, billing
      Do next:       ocho explain T2
      Evidence:      observed (count) · inferred (which exchanges)
...
Not checked (4): R1 publisher confirms on 6 channels: channel
                 stats missing for connections opened before stats reset

Do these first:
  1. Add alternate exchange to scan.request, scan.result, billing (T2)
  2. Set dead-letter-strategy at-least-once on 9 quorum queues (T5)
  3. Move 4 classic queues with consumers to quorum (T1)

38 rules · 9 fail · 21 pass · 4 not checked · 4 n/a · exit 1
```

### `ocho import`

```
ocho import [--context <tên> | --from <definitions.json>]
            [--out ocho.yaml] [--non-interactive] [--json]
```

1. Đọc definitions, nhóm exchange, binding, queue thành luồng theo routing key.
2. Đề xuất họ topology khi ≥ 3 tên chỉ khác nhau ở một token, ví dụ `request_clamav_q`, `request_yara_q`, `request_pdf_q` thành `request_{engine_id}_q`. Mỗi đề xuất in bằng chứng (các tên khớp) và chờ xác nhận.
3. Hỏi dung sai cho từng luồng: `strict`, `loose`, hoặc bỏ qua. Câu hỏi kèm một dòng hệ quả: "strict nghĩa là doctor sẽ coi classic queue ở luồng này là lỗi S1".
4. Ghi `ocho.yaml`. Phần không gán được vào luồng nào vào khối `unmanaged`, giữ nguyên từng trường.
5. Tự kiểm vòng tròn: biên dịch `ocho.yaml` vừa ghi và so với definitions đã đọc. Lệch dù một trường thì không ghi file, in chỗ lệch. Nhờ vậy U3 đúng theo cấu tạo, không đúng nhờ may.

`--non-interactive` cho CI và AI agent: không hỏi, mọi luồng ghi `tolerance: undeclared`, mọi đề xuất họ topology ghi dưới dạng chú thích chờ người duyệt.

### `ocho explain`

```
ocho explain <queue|exchange|flow|mã luật> [--vhost <v>] [--json]
```

Với một đối tượng, in từng key theo L6: giá trị hiệu lực, lớp đặt ra nó (argument, policy, operator policy, mặc định của node, mặc định của RabbitMQ), các policy cùng khớp và vì sao policy này thắng, đổi được khi đang chạy không, có khớp `ocho.yaml` không. Với một mã luật, ví dụ `ocho explain T2`, in luật, cơ chế, đường dẫn tới mục spec và lesson; chạy được không cần mạng.

### `ocho context`

```
ocho context add <tên> --url <https://…> [--ca <file>]
ocho context use <tên> · ocho context list
```

Giữ URL, CA và cách lấy mật khẩu (biến môi trường, keychain của hệ điều hành, hoặc `--password-stdin`). Không bao giờ giữ mật khẩu dạng chữ (Q5).

## Phát hiện, mức nghiêm trọng, exit code

Mức nghiêm trọng là năm bậc của I6, không phải thang riêng của CLI: một phát hiện S1 luôn được xếp trên mọi phát hiện S2, bất kể số lượng.

| Mức | Bậc của I6 | Ví dụ |
| --- | --- | --- |
| S1 | An toàn dữ liệu | Exchange không có alternate exchange; dead-letter at-most-once trên luồng strict |
| S2 | Đúng ngữ nghĩa (trùng, thứ tự) | Nhiều consumer trên queue khai cần thứ tự theo thực thể mà không có version |
| S3 | Vận hành được | Hai policy cùng khớp một queue; app dùng user quản trị |
| S4 | Hiệu năng | Prefetch 0 hoặc 1 trên queue tải cao |
| S5 | Chi phí | Hàng nghìn queue auto-delete sinh rồi xoá mỗi giờ |

Một phát hiện ở dạng JSON (`--json`), đây là hợp đồng theo CL10:

```json
{
  "schema": "ocho.finding/1",
  "rule": "T2",
  "severity": "S1",
  "result": "fail",
  "object": { "kind": "exchange", "vhost": "/", "name": "scan.request" },
  "what": "Unroutable messages are being dropped",
  "dataSafety": "1,240 messages are gone; more can be dropped",
  "next": "Add alternate-exchange=ocho.unroutable via policy",
  "mechanism": "An exchange stores nothing; with no matching binding and no alternate exchange the broker discards the message and still confirms it",
  "evidence": [
    { "kind": "observed", "source": "http:/api/overview#message_stats.drop_unroutable",
      "value": 1240, "since": "2026-09-12T03:10:00Z", "observedAt": "2026-10-04T01:22:10Z" },
    { "kind": "inferred", "source": "definitions", "note": "exchange has no alternate-exchange argument or policy" }
  ],
  "fix": { "kind": "policy", "set": { "alternate-exchange": "ocho.unroutable" },
           "rabbitmqadmin": "rabbitmqadmin policies declare …" },
  "specRef": "spec/0.4#T2",
  "waiver": null
}
```

**Miễn trừ có hạn.** Đội được miễn một luật cho một đối tượng trong `ocho.yaml`, bắt buộc có `reason`, `by` và `until`. Miễn trừ hết hạn thì phát hiện quay lại. Phát hiện được miễn vẫn được đếm trên dòng tổng kết, không bị giấu (I1, và điều khoản rubric hết hạn của khung nghệ nhân).

```yaml
waivers:
  - rule: T1
    object: queue cache.invalidate
    reason: loose by design, TTL backup on the reader side
    by: max
    until: 2027-01-31
```

**Exit code.** Phân biệt "sạch" với "sạch trong phần đã kiểm" là bắt buộc theo CL2.

| Code | Nghĩa |
| --- | --- |
| 0 | Không có `fail` và không có `not_checked` ở mức từ `--fail-on` trở lên (mặc định S1) |
| 1 | Có `fail` ở mức từ `--fail-on` trở lên |
| 2 | Không có `fail`, nhưng có luật ở mức từ `--fail-on` trở lên chưa kiểm được |
| 3 | Không nối được broker, hoặc thiếu quyền đọc |
| 4 | Tham số sai |
| 5 | Lỗi nội bộ của CLI. Không bao giờ thoát 0 khi chính CLI hỏng (I7 áp vào CLI) |

**Quy tắc hiển thị.**

- Màu không bao giờ là tín hiệu duy nhất: mỗi dòng có chữ `S1`, `[ok]`, `[unreachable]`. Tôn trọng `--no-color` và biến môi trường `NO_COLOR` (U6).
- Thời điểm in theo UTC kèm độ lệch; con số có dấu phân cách theo ngôn ngữ.
- Ngôn ngữ theo `LANG`, mặc định tiếng Anh, có `--lang vi`. Văn bản luật có đủ hai thứ tiếng trong `@ochotona/spec`; CI chặn phát hành khi một luật thiếu bản dịch.
- Rộng terminal dưới 80 cột thì bỏ cột phụ, không cắt chữ giữa từ.

## Danh mục luật doctor v0.1

v0.1 có 22 luật, phủ 11 trên 20 lỗi của lesson mục 9. Luật dùng mã của spec khi luật đó đã có trong spec; bốn luật nâng cấp mang tiền tố `VT` mới, cần thêm vào spec mục 9. Cột "Không có yaml" là mức khi luồng chưa khai dung sai: luật phụ thuộc dung sai hạ xuống S3 và ghi rõ "nếu luồng này không được mất".

| Mã | Mức | Phát hiện | Nguồn | Không có yaml | Lesson |
| --- | --- | --- | --- | --- | --- |
| T2 | S1 | Exchange có binding nhưng không có alternate exchange; nâng thành mất đã xảy ra khi bộ đếm unroutable bị bỏ > 0 | Definitions, thống kê hoặc Prometheus | S1 nếu đã có mất; còn lại S3 | #3 |
| R1 | S1 | Channel đang publish mà không bật confirm | Thống kê channel | S3 | #1 |
| C1 | S1 | Consumer không ack thủ công | `/api/consumers` | S3 | #4 |
| T1 | S1 | Classic queue mang luồng strict | Definitions | S3 khi queue bền, có consumer và có message | #7 |
| T5 | S1 | Quorum queue có dead-letter nhưng strategy at-most-once, hoặc thiếu `overflow: reject-publish` đi kèm | Definitions, policy | S1 | #9 |
| T4 | S1 | Quorum queue không đặt `delivery-limit` rõ, và không có dead-letter | Definitions, policy, phiên bản | S1 | #9 |
| T3 | S1 | Luồng strict có giới hạn chiều dài với overflow `drop-head` | Definitions, policy | S3 | #16 |
| T9 | S1 | Queue có TTL hoặc message expiry mà không dead-letter | Definitions, policy | S3 | — |
| L3 | S3, lên S1 | Hai policy cùng khớp một queue. Lên S1 khi policy thua mang `alternate-exchange` hoặc khoá dead-letter, vì các khoá đó đang không có hiệu lực | Policy | Như vậy | — |
| VT1 | S1 | Mirrored classic queue (policy `ha-mode`) trên 3.13, khi `--target-version` ≥ 4.0 | Policy | S1 | #7 |
| VT2 | S1 | Quorum queue không có dead-letter sẽ bắt đầu bỏ message độc sau 20 lần giao khi lên 4.x | Definitions, phiên bản | S1 | #9 |
| VT3 | S3 | Đang dùng tính năng đã deprecate: global QoS, queue transient không exclusive, thống kê management | Feature flag, consumer, definitions | S3 | — |
| VT4 | S3 | Node trong cluster lệch phiên bản | `/api/nodes` | S3 | — |
| N1 | S3 | Một connection vừa publish vừa consume, sẽ deadlock khi broker có memory alarm | Channel, consumer | S3 | #15 |
| N2 | S3 | Connection không có `connection_name` | `/api/connections` | S3 | — |
| N3 | S3 | Heartbeat tắt (timeout 0) | `/api/connections` | S3 | — |
| Q3 | S3 | Ứng dụng nối bằng user có tag `administrator` hoặc user `guest` | Connection, user | S3 | — |
| C2 | S3, S4 | Prefetch 0 (S3, nguy cơ OOM consumer) hoặc 1 trên queue tải cao (S4) | `/api/consumers`, thống kê | Như vậy | #12 |
| F4 | S3 | Tỷ lệ giao lại vượt 50% tỷ lệ giao trong cửa sổ đo: vòng lặp requeue hoặc message độc | Thống kê hoặc Prometheus | S3 | #11 |
| DX1 | S3 | Queue dùng làm kho: trên 1 triệu message ready, hoặc tồn tăng ở cả hai lần lấy mẫu | Queue | S3 | #16 |
| DX2 | S3 | `disk_free_limit` thấp hơn 1 lần bộ nhớ của node | `/api/nodes` | S3 | §4 |
| DX3 | S5 | Connection hoặc queue sinh rồi huỷ liên tục | Churn rate ở `/api/overview` | S5 | #13, #18 |

Chín lỗi không lộ ra từ broker (#2 dual write, #5 ack trước commit, #6 không idempotent, #8 tin thứ tự toàn cục, #10 UNKNOWN, #14 chung channel giữa thread, #17 TTL theo message cho retry, #19 cluster nhiều region, #20 RPC đồng bộ mọi thứ) thuộc phần của `lint` trên code và của client. Doctor nói thẳng điều này ở cuối báo cáo, một dòng, để người đọc không hiểu nhầm "0 lỗi" thành "hệ thống an toàn".

Ngưỡng 1 triệu message ở DX1 và 50% ở F4 là giá trị khởi đầu, hiệu chỉnh sau khi chạy trên ba broker của design partner.

## Kết nối, quyền, bí mật

Doctor chạy được bằng một user chỉ có tag `monitoring`; CLI không bao giờ đòi quyền quản trị cho lệnh đọc.

**Dựng `Actual` không qua `/api/definitions`.** Endpoint xuất definitions thường đòi tag `administrator`. Doctor ghép `Actual` từ các endpoint danh sách (queue, exchange, binding, policy, connection, channel, consumer, node), để user `monitoring` là đủ. Riêng `import` từ broker cần đủ definitions; nếu user không có quyền, CLI nói rõ và gợi ý `--from` với file definitions do người có quyền xuất ra.

**Thiếu quyền là `not_checked`, không phải lỗi.** Ví dụ Q3: user `monitoring` không đọc được tag của user khác, nên doctor chỉ kết luận được user tên `guest`; phần "app dùng user quản trị" báo `not_checked: cannot read user tags with a monitoring account`.

**Cảnh báo khi dùng quyền quá rộng.** Lệnh đọc chạy bằng user `administrator` thì in một dòng S3 về chính CLI, kèm lệnh tạo user tối thiểu:

```
rabbitmqadmin users declare --name ocho-doctor --password-stdin --tags monitoring
```

**Mật khẩu.** Ba nguồn, theo thứ tự: biến `OCHO_PASSWORD`, keychain của hệ điều hành, `--password-stdin`. URL chứa mật khẩu bị từ chối, vì nó sẽ nằm trong lịch sử shell; thông báo lỗi chỉ cách chuyển sang keychain. Không lệnh nào in mật khẩu, kể cả với `--debug`.

**TLS.** Kiểm chứng chỉ mặc định; `--ca <file>` cho CA riêng. `--insecure` có tồn tại nhưng mỗi lần chạy in cảnh báo ở dòng đầu, và không được lưu vào context.

**Ảnh chụp chia sẻ được.** `--save` không bao giờ chứa mật khẩu, vì CLI không đọc chúng. Thêm `--redact-hosts` để thay IP và hostname của client bằng mã băm trước khi gửi kèm issue.

**Mạng.** CLI chỉ nói chuyện với host trong context đang dùng, qua proxy trong `HTTPS_PROXY` nếu có (CL7).

## Ngân sách và chỉ số bảo vệ

Mỗi ngân sách có một chỉ số bảo vệ để không đạt được bằng cách nới định nghĩa. Ngân sách dẫn là dòng đầu; tám dòng còn lại là sàn.

| Ngân sách | Mục tiêu | Đo bằng | Chỉ số bảo vệ | Tiêu chí |
| --- | --- | --- | --- | --- |
| Từ lúc cài tới phát hiện thật đầu tiên | ≤ 3 phút, trung vị của 5 SRE người lạ | Đồng hồ, ghi màn hình | ≥ 95% phát hiện S1 được chính họ xác nhận là đúng | A2, B5 |
| Phát hiện S1 sai | ≤ 5% | Người dùng gắn nhãn đúng hoặc sai trên 3 broker của design partner | Recall 100% luật S1 trên broker gieo lỗi | A13 |
| Luật S1 ở trạng thái `not_checked` | 0 trên broker tự vận hành có Prometheus | Báo cáo doctor | Trên Amazon MQ được phép > 0, nhưng mỗi luật có lý do cụ thể | CL2 |
| Phản hồi đầu tiên | Dòng xác nhận ≤ 100 ms; dòng có thông tin thật ≤ 1 giây, hoặc dòng "đang chờ broker" kèm số giây đã chờ | p95 trên máy CI chuẩn | Dòng đầu không được là spinner trống | U7, A3 |
| Doctor trên broker lớn | 2.000 queue ≤ 30 giây; 10.000 queue ≤ 3 phút, có tiến trình | Broker fixture | ≤ 5 request mỗi giây; CPU node chạy management tăng ≤ 10% | A15, CL6 |
| Import broker 200 queue | ≤ 10 phút, tính cả lúc trả lời câu hỏi dung sai | Design partner | `plan` sau `import` = 0 thay đổi, 100% số lần | U3, A2 |
| Explain một queue | ≤ 2 giây | CT-30 | Lớp nguồn đúng 100% | L6 |
| Request không phải GET từ lệnh đọc | 0 | Proxy ghi request trong test | Có test riêng cho từng lệnh đọc | CL1 |
| Thoát 0 khi CLI lỗi nội bộ | 0 lần | Test gây lỗi trong mỗi pha | Mọi exception chưa bắt đều ra exit 5 | CL2, I7 |

## Kiểm thử

Cổng phát hành của CLI là bộ broker gieo lỗi: mỗi luật S1 bắt đúng mọi lỗi được gieo và không báo nhầm ở mẫu gần giống, trên 3.13, 4.2 và 4.3.

**Broker gieo lỗi.** Mỗi fixture là một file definitions cộng một script tạo lưu lượng thật (publish không confirm, consumer auto-ack, publish sai routing key, connection vừa publish vừa consume, prefetch 0, vòng lặp requeue), kèm file `expected.json` liệt kê chính xác các phát hiện phải có. Test so sánh tập hợp: thiếu một phát hiện là hỏng recall, thừa một phát hiện là hỏng precision.

Mỗi luật có ít nhất ba mẫu, theo cấu trúc canon của khung nghệ nhân:

| Loại mẫu | Mục đích | Ví dụ cho T2 |
| --- | --- | --- |
| Mẫu lỗi | Phải bắt | Exchange `topic` có binding, không có alternate exchange, có publish sai routing key |
| Mẫu gần giống | Không được báo | Alternate exchange đặt qua policy thay vì qua argument |
| Mẫu phản-canon | Không được báo S1, phải hiểu ngữ cảnh | Exchange của luồng khai `loose`, có miễn trừ còn hạn |

**Bốn biến thể nguồn dữ liệu cho mỗi fixture.** Đủ ba nguồn; tắt thống kê management; không có Prometheus; chỉ còn HTTP API danh sách. Mỗi biến thể có `expected.json` riêng, trong đó danh sách `not_checked` cũng là kết quả phải khớp. Đây là cách kiểm CL2 bằng máy.

**Năm lớp test khác.**

1. Luật trên ảnh chụp `Actual`, không cần Docker, cả bộ chạy dưới 10 giây trên mỗi commit.
2. Proxy ghi request cho từng lệnh đọc: một request không phải GET là hỏng (CL1).
3. Gây lỗi cho chính CLI bằng Toxiproxy: broker trả chậm 3 giây thì CLI tự giảm tốc; broker chết giữa pha kiểm kê thì thoát 3, in phần đã đọc, không bao giờ thoát 0.
4. Snapshot đầu ra văn bản ở 80 và 120 cột, tiếng Anh và tiếng Việt.
5. Broker 10.000 queue sinh tự động để đo ngân sách thời gian và tải.

**Ánh xạ bộ test conformance của spec.** v0.1 phải qua CT-29 (policy chồng nhau) và CT-30 (explain ba lớp). CT-32 (import rồi plan cho 0 thay đổi) được thay tạm bằng bước tự kiểm vòng tròn trong `import`, vì `plan` có ở v0.3. CT-35 thuộc v0.2; CT-31 và CT-33 thuộc v0.3.

**Lớp vô hình của CLI.** Sáu thứ không ai review nhưng quyết định chất lượng dài hạn, mỗi thứ có test riêng: thông báo cho mọi kiểu hỏng ở K2; Ctrl-C ở mọi pha; che bí mật trong ảnh chụp và log; đủ bản dịch cho mọi luật; exit code; tài liệu schema JSON.

**Bản đồ dung sai.** Cả hai cột đều bắt buộc.

| Chặt: sai là hỏng | Lỏng: đủ tốt là đúng |
| --- | --- |
| CL1 lệnh đọc không ghi | Bảng màu terminal |
| Exit code và schema JSON | Kiểu spinner, ký hiệu khung |
| Precision của luật S1 | Thứ tự các phát hiện S4, S5 |
| Che bí mật | Câu chữ của luật S5 |
| Không thoát 0 khi lỗi | Tốc độ của lệnh trên broker dưới 100 queue |

## Lộ trình và 14 ngày tới

CLI đi bốn bước, mỗi bước chỉ mở khi qua cổng của bước trước; bản alpha v0.1 phát hành được vào Oct 18, 2026.

&#91;embedded content: lộ trình CLI · 4 bước, 4 cổng\]

Cổng của v0.1 đo bằng broker gieo lỗi và một broker thật của design partner, không đo bằng số lệnh đã viết. `test` nằm ở v0.4 vì nó chạy bộ CT bằng client, và client phải qua CT-01 đến CT-07 trước.

**Doctor là cửa vào của design partner.** Việc 3 của bản đánh giá cần ba đội, trong đó hai đội đang nâng Amazon MQ từ 3.13 lên 4.2. Lời mời cụ thể nhất có thể đưa ra: chạy `ocho doctor --target-version 4.2` trên broker của họ bằng một user `monitoring`, không sửa code, nhận báo cáo VT1, VT2 trước ngày nâng cấp. Đội nào thấy phát hiện S1 thật trong báo cáo đó là ứng viên design partner tốt nhất, vì họ đã thấy giá trị trên chính hệ thống của mình.

**14 ngày tới.**

- [ ] Ngày 1–2: monorepo với năm gói; CI dựng RabbitMQ 3.13, 4.2, 4.3 trong Docker.
- [ ] Ngày 2–3: `@ochotona/broker` với `BrokerReader`, ba nguồn dữ liệu, bộ ba `{value, source, observedAt}`; lệnh `ocho context`.
- [ ] Ngày 3–5: fixture gieo lỗi cho tám luật S1 (T2, R1, C1, T1, T5, T4, T3, T9), mỗi luật đủ mẫu lỗi, mẫu gần giống, mẫu phản-canon.
- [ ] Ngày 5–8: tám luật S1, báo cáo văn bản và JSON, exit code; test proxy cho CL1.
- [ ] Ngày 6: dựng một broker Amazon MQ 3.13 nhỏ nhất, chạy kiểm các giả định GC1 đến GC5 bên dưới; giả định sai thì sửa spec CLI trước khi viết tiếp.
- [ ] Ngày 8–10: luật S3 đến S5, VT1 đến VT4, `ocho explain` cho đối tượng và mã luật.
- [ ] Ngày 10–12: `ocho import` với tự kiểm vòng tròn; fixture họ topology lấy từ hệ thống quét file thu nhỏ của việc 2.
- [ ] Ngày 13: gửi lời mời chạy doctor tới năm đội đang dùng RabbitMQ; đo K1 tới K3 với người đầu tiên nhận lời.
- [ ] Ngày 14: phát hành `@ochotona/cli@0.1.0-alpha` trên npm, kèm binary đơn.

## Giả định, đề xuất sửa spec, câu hỏi mở

Bảy giả định dưới đây suy ra từ tài liệu và hành vi đã biết, chưa chạy thử. Giả định sai thì sửa spec CLI trước, sửa code sau; GC1 và GC2 kiểm trong ngày 6.

| Mã | Giả định | Luật phụ thuộc | Kiểm bằng |
| --- | --- | --- | --- |
| GC1 | User tag `monitoring` đọc được mọi endpoint danh sách mà doctor cần, trên 3.13, 4.2 và Amazon MQ | Toàn bộ | Chạy doctor bằng user `monitoring` ở ba nơi; mọi 401, 403 phải hiện thành `not_checked` |
| GC2 | Danh sách channel có cờ `confirm` kể cả khi thống kê management đã tắt | R1 | Fixture biến thể tắt thống kê |
| GC3 | Bộ đếm unroutable bị bỏ ở overview và ở Prometheus có trên 3.13 trở lên, đếm đúng ca exchange không có alternate exchange và publish không `mandatory` | T2 | Fixture T2 |
| GC4 | `/api/consumers` trả `ack_required` và `prefetch_count` trên mọi phiên bản hỗ trợ và trên Amazon MQ | C1, C2 | Fixture C1 |
| GC5 | Endpoint danh sách hỗ trợ phân trang và chọn cột, đủ giữ tải dưới CL6 trên broker 10.000 queue | CL6, ngân sách broker lớn | Broker 10.000 queue |
| GC6 | `/api/nodes` có `disk_free_limit` và `mem_limit`, kể cả trên Amazon MQ | DX2 | Chạy trên Amazon MQ |
| GC7 | Binary đơn đóng bằng Node SEA khởi động trong ≤ 300 ms, đủ cho ngân sách 1 giây | U7 | Đo p95 trên ba hệ điều hành |

**Đề xuất sửa spec lõi v0.4.**

1. U2: thêm lệnh `context`.
2. Mục 9: thêm mã VT1 đến VT4 cho các luật nâng cấp phiên bản.
3. U5: đưa `result` bốn giá trị (`fail`, `pass`, `not_checked`, `not_applicable`) và `evidence` hai loại (`observed`, `inferred`) vào hợp đồng phát hiện chung, để `lint` và bàn đỡ dùng cùng định dạng với `doctor`.
4. I6: ghi rõ mức S1 đến S5 là năm bậc của I6, dùng chung cho CLI, client và bàn đỡ.

**Câu hỏi mở.**

- Khi hai policy cùng priority cùng khớp một queue, RabbitMQ chọn policy nào? Cần đọc mã nguồn broker trước khi viết L3 và `explain`. Nếu không xác định được, `explain` phải nói "không xác định" thay vì đoán (A13).
- Doctor lấy mẫu một lần hay hai lần cách 30 giây? Đề xuất: một lần mặc định, `--sample 30` cho DX1 và F4 khi cần đo xu hướng.
- Binary đơn: Node SEA hay `bun build --compile`? Chọn sau khi đo GC7, theo thời gian khởi động trước, kích thước sau.
