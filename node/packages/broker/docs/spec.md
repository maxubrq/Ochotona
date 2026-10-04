# Spec @ochotona/broker v0.1

Oct 4, 2026 · @Max Darius

## Phạm vi và quyết định

`@ochotona/broker` là gói duy nhất của Ocho nói chuyện với broker qua mạng. Nó nhận một đích kết nối và một kế hoạch đọc, rồi trả `RawResponses` cho `model.buildActual`. Nó không hiểu ý nghĩa của trường nào: không ánh xạ, không suy ra, không chấm.

| Gói này làm                                                      | Gói này không làm                            |
| ---------------------------------------------------------------- | -------------------------------------------- |
| HTTP GET tới management API và endpoint Prometheus               | Ánh xạ JSON sang `Actual` (model, `ingest/`) |
| Phân trang, chọn cột, giới hạn tốc độ, thử lại                   | Khớp policy, giá trị hiệu lực (model)        |
| Phát hiện ba nguồn dữ liệu                                       | Quyết định luật nào `not_checked` (rules)    |
| Biến mọi lỗi mạng và HTTP thành `RawResult` hoặc mã chẩn đoán CX | In thông báo cho người dùng (cli)            |
| Huỷ, sự kiện tiến trình, ước tính thời gian                      | Đọc file, keychain, `password_command` (cli) |
| Công cụ ghi fixture thô từ broker thật                           | —                                            |

**Bốn quyết định.**

1. **Chỉ GET, cưỡng chế ở ba tầng.** Kiểu: `BrokerReader` không có phương thức ghi. Transport: hàm gửi request viết cứng `method: 'GET'`, không nhận tham số method. Dispatcher: một interceptor của undici ném lỗi lập trình nếu thấy request nào khác GET. Ba tầng vì CL1 là bất biến mà một lần vi phạm đủ làm mất niềm tin của ops vào cả dự án.
2. **Lỗi là dữ liệu.** `read` không ném lỗi vì broker trả 403 hay mạng chập chờn. Mọi tình huống thành `RawResult` có trạng thái, để model biến chúng thành lý do `unknown` cụ thể. Chỉ lỗi lập trình mới ném.
3. **Kế hoạch đọc do model sinh.** Endpoint nào, cột nào, cho trường nào là kiến thức về ánh xạ, và ánh xạ thuộc model. Broker nhận `ReadPlan` đã tính sẵn, không tự quyết đọc gì.
4. **Không đồng hồ, không ngẫu nhiên trực tiếp.** `clock`, `sleep`, `random` được truyền vào, để test throttle, backoff và `observedAt` tất định.

## Cấu trúc gói và phụ thuộc

```
packages/broker/
  src/
    target.ts          chuẩn hoá URL, ghép đường dẫn, TLS, proxy
    transport.ts       GET duy nhất, interceptor chặn method khác, đo thời gian
    throttle.ts        token bucket thích nghi
    retry.ts           phân loại lỗi, backoff có jitter, Retry-After
    paginate.ts        đọc theo trang, ghép trang
    sources.ts         phát hiện ba nguồn
    prometheus.ts      lấy văn bản exposition
    reader.ts          identify, read, close
    events.ts          kiểu sự kiện tiến trình
    index.ts
  tools/
    record-raw.ts      ghi fixture thô từ broker thật
    redact-raw.ts      che host trong fixture thô
    check-assumptions.ts
```

| Phụ thuộc         | Vì sao                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `@ochotona/spec`  | Mã chẩn đoán CX, kiểu nguyên thuỷ                                                              |
| `@ochotona/model` | Kiểu `RawResult`, `RawResponses`, `ReadPlan`                                                   |
| `undici`          | `Agent` với CA và chứng chỉ client, `EnvHttpProxyAgent`, interceptor, giới hạn kích thước body |

Không dùng thư viện retry hay rate limit bên ngoài: cả hai dưới 150 dòng, và hành vi của chúng là một phần của CL6 nên phải đọc được trong repo.

## Đích kết nối

CLI đọc context, mật khẩu và file CA, rồi đưa cho broker một `BrokerTarget` đã đủ giá trị. Broker không đọc đĩa và không biết context tồn tại.

```ts
export interface BrokerTarget {
  readonly url: string; // gốc management, kể cả path prefix
  readonly user: string;
  readonly password: string;
  readonly tls?: {
    readonly ca?: string; // PEM, thêm vào kho gốc mặc định
    readonly cert?: string;
    readonly key?: string; // mTLS, tuỳ chọn
    readonly insecure?: boolean; // tắt kiểm chứng chỉ (CX5)
    readonly serverName?: string; // SNI khi khác host trong URL
  };
  readonly prometheus?: 'auto' | 'off' | { readonly url: string }; // mặc định 'auto'
  readonly timeouts?: {
    readonly connectMs?: number;
    readonly requestMs?: number;
  }; // 5000, 15000
}
```

**Chuẩn hoá URL, theo thứ tự.**

1. Parse bằng `URL` của WHATWG. Scheme khác `http`, `https`, hoặc có query, fragment → CX10 (URL không hợp lệ), exit 4.
2. Có phần `user:pass@` → CX4, từ chối; không dùng giá trị đó dù chỉ một lần.
3. Bỏ `/` ở cuối, và bỏ `/api` ở cuối nếu người dùng dán nhầm URL của API.
4. Giữ nguyên phần đường dẫn còn lại: đó là `management.path_prefix` của broker, ví dụ `http://host:15672/rabbitmq`.
5. Không đoán cổng. URL không có cổng thì dùng cổng mặc định của scheme; nếu kết nối hỏng, thông báo CX1 gợi ý `:15672` hoặc `:15671`. Amazon MQ chạy management trên 443, nên đoán 15672 sẽ sai đúng ở loại broker quan trọng nhất của design partner.

Đường dẫn API = gốc + `/api` + các đoạn, mỗi đoạn qua `encodeURIComponent` (vhost `/` thành `%2F`, vhost `a b` thành `a%20b`).

**Xác thực.** HTTP Basic. Header được tính một lần khi tạo reader và chỉ nằm trong closure của transport; mật khẩu không được lưu thành trường của bất kỳ object nào trả ra ngoài, nên không thể vô tình bị serialize. Token OAuth 2 qua `token_command` để sang v0.2.

**TLS.** Tối thiểu TLS 1.2. CA riêng được **thêm vào** kho gốc mặc định (`[...tls.rootCertificates, ca]`), không thay thế nó: truyền thẳng `ca` vào Node sẽ thay kho gốc, và một broker sau proxy dùng chứng chỉ công khai sẽ đột nhiên hỏng.

**Proxy.** `EnvHttpProxyAgent` của undici, tôn trọng `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY`; áp cho cả request Prometheus.

**Kết nối.** Một `Agent` cho cả phiên, giữ tối đa `concurrency + 1` socket, keep-alive 10 giây; `close()` huỷ chúng.

**Header.** Chỉ ba: `Authorization`, `Accept: application/json`, `User-Agent: ochotona/<phiên bản> (read-only)`. Chuỗi `read-only` giúp ops nhận ra request của Ocho trong log truy cập của broker.

## Kế hoạch đọc và các pha

Model xuất `planRead(requires, scope)`: từ tập trường mà các luật được chọn cần, nó sinh danh sách endpoint, cột và tham số truy vấn. Broker thực thi kế hoạch theo ba pha; mỗi pha phát sự kiện ngay khi xong, để CLI in dòng thông tin đầu trong 1 giây.

```ts
export type EndpointId =
  | 'overview'
  | 'whoami'
  | 'nodes'
  | 'vhosts'
  | 'featureFlags'
  | 'deprecatedUsed'
  | 'exchanges'
  | 'queues'
  | 'bindings'
  | 'policies'
  | 'operatorPolicies'
  | 'connections'
  | 'channels'
  | 'consumers'
  | 'prometheus'
  | 'totalsAtEnd';

export interface EndpointRead {
  readonly id: EndpointId;
  readonly segments: readonly string[]; // ['queues', '%2F'] trước khi encode là ['queues', '/']
  readonly paginated: boolean;
  readonly columns: readonly string[] | null;
  readonly query: Readonly<Record<string, string>>;
  readonly requiresCapability?: 'deprecatedFeaturesUsed';
}

export interface ReadPlan {
  readonly identify: readonly EndpointRead[];
  readonly inventory: readonly EndpointRead[]; // thứ tự có nghĩa, xem dưới
  readonly prometheus: boolean;
  readonly scope: { readonly vhosts: readonly string[] | 'all' };
}
```

**Pha 1: nhận diện.** `overview`, `whoami`, `featureFlags`, `nodes`, cùng lúc với ba phép thử nguồn. Kết quả trả về ngay qua `identify()`: phiên bản, nguồn, tổng số đối tượng, ước tính thời gian. Nếu phiên bản không có endpoint mà kế hoạch cần (`requiresCapability` là false trong bảng năng lực), endpoint đó được đánh `not_attempted` kèm lý do `capability`, và model biến nó thành `endpoint_missing` mà không tốn request nào.

**Pha 2: kiểm kê.** Thứ tự được chọn để giảm tham chiếu treo:

1. `vhosts`, `policies`, `operatorPolicies`, `deprecatedUsed`: nhỏ và ít đổi.
2. `exchanges`, `queues`, `bindings`: định nghĩa.
3. `connections`, `channels`, `consumers`: thay đổi nhanh nhất, đọc sát nhau để consumer và channel cùng một khoảnh khắc nhất có thể.
4. `prometheus` nếu nguồn có.

**Pha 3: đóng.** Đọc lại `overview` thành `totalsAtEnd`, để model so số đối tượng đầu và cuối và phát hiện `page_shift`.

**Phạm vi theo vhost.** Có `--vhost` thì dùng endpoint theo vhost: `/api/queues/{v}`, `/api/exchanges/{v}`, `/api/bindings/{v}`, `/api/policies/{v}`, `/api/operator-policies/{v}`, `/api/vhosts/{v}/connections`, `/api/vhosts/{v}/channels`, `/api/consumers/{v}`. Không có `--vhost`, binding và consumer (hai endpoint không phân trang) vẫn được đọc theo từng vhost khi broker có ≤ 20 vhost, để không có một response nào chứa cả trăm nghìn binding; trên 20 vhost thì đọc một lần.

**Cột và tham số.** Cột lấy đúng từ bảng ánh xạ ở tab model. Hai tham số đáng chú ý:

| Endpoint                                         | Tham số                           | Lý do                                                           |
| ------------------------------------------------ | --------------------------------- | --------------------------------------------------------------- |
| `exchanges`                                      | `disable_stats=true`              | Không luật nào đọc thống kê exchange; bỏ đi giảm tải cho broker |
| `queues`, `exchanges`, `connections`, `channels` | `sort=name`, `sort_reverse=false` | Thứ tự ổn định giữa các trang (GC13), không trông vào mặc định  |

## Phát hiện nguồn

Khi không chắc, phép thử luôn nghiêng về "không có". Báo nhầm "không có" chỉ làm vài luật thành `not_checked`, tức là ồn. Báo nhầm "có" thì model đọc trường vắng thành 0 (ngoại lệ `publishCount`), tức là xanh im lặng, đúng thứ CL2 cấm.

| Nguồn        | Phép thử                                                   | `ok` khi                                             | Các kết quả khác                                                                                   |
| ------------ | ---------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `http.list`  | GET `/api/overview`                                        | 200                                                  | 401 → CX3, dừng. 403 → CX9 (user không có tag management nào), dừng. Lỗi mạng → CX1 hoặc CX2, dừng |
| `http.stats` | Đọc từ body overview ở trên, không tốn request             | Có khoá `message_stats` **và** có khoá `churn_rates` | Thiếu một trong hai → `unavailable`                                                                |
| `prometheus` | GET URL Prometheus, trần 2 giây, không gửi header xác thực | 200 và body bắt đầu bằng `# HELP` hoặc `# TYPE`      | 401, 403 → `forbidden`; còn lại → `unavailable`; `prometheus: 'off'` → `not_attempted`             |

Phép thử `http.stats` dùng hai khoá vì broker vừa khởi động, bật thống kê nhưng chưa có lưu lượng, có thể chưa có `message_stats`. Đây là giả định GC21; nếu bản ghi thô cho thấy một khoá ổn định hơn thì đổi sang khoá đó.

**URL Prometheus khi `auto`.** Cùng host với management; management là `https` thì `https://host:15691/metrics`, là `http` thì `http://host:15692/metrics`. Dùng endpoint gộp `/metrics`, không dùng `/metrics/per-object`: endpoint gộp nhỏ cả khi broker có hàng chục nghìn queue, và đã chứa bộ đếm toàn cục mà T2 cần. Không gửi mật khẩu management tới cổng Prometheus, kể cả khi cùng host.

## Phân trang và đọc nhất quán

Broker giữ dữ liệu thô đúng như API trả, kể cả trùng lặp giữa các trang; phát hiện và xử lý bất thường là việc của model, vì model mới biết khoá của từng loại đối tượng.

**Vòng đọc một endpoint phân trang.**

1. Gửi `page=1&page_size=500` cùng cột và tham số của kế hoạch.
2. Đọc `page_count` trong mỗi response, không chỉ response đầu: đối tượng được thêm trong lúc đọc có thể làm tăng số trang.
3. Lặp tới khi `page` > `page_count` mới nhất.
4. Trần an toàn: `ceil(total lúc nhận diện × 1,5 / 500) + 5` trang. Chạm trần thì endpoint thành `http_error` với ghi chú `pagination_runaway`, không đọc tiếp.
5. Mỗi trang ghi `observedAt` = `clock()` lúc nhận xong body.

Response của endpoint phân trang là object `{ items, page, page_count, item_count, total_count, filtered_count }`. Endpoint không phân trang trả mảng, được ghi thành một trang duy nhất. Nếu endpoint lẽ ra phân trang lại trả mảng, nó cũng được coi là một trang, và một sự kiện `warning` được phát để bản ghi thô lưu lại hiện tượng này.

**Một trang hỏng là cả endpoint hỏng.** Sau khi hết lượt thử lại, nếu một trang vẫn lỗi, kết quả của cả endpoint là `http_error` hoặc `network_error`, và các trang đã đọc bị bỏ. Một danh sách thiếu trang giữa trông y như một danh sách đầy đủ; trả nó lên sẽ biến "không đọc được" thành "không có", đúng thứ CL2 cấm.

**Thời điểm.** `readStartedAt` là lúc gửi request đầu của pha nhận diện; `readFinishedAt` là lúc nhận xong `totalsAtEnd`. Hai mốc này là khung mà INV3 của model kiểm.

## Kiểm soát tải

Mọi request tới cùng một host, kể cả Prometheus, đi qua một bộ giới hạn duy nhất. Tham số người dùng chỉnh được: `--max-rps` (1 đến 20, mặc định 5) và `--concurrency` (1 đến 4, mặc định 2).

**Trạng thái.** Tốc độ hiện tại `r` (khởi đầu bằng `maxRps`), số token trong bucket (sức chứa `max(1, floor(r))`, nạp liên tục theo `r`), số request đang bay, chuỗi phản hồi nhanh liên tiếp.

**Lấy lượt.** Chờ tới khi có ít nhất 1 token và số request đang bay nhỏ hơn `concurrency`, rồi trừ 1 token.

**Thích nghi sau mỗi phản hồi**, gọi `L` là thời gian từ lúc gửi tới lúc nhận xong body:

| Điều kiện                            | Hành động                                                              |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `L` > 2.000 ms                       | `r = max(1, r / 2)`, chuỗi nhanh về 0, phát sự kiện `throttle`         |
| `L` < 500 ms                         | Chuỗi nhanh tăng 1; đủ 10 thì `r = min(maxRps, r + 1)` và chuỗi về 0   |
| Còn lại                              | Chuỗi nhanh về 0                                                       |
| Status 429 hoặc 503 có `Retry-After` | Dừng mọi lượt tới hết thời gian đó (trần 30 giây), `r = max(1, r / 2)` |

Bộ giới hạn đếm mọi request đã gửi kèm thời điểm. Test dùng bộ đếm này để chứng minh không có cửa sổ 1 giây nào vượt `maxRps`, và CLI dùng nó cho dòng thống kê trong `--debug`.

## Lỗi, thử lại, mã chẩn đoán

Mọi lỗi được phân loại một lần ở `retry.ts`; phân loại quyết định có thử lại không, `RawResult` mang gì, và khi lỗi xảy ra ở pha nhận diện thì mã CX nào được trả.

| Tình huống                                                                                                                     | Thử lại                     | `RawResult`                          | Ở pha nhận diện |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------ | --------------- |
| DNS không tìm thấy host (`ENOTFOUND`)                                                                                          | không                       | `network_error`, `kind: dns`         | CX1             |
| DNS tạm thời (`EAI_AGAIN`)                                                                                                     | có                          | `network_error`, `kind: dns`         | CX1             |
| Bị từ chối kết nối (`ECONNREFUSED`)                                                                                            | không                       | `network_error`, `kind: connect`     | CX1             |
| Quá thời gian kết nối                                                                                                          | có                          | `network_error`, `kind: timeout`     | CX1             |
| Mất kết nối giữa chừng (`ECONNRESET`, `EPIPE`, socket đóng)                                                                    | có                          | `network_error`, `kind: reset`       | CX1             |
| Quá 15 giây chờ header hoặc body                                                                                               | có                          | `network_error`, `kind: timeout`     | CX1             |
| Lỗi chứng chỉ TLS (`CERT_*`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `DEPTH_ZERO_SELF_SIGNED_CERT`, `ERR_TLS_CERT_ALTNAME_INVALID`) | không                       | `network_error`, `kind: tls`         | CX2             |
| 401                                                                                                                            | không                       | `http_error 401`                     | CX3             |
| 403                                                                                                                            | không                       | `http_error 403`                     | CX9             |
| 404                                                                                                                            | không                       | `http_error 404`                     | —               |
| 429, 502, 503, 504                                                                                                             | có, tôn trọng `Retry-After` | `http_error` mã tương ứng            | CX1             |
| 500                                                                                                                            | một lần                     | `http_error 500`                     | CX1             |
| 4xx khác                                                                                                                       | không                       | `http_error` mã tương ứng            | CX1             |
| Body không phải JSON hợp lệ                                                                                                    | không                       | `http_error`, `note: parse_error`    | CX1             |
| Body lớn hơn 64 MB                                                                                                             | không                       | `http_error`, `note: body_too_large` | —               |

**Thử lại.** Tối đa 2 lần (3 lượt). Thời gian chờ theo jitter đầy đủ: ngẫu nhiên trong `[0, min(2.000, 500 × 2^lượt)]` ms; `Retry-After` thay thế giá trị này, trần 30 giây. Mỗi lần thử lại phát sự kiện `retry` kèm lý do. Mọi request đều là GET nên thử lại luôn an toàn về dữ liệu; giới hạn số lần là để bảo vệ broker, không phải để bảo vệ dữ liệu.

**Hai mã chẩn đoán mới**, cần thêm vào `codes.json` và i18n của gói spec:

| Mã   | Nghĩa                                                                | Gợi ý trong thông báo                 |
| ---- | -------------------------------------------------------------------- | ------------------------------------- |
| CX9  | Broker trả 403 ở `/api/overview`: user không có tag management nào   | Thêm tag `monitoring` cho user        |
| CX10 | URL không hợp lệ: scheme khác http và https, hoặc có query, fragment | Dạng đúng, ví dụ `https://host:15671` |

## Prometheus

Broker lấy toàn bộ văn bản exposition một lần (trần 32 MB) và trả nguyên văn; việc parse thuộc model. Request gửi `Accept: text/plain;version=0.0.4` để không nhận định dạng OpenMetrics, vốn khác ở hậu tố `_total` và dòng `# EOF`.

**Endpoint Prometheus chỉ có số liệu của node đang trả lời.** Plugin Prometheus của RabbitMQ không gộp số liệu toàn cluster (giả định GC22). Sau load balancer, mỗi lần gọi có thể rơi vào một node khác. Hệ quả cho T2: bộ đếm unroutable bị bỏ đọc từ Prometheus trên cluster nhiều node chỉ là số của một node.

Cách xử lý, cần sửa kiểu `Counter` ở tab model:

```ts
export interface Counter {
  readonly count: number;
  readonly completeSince: Instant;
  readonly scope:
    | { readonly kind: 'cluster' }
    | { readonly kind: 'node'; readonly node: string };
}
```

- Nguồn `http.stats` (overview) cho `scope: cluster`; vì vậy với bộ đếm, thứ tự ưu tiên đổi thành `http.stats` trước, `prometheus` sau. Đây là thay đổi so với bảng ánh xạ ở tab model.
- Nguồn `prometheus` cho `scope: node`, tên node lấy từ nhãn `rabbitmq_node` của metric `rabbitmq_identity_info`; `completeSince` tính theo uptime của đúng node đó.
- Cluster một node: `scope: node` tương đương toàn cluster, model đổi thành `cluster`.
- T2 vẫn dùng được số theo node: một con số lớn hơn 0 là bằng chứng chắc chắn đã mất, chỉ là cận dưới. Văn bản luật thêm một khuôn câu với tham số `{node}`: "at least 1,240, counted on node rabbit@b-1 only".

Đọc riêng từng node (danh sách URL Prometheus theo node) để sang v0.2: tên node dạng `rabbit@host` thường không truy cập được từ máy chạy CLI.

## Huỷ, tiến trình, ước tính

**Huỷ.** `identify` và `read` nhận `AbortSignal`. Khi huỷ: mọi request đang bay bị huỷ qua signal của undici, mọi lần chờ (throttle, backoff) dừng ngay, và kết quả là `{ status: 'aborted', pagesRead, pagesTotal }`. Không bao giờ trả `RawResponses` dở dang.

**Sự kiện.** Gọi đồng bộ qua `onEvent`; lỗi ném từ callback bị bắt và bỏ qua, để renderer hỏng không làm hỏng việc đọc.

```ts
export type ReadEvent =
  | { type: 'phase'; phase: 'identify' | 'inventory' | 'close'; at: Instant }
  | {
      type: 'identified';
      version: string | null;
      nodes: number | null;
      totals: Totals | null;
      sources: Record<'http.list' | 'http.stats' | 'prometheus', SourceState>;
    }
  | { type: 'estimate'; requests: number; seconds: number }
  | { type: 'page'; endpoint: EndpointId; page: number; pageCount: number }
  | { type: 'throttle'; rps: number }
  | { type: 'retry'; endpoint: EndpointId; attempt: number; reason: string }
  | {
      type: 'warning';
      code: 'unpaginated_response' | 'retry_after' | 'slow_broker';
      detail: string;
    };
```

**Ước tính.** Phát ngay sau pha nhận diện:

- `requests` = tổng `ceil(total / 500)` của các endpoint phân trang, cộng số endpoint không phân trang (nhân số vhost khi đọc theo vhost), cộng 1 cho pha đóng.
- `seconds` = `ceil(requests / maxRps × 1,2)`; hệ số 1,2 bù cho thời gian phản hồi và thử lại.

CLI chỉ in ước tính khi broker có trên 2.000 queue, đúng như K3 ở tab chính; sự kiện vẫn luôn được phát.

## Bảo mật và nhật ký

**Không bao giờ xuất hiện trong log, sự kiện, lỗi hay `RawResponses`:** header `Authorization`, mật khẩu, bất kỳ header request nào. URL có `user:pass@` đã bị từ chối ở bước chuẩn hoá, nên không có đường nào để thông tin đăng nhập lọt vào chuỗi URL.

**Dòng nhật ký `--debug`**, một dòng mỗi request:

```
GET /api/queues?page=2&page_size=500&sort=name&columns=… 200 312ms 482KB attempt=1 rps=5
```

Thông báo lỗi gốc của undici và của Node có thể chứa URL đầy đủ; broker thay origin trong mọi thông báo lỗi bằng tên context trước khi đưa ra ngoài.

**CL1 ba tầng**, đã nêu ở mục đầu, có test riêng cho từng tầng: tầng kiểu bằng test biên dịch âm (`// @ts-expect-error` khi gọi phương thức ghi), tầng transport bằng kiểm mã nguồn (không có tham số `method`), tầng dispatcher bằng test gửi thẳng một request POST qua dispatcher và khẳng định nó ném lỗi trước khi rời máy.

**Bộ nhớ.** Body các trang được giữ tới khi `buildActual` chạy xong; broker 10.000 queue khoảng 20 trang, vài chục MB. Trần 64 MB mỗi response chặn một broker bất thường làm cạn bộ nhớ CLI.

**Prometheus không nhận thông tin đăng nhập**, như đã nêu ở mục phát hiện nguồn.

## Ghi fixture thô và kiểm giả định

Đây là lý do `broker` đi trước `rules`: ba công cụ dưới đây biến ngày 6 (Amazon MQ) và các broker trong ma trận CI thành dữ liệu thật cho test ingest của model, và kiểm phần lớn giả định GC bằng máy. Ba công cụ nằm trong repo, không phát hành trên npm.

**`record-raw`.**

```
pnpm --filter @ochotona/broker record-raw \
  --context amq-lab --label amazon-mq-3.13 --variant full \
  --out fixtures/raw/ [--redact names]
```

Ghi ra `fixtures/raw/<label>/<variant>/`:

| File                      | Nội dung                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `manifest.json`           | Nhãn, biến thể, thời điểm ghi, phiên bản broker, số node, phiên bản Ocho, tag của user đã dùng, đã che hay chưa |
| `<endpoint>.json`         | `RawResult` của endpoint đó, đủ mọi trang và `observedAt`                                                       |
| `prometheus.txt`          | Văn bản exposition, nếu có                                                                                      |
| `columns/<endpoint>.json` | Bản đọc lại `queues`, `channels` có tham số `columns`, để kiểm GC20                                             |

`record-raw` đọc **không** có tham số `columns` ở lần chính, để thấy mọi trường mà broker trả; đó là cách duy nhất phát hiện một trường có tên khác giả định.

**`redact-raw`.** Luôn chạy sau `record-raw`. Thay `peer_host`, `host`, tên connection, tên channel, mọi `client_properties` trừ `product`, `version`, `connection_name` bằng mã băm nhất quán trong một lần ghi. `--redact names` băm thêm tên vhost, queue, exchange, user, policy: bắt buộc với broker của design partner. CI chặn commit nếu thư mục `fixtures/raw` chứa chuỗi khớp IPv4, IPv6 hoặc `.amazonaws.com`.

**`check-assumptions`.** Đọc mọi bản ghi và in bảng kết quả, dán thẳng vào tài liệu:

| Mã        | Kiểm trên bản ghi                                                                             |
| --------- | --------------------------------------------------------------------------------------------- |
| GC1       | `manifest` ghi user chỉ có tag `monitoring`, và mọi endpoint trong kế hoạch ở trạng thái `ok` |
| GC2       | Phần tử của `channels` có trường `confirm` ở biến thể `nostats`                               |
| GC8, GC21 | Có hay không `message_stats`, `churn_rates` trong overview khớp với biến thể                  |
| GC9       | `nodes[].applications` có phần tử `rabbit` mang `version`                                     |
| GC12      | Phần tử của `queues` có `effective_policy_definition`                                         |
| GC15      | Phần tử của `vhosts` có `default_queue_type`                                                  |
| GC17      | `deprecatedUsed` ở trạng thái `ok` trên 3.13                                                  |
| GC20      | Bản `columns/` có đúng trường lồng nhau đã yêu cầu                                            |
| GC22      | `prometheus.txt` có `rabbitmq_identity_info` với nhãn `rabbitmq_node`                         |

GC13 (thứ tự trang khi broker đang đổi) và phần "mỗi lần gọi rơi vào node khác" của GC22 cần kịch bản tạo và xoá queue trong lúc đọc, nên chạy tay theo kịch bản trong `tools/README.md`.

## API công khai

CLI dùng gói theo bốn bước: `createReader`, `identify` (in dòng thông tin đầu), `read`, rồi đưa `raw` cho `model.buildActual`.

```ts
export function createReader(
  target: BrokerTarget,
  deps: ReaderDeps,
): Result<BrokerReader, { diag: 'CX4' | 'CX10'; detail: string }>;

export interface ReaderDeps {
  readonly toolVersion: string; // cho User-Agent
  readonly clock?: () => Instant;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly random?: () => number; // jitter
  readonly dispatcher?: Dispatcher; // chỉ dùng trong test
}

export interface ReadOptions {
  readonly maxRps?: number; // 1–20, mặc định 5
  readonly concurrency?: number; // 1–4, mặc định 2
  readonly signal?: AbortSignal;
  readonly onEvent?: (e: ReadEvent) => void;
}

export interface BrokerReader {
  identify(plan: ReadPlan, opts: ReadOptions): Promise<IdentifyOutcome>;
  read(
    plan: ReadPlan,
    identified: Identified,
    opts: ReadOptions,
  ): Promise<ReadOutcome>;
  stats(): { requests: number; retries: number; bytes: number; rpsNow: number };
  close(): Promise<void>;
}

export type IdentifyOutcome =
  | { status: 'ok'; identified: Identified }
  | {
      status: 'failed';
      diag: 'CX1' | 'CX2' | 'CX3' | 'CX8' | 'CX9';
      detail: string;
    }
  | { status: 'aborted' };

export interface Identified {
  readonly raw: Pick<
    RawResponses,
    'overview' | 'whoami' | 'featureFlags' | 'nodes'
  >;
  readonly sources: Record<
    'http.list' | 'http.stats' | 'prometheus',
    SourceState
  >;
  readonly version: Version | null;
  readonly capability: CapabilityLookup; // từ spec.capabilitiesFor
  readonly estimate: { requests: number; seconds: number };
  readonly startedAt: Instant;
}

export type ReadOutcome =
  | {
      status: 'complete';
      raw: RawResponses;
      readStartedAt: Instant;
      readFinishedAt: Instant;
    }
  | { status: 'aborted'; pagesRead: number; pagesTotal: number };
```

`identify` trả CX8 khi `capabilitiesFor` nói `unsupported`. `read` không có trạng thái `failed`: một endpoint hỏng thành `RawResult` lỗi bên trong `raw`, đúng quyết định "lỗi là dữ liệu". Không hàm nào ném ngoại lệ vì broker hay mạng; ngoại lệ chỉ dành cho lỗi lập trình, ví dụ gọi `read` sau `close`.

## Test bắt buộc và định nghĩa hoàn thành

Test đơn vị chạy trên một management API giả lập trong tiến trình (`tools/mock-mgmt.ts`): trả response theo kịch bản cho từng đường dẫn, có độ trễ, mã lỗi, đóng socket, chứng chỉ tự ký. Test tích hợp chạy trên broker thật của ma trận CI.

| Nhóm          | Test                                                                                                         | Nghiệm thu                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| URL           | Có path prefix; có `/api` cuối; có `/` cuối; không cổng; có `user:pass@`; scheme `amqp`; có query; host IPv6 | Đúng gốc chuẩn hoá, hoặc đúng CX4, CX10                                                                     |
| Phân trang    | `page_count` tăng giữa chừng; chạm trần an toàn; endpoint trả mảng; một trang hỏng sau ba lượt               | Đọc đủ trang mới; `pagination_runaway`; một trang kèm `warning`; cả endpoint thành lỗi, không giữ trang nào |
| Phân loại lỗi | Mỗi dòng của bảng lỗi                                                                                        | Đúng thử lại hay không, đúng `RawResult`, đúng CX                                                           |
| Thử lại       | Đồng hồ giả, `random` cố định; `Retry-After` dạng giây và dạng ngày HTTP                                     | Đúng số lượt, đúng thời gian chờ, trần 30 giây                                                              |
| Throttle      | 200 request; phản hồi chậm 3 giây; chuỗi 10 phản hồi nhanh                                                   | Không cửa sổ 1 giây nào vượt `maxRps`; tốc độ giảm một nửa; tốc độ tăng 1                                   |
| Nguồn         | Mọi tổ hợp có hay không `message_stats`, `churn_rates`; Prometheus 200, 401, body rác, quá 2 giây            | Đúng bảng phát hiện nguồn                                                                                   |
| Huỷ           | Huỷ ở từng pha và giữa lúc chờ backoff                                                                       | `aborted`; bộ đếm của mock không nhận thêm request nào                                                      |
| CL1           | Ba tầng như mục bảo mật                                                                                      | Ba test xanh                                                                                                |
| Bí mật        | Hook toàn cục quét mọi log, sự kiện, lỗi, `RawResponses` của toàn bộ bộ test                                 | Không có mật khẩu, không có base64 của `user:pass`                                                          |
| Sự kiện       | Thứ tự phát; callback ném lỗi                                                                                | Đúng thứ tự; việc đọc không bị ảnh hưởng                                                                    |
| Ước tính      | Broker giả 10.000 queue, 3 vhost                                                                             | Đúng công thức                                                                                              |
| Tích hợp      | Ma trận 3.13, 4.2, 4.3 × 4 biến thể, bằng user `monitoring`                                                  | `record-raw` chạy hết; `check-assumptions` cho kết quả khớp kỳ vọng của từng biến thể                       |
| Gây lỗi       | Toxiproxy: trễ 3 giây, ngắt kết nối giữa chừng                                                               | Tốc độ tự giảm; thử lại rồi thành công                                                                      |

**Định nghĩa hoàn thành.**

- [ ] Mọi test ở bảng trên xanh trên Node 20 và 22; phủ nhánh ≥ 90% cho `retry.ts`, `throttle.ts`, `paginate.ts`.
- [ ] Bản ghi thô của 3.13, 4.2, 4.3 (đủ 4 biến thể) và Amazon MQ 3.13 đã che, đã commit vào `fixtures/raw/`.
- [ ] Bảng `check-assumptions` của các bản ghi đó đã dán vào mục giả định của tab này.
- [ ] Đọc broker 10.000 queue ở 5 request mỗi giây xong trong ≤ 3 phút.
- [ ] Phụ thuộc lúc chạy chỉ có `spec`, `model`, `undici`.

## Thay đổi và giả định

Bảy thay đổi dưới đây ảnh hưởng tới các tab trước; ba thay đổi về kiểu ở tab model đã được sửa trực tiếp.

| #   | Thay đổi                                                                                                       | Tab bị ảnh hưởng                            |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | `Counter` có thêm `scope`; với bộ đếm, `http.stats` được ưu tiên trước `prometheus` vì chỉ nó gộp toàn cluster | Model: kiểu `Counter`, bảng ánh xạ (đã sửa) |
| 2   | `RawResult` thêm `kind` cho `network_error`, `note` cho `http_error`, `reason` cho `not_attempted`             | Model: API công khai (đã sửa)               |
| 3   | Model xuất `planRead`, `ReadPlan`, `EndpointRead`                                                              | Model: API công khai                        |
| 4   | Prometheus lấy toàn bộ `/metrics` một lần thay vì ngắt sau dòng đầu; cổng 15691 hoặc 15692 theo scheme         | Tab v0.1, mục BrokerReader                  |
| 5   | Mã chẩn đoán mới CX9, CX10                                                                                     | Spec: `codes.json`, i18n                    |
| 6   | Binding và consumer đọc theo từng vhost khi broker có ≤ 20 vhost                                               | Tab v0.1, mục BrokerReader                  |
| 7   | Cờ `--max-rps`, `--concurrency` cho CLI                                                                        | Tab chính, mục bề mặt lệnh                  |

| Mã   | Giả định                                                                                              | Kiểm ở                              |
| ---- | ----------------------------------------------------------------------------------------------------- | ----------------------------------- |
| GC20 | Tham số `columns` nhận tên trường lồng nhau bằng dấu chấm, ví dụ `message_stats.publish_details.rate` | `check-assumptions`                 |
| GC21 | Có `message_stats` và `churn_rates` trong overview khi và chỉ khi thống kê bật                        | `check-assumptions`                 |
| GC22 | Endpoint Prometheus chỉ có số liệu của node đang trả lời                                              | `check-assumptions` và kịch bản tay |
| GC23 | `page_size=500` được chấp nhận trên mọi phiên bản hỗ trợ                                              | Ma trận CI                          |
| GC24 | `sort=name` được giữ đúng qua các trang                                                               | Kịch bản tay của GC13               |

### Kết quả kiểm giả định

Chạy `check-assumptions` trên bản ghi của ma trận `SUT/` (RabbitMQ 3.13, 4.0, 4.2, 4.3 × 4 biến thể), ngày 4 tháng 10 năm 2026. ✓ đạt, ✗ không đạt, — không áp dụng.

| Bản ghi                | GC1 | GC2 | GC8, GC21 | GC9 | GC12 | GC15 | GC17 | GC20 | GC22 |
| ---------------------- | --- | --- | --------- | --- | ---- | ---- | ---- | ---- | ---- |
| rabbitmq-3.13/full     | ✓   | —   | ✓         | ✓   | ✓    | ✓    | ✓    | ✓    | ✓    |
| rabbitmq-3.13/listonly | ✓   | ✗   | ✓         | ✗   | ✗    | ✓    | ✓    | ✓    | —    |
| rabbitmq-3.13/noprom   | ✓   | —   | ✓         | ✓   | ✓    | ✓    | ✓    | ✓    | —    |
| rabbitmq-3.13/nostats  | ✓   | ✗   | ✓         | ✗   | ✗    | ✓    | ✓    | ✓    | ✓    |
| rabbitmq-4.0/full      | ✓   | —   | ✓         | ✓   | ✓    | ✓    | —    | ✓    | ✓    |
| rabbitmq-4.0/listonly  | ✓   | ✗   | ✓         | ✗   | ✗    | ✓    | —    | ✓    | —    |
| rabbitmq-4.0/noprom    | ✓   | —   | ✓         | ✓   | ✓    | ✓    | —    | ✓    | —    |
| rabbitmq-4.0/nostats   | ✓   | ✗   | ✓         | ✗   | ✗    | ✓    | —    | ✓    | ✓    |
| rabbitmq-4.2/full      | ✓   | —   | ✓         | ✓   | ✓    | ✓    | —    | ✓    | ✓    |
| rabbitmq-4.2/listonly  | ✓   | ✗   | ✓         | ✗   | ✓    | ✓    | —    | ✓    | —    |
| rabbitmq-4.2/noprom    | ✓   | —   | ✓         | ✓   | ✓    | ✓    | —    | ✓    | —    |
| rabbitmq-4.2/nostats   | ✓   | ✗   | ✓         | ✗   | ✓    | ✓    | —    | ✓    | ✓    |
| rabbitmq-4.3/full      | ✓   | —   | ✓         | ✓   | ✓    | ✓    | —    | ✓    | ✓    |
| rabbitmq-4.3/listonly  | ✓   | —   | ✓         | ✗   | ✓    | ✓    | —    | ✓    | —    |
| rabbitmq-4.3/noprom    | ✓   | —   | ✓         | ✓   | ✓    | ✓    | —    | ✓    | —    |
| rabbitmq-4.3/nostats   | ✓   | —   | ✓         | ✗   | ✓    | ✓    | —    | ✓    | ✓    |

- **GC2 không đạt** trên 3.13, 4.0, 4.2: thống kê tắt thì `/api/channels` trả 400 (`Stats in management UI are disabled on this node`), không có `confirm` nào để đọc. Trên 4.3, `/api/channels` trả 200 với danh sách rỗng (ô "—"), xem dưới.
- **GC9 không đạt** khi thống kê tắt, mọi phiên bản: `/api/nodes` chỉ còn `name`, `running`, `type`, `being_drained`; mất `applications`, `uptime`, `mem_limit`.
- **GC12 không đạt** trên 3.13, 4.0 khi thống kê tắt: `/api/queues` không có `effective_policy_definition`.
- **4.3, thống kê tắt**: `/api/connections` và `/api/channels` trả 200 với danh sách rỗng, trong khi `object_totals.connections` vẫn đếm đủ; `object_totals` không còn `channels`, `consumers` (mọi phiên bản). Nếu ingest tin danh sách rỗng, đây là xanh im lặng mà CL2 cấm. Đã chặn ở model: bảng năng lực có `statsOffLists`, và mọi danh sách rỗng trong khi `object_totals` đếm > 0 thành `unknown`.
- GC13, GC22 phần "mỗi lần gọi rơi vào node khác", GC23, GC24 cần kịch bản tay hoặc cluster nhiều node; ma trận chỉ có broker một node.
