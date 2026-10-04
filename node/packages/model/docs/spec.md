# Spec @ochotona/model v0.1

Oct 4, 2026 · @Max Darius

## Phạm vi và quyết định

`@ochotona/model` là lõi thuần của Ocho: nó định nghĩa broker trông như thế nào (`Actual`), người dùng muốn gì (`Desired`), và tính giá trị hiệu lực, chuẩn hoá, diff giữa hai thứ đó. Gói không có I/O, không đọc đồng hồ, không gọi mạng; mọi thứ khác trong Ocho đứng trên nó.

| Gói này làm | Gói này không làm |
| --- | --- |
| Kiểu dữ liệu của `Actual`, `Desired`, `Topology`, `Observed` | Gọi HTTP (việc của `@ochotona/broker`) |
| Ánh xạ thuần từ JSON của HTTP API và văn bản Prometheus sang `Actual` (`ingest/`) | Đọc YAML từ đĩa (việc của `@ochotona/compiler`) |
| Phân giải giá trị hiệu lực từ argument, policy, operator policy, mặc định | Chấm luật (việc của `@ochotona/rules`) |
| Kiểm tra `ocho.yaml` đã được parse thành object | In ra terminal |
| Gán đối tượng vào luồng, tính dung sai | Quyết định mức nghiêm trọng |
| Chuẩn hoá topology, diff, ảnh chụp | — |

Chiều phụ thuộc: `spec` ← `model` ← `rules`, `broker`, `compiler` ← `cli`. Model chỉ phụ thuộc `@ochotona/spec` (bảng năng lực theo phiên bản) và `node:crypto` (băm khi che thông tin ảnh chụp).

**Năm quyết định.**

1. **Bất biến.** Mọi kiểu là `readonly`, dựng một lần bằng `buildActual` hoặc `buildDesired`, không sửa tại chỗ. Luật và renderer chỉ đọc.
2. **`Observed` ở hai cấp.** Mỗi bộ sưu tập (queue, exchange, binding…) là `Observed<readonly T[]>`, vì endpoint nào cũng có thể bị 403 hoặc 404. Trong một phần tử, chỉ những trường đến từ nguồn khác với bộ sưu tập mới là `Observed` (thống kê, giá trị hiệu lực). Trường định nghĩa như tên, loại, argument là giá trị trần.
3. **Phân giải policy chuyển vào model.** Tab v0.1 đặt nó ở `@ochotona/broker`. Nhưng `Desired` cũng cần đúng thuật toán đó để `explain` và `plan` nói cùng một ngôn ngữ, nên nó phải nằm ở gói cả hai cùng dùng.
4. **Ánh xạ HTTP nằm trong model.** Hàm thuần `ingest.*` nhận JSON thô, trả phần tử của `Actual`. Nhờ vậy ánh xạ được test bằng JSON đã ghi lại từ broker thật, không cần mạng.
5. **Không đồng hồ.** Hàm cần thời điểm hiện tại nhận `now: Instant` làm tham số; test tất định.

## Quy ước chung

Mọi giá trị trong model có một đơn vị và một biểu diễn duy nhất; chuyển đổi chỉ xảy ra ở `ingest/`, không bao giờ trong luật hay renderer.

| Loại | Kiểu TS | Biểu diễn | Chuyển từ API |
| --- | --- | --- | --- |
| Thời điểm | `Instant` (branded string) | ISO 8601 UTC, có mili-giây, đuôi `Z`: `2026-10-04T01:22:10.123Z` | `connected_at` là mili-giây Unix → đổi; chuỗi ngày giờ của API → chuẩn hoá về UTC |
| Khoảng thời gian | `Seconds` (branded number) | Giây, số thực ≥ 0 | `uptime` là mili-giây → chia 1000; `timeout` của connection đã là giây |
| Số đếm | `number` | Số nguyên ≥ 0, ≤ `Number.MAX_SAFE_INTEGER` | Vượt trần thì trường thành `unknown: error` |
| Tốc độ | `Rate` | `{ perSecond: number; windowSeconds: number }` | `*_details.rate`; cửa sổ mặc định 5 giây của management |
| Byte | `number` | Số nguyên ≥ 0 | Giữ nguyên |
| Phiên bản | `Version` | `{ major, minor, patch, pre?: string, raw: string }` | Chuỗi `3.13.7`, `4.3.0-rc.1`; xem dưới |
| Giá trị argument, policy | `ArgValue` | JSON: chuỗi, số, boolean, `null`, mảng, object | Giữ nguyên kiểu, không ép chuỗi số thành số |

**Tên.** Vhost, tên queue, exchange, policy là chuỗi UTF-8 tuỳ ý, có thể chứa `/`, dấu cách, dấu chấm. Không trim, không đổi hoa thường; so sánh theo từng code unit.

**`null` khác `unknown`.** `null` nghĩa là đã biết là không có (queue không có policy nào áp). `Observed` ở trạng thái `unknown` nghĩa là không biết. API trả chuỗi rỗng `""` cho trường policy khi không có policy thì `ingest` đổi thành `null`.

**Phiên bản.** Parse bằng `^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$`; thiếu patch thì là 0; không khớp thì `unknown: error`. So sánh theo semver: bản có `pre` nhỏ hơn bản phát hành cùng số. Phiên bản của cluster là phiên bản **nhỏ nhất** trong các node đọc được, vì hành vi an toàn của cluster bị giới hạn bởi node cũ nhất; nếu không đọc được node thì dùng `rabbitmq_version` của overview.

```ts
export type Instant = string & { readonly __brand: 'Instant' };
export type Seconds = number & { readonly __brand: 'Seconds' };
export interface Rate { readonly perSecond: number; readonly windowSeconds: number }
export interface Version {
  readonly major: number; readonly minor: number; readonly patch: number;
  readonly pre?: string; readonly raw: string;
}
export type ArgValue =
  | string | number | boolean | null
  | readonly ArgValue[] | { readonly [k: string]: ArgValue };
```

## `Observed`

`Observed<T>` là kiểu duy nhất cho mọi giá trị đọc hoặc suy ra từ broker. Trạng thái `known` mang nguồn gốc đầy đủ; trạng thái `unknown` mang lý do có cấu trúc, đủ để renderer in câu "chưa kiểm vì…" mà không cần biết luật nào gọi.

```ts
export type SourceId =
  | 'http.list' | 'http.stats' | 'prometheus'
  | 'derived';                                   // tính trong model, ví dụ effective

export interface Provenance {
  readonly source: SourceId;
  readonly path: string;        // 'http:/api/queues#messages_ready'
                                // 'prom:rabbitmq_global_messages_unroutable_dropped_total'
                                // 'derived:effective'
  readonly observedAt: Instant; // lúc trang chứa giá trị được trả về
}

export type Observed<T> = Known<T> | Unknown;
export interface Known<T> { readonly state: 'known'; readonly value: T; readonly prov: Provenance }
export interface Unknown {
  readonly state: 'unknown'; readonly reason: UnknownReason;
  readonly source: SourceId; readonly path: string;
}

export type UnknownReason =
  | { readonly kind: 'source_unavailable' }
  | { readonly kind: 'forbidden'; readonly status: 401 | 403 }
  | { readonly kind: 'endpoint_missing'; readonly status: 404 }
  | { readonly kind: 'field_absent' }
  | { readonly kind: 'model_mismatch'; readonly detail: string }
  | { readonly kind: 'tie'; readonly policies: readonly string[] }
  | { readonly kind: 'regex_unsupported'; readonly policy: string; readonly pattern: string }
  | { readonly kind: 'inconsistent_read'; readonly detail: string }
  | { readonly kind: 'depends_on'; readonly path: string; readonly reason: UnknownReason }
  | { readonly kind: 'error'; readonly message: string };
```

`depends_on` dùng khi một giá trị suy ra không tính được vì đầu vào của nó `unknown`, ví dụ effective của queue không tính được vì danh sách policy bị 403. Lý do gốc luôn giữ được qua chuỗi `depends_on`, nên renderer luôn chỉ được nguyên nhân thật.

**Hàm tiện ích, đủ và chỉ đủ những hàm này.**

| Hàm | Kiểu | Hành vi |
| --- | --- | --- |
| `known(v, prov)` | `Known<T>` | Tạo giá trị đã biết |
| `unknown(reason, source, path)` | `Unknown` | Tạo giá trị chưa biết |
| `isKnown(o)` | type guard | — |
| `map(o, f)` | `Observed<U>` | Giữ `prov`; `unknown` đi qua nguyên vẹn |
| `all([o1, o2, …])` | `Observed<[T1, T2, …]>` | `unknown` đầu tiên theo thứ tự tham số, bọc bằng `depends_on` |
| `firstKnown(o1, o2, …)` | `Observed<T>` | Giá trị `known` đầu tiên; không có thì trả `unknown` của tham số đầu |
| `derive(inputs, f, path)` | `Observed<U>` | `all` rồi `f`; `prov.source = 'derived'`, `observedAt` = thời điểm muộn nhất của các đầu vào |
| `rootReason(u)` | `UnknownReason` | Bóc hết `depends_on` |
| `displayOr(o, text)` | `string` | Chỉ để in; quy tắc lint cấm gọi hàm này trong `@ochotona/rules` |

Không có `valueOr` hay hàm nào biến `unknown` thành một giá trị mặc định. Đó là đúng con đường CL2 cấm.

## Định danh đối tượng

Mỗi đối tượng có một `ObjectRef` có cấu trúc và một khoá chuỗi chuẩn `refKey`. Khoá chuẩn là thứ duy nhất được dùng làm khoá Map, để sắp xếp, để khớp miễn trừ, và làm `object.id` trong JSON đầu ra.

```ts
export type ObjectRef =
  | { readonly kind: 'broker' }
  | { readonly kind: 'node' | 'vhost' | 'connection' | 'channel' | 'flow' | 'family';
      readonly name: string }
  | { readonly kind: 'exchange' | 'queue' | 'policy' | 'operator_policy';
      readonly vhost: string; readonly name: string }
  | { readonly kind: 'binding'; readonly vhost: string; readonly source: string;
      readonly destinationType: 'queue' | 'exchange'; readonly destination: string;
      readonly routingKey: string; readonly argsKey: string }
  | { readonly kind: 'consumer'; readonly channel: string; readonly tag: string };
```

**`refKey`.** Nối `kind` với từng thành phần theo đúng thứ tự khai báo ở trên, mỗi thành phần qua `encodeURIComponent`, ngăn cách bằng `:`.

| Đối tượng | `refKey` |
| --- | --- |
| Queue `request_clamav_q` ở vhost `/` | `queue:%2F:request_clamav_q` |
| Binding từ `scan.request` tới queue đó, key `request_clamav`, không argument | `binding:%2F:scan.request:queue:request_clamav_q:request_clamav:` |
| Consumer tag `ctag-1` trên channel `10.0.0.5:51234 -> 10.0.0.9:5672 (1)` | `consumer:10.0.0.5%3A51234%20-%3E%2010.0.0.9%3A5672%20(1):ctag-1` |

Sắp xếp theo `refKey` bằng so sánh code unit (`<`), không dùng `localeCompare`, để kết quả không đổi theo locale của máy.

**`argsKey` của binding.** Chuỗi rỗng khi binding không có argument; nếu có thì 12 ký tự hex đầu của SHA-256 trên `stableJson(arguments)`. Không dùng `properties_key` của API, vì phía `Desired` không có trường đó và hai phía phải tính khoá bằng cùng một hàm.

**`stableJson`.** JSON không khoảng trắng, khoá object sắp tăng dần theo code unit ở mọi cấp, mảng giữ thứ tự, số in theo `JSON.stringify`.

**`refLabel`.** Dạng đọc cho người: `queue request_clamav_q`, thêm `(vhost billing)` khi vhost khác `/`. Chỉ dùng để in, không bao giờ dùng để so sánh.

**Chọn đối tượng trong `ocho.yaml`.** Dạng đầy đủ là object `{ kind, vhost, name }`. Dạng rút gọn là chuỗi `"<kind> <name>"`: token đầu là `kind`, phần còn lại sau đúng một dấu cách là `name` nguyên văn, vhost mặc định `/`. Tên chứa dấu cách vẫn đúng vì phần còn lại được lấy nguyên.

## `Actual`

`Actual` là ảnh của broker tại một khoảng thời gian đọc. Mọi bộ sưu tập là `Observed`; mọi trường đến từ nguồn khác với bộ sưu tập của nó là `Observed` riêng. Kiểu dưới đây là đầy đủ cho v0.1; thêm trường là thay đổi minor, đổi nghĩa trường là thay đổi major của `ocho.snapshot`.

```ts
export interface Actual {
  readonly meta: ActualMeta;
  readonly broker: BrokerInfo;
  readonly nodes: Observed<readonly Node[]>;
  readonly vhosts: Observed<readonly Vhost[]>;
  readonly exchanges: Observed<readonly Exchange[]>;
  readonly queues: Observed<readonly Queue[]>;
  readonly bindings: Observed<readonly Binding[]>;
  readonly policies: Observed<readonly Policy[]>;
  readonly operatorPolicies: Observed<readonly Policy[]>;
  readonly connections: Observed<readonly Connection[]>;
  readonly channels: Observed<readonly Channel[]>;
  readonly consumers: Observed<readonly Consumer[]>;
  readonly whoami: Observed<Principal>;
  readonly anomalies: readonly ReadAnomaly[];           // mục bất biến
}

export interface ActualMeta {
  readonly contextName: string;
  readonly readStartedAt: Instant;
  readonly readFinishedAt: Instant;
  readonly scope: { readonly vhosts: readonly string[] | 'all' };
  readonly sources: Readonly<Record<'http.list' | 'http.stats' | 'prometheus', SourceState>>;
  readonly fromSnapshot: { readonly takenAt: Instant; readonly file: string } | null;
  readonly consistency: Readonly<Record<string, 'ok' | 'degraded'>>;   // theo bộ sưu tập
}
export type SourceState = 'ok' | 'unavailable' | 'forbidden' | 'not_attempted';

export interface BrokerInfo {
  readonly productName: Observed<string>;
  readonly version: Observed<Version>;                  // phiên bản nhỏ nhất của các node
  readonly clusterName: Observed<string>;
  readonly metadataStore: Observed<'mnesia' | 'khepri'>;
  readonly featureFlags: Observed<Readonly<Record<string, 'enabled' | 'disabled' | 'unavailable'>>>;
  readonly deprecatedInUse: Observed<readonly string[]>;
  readonly totals: Observed<Totals>;
  readonly counters: {
    readonly unroutableDropped: Observed<Counter>;
    readonly unroutableReturned: Observed<Counter>;
  };
  readonly churn: Observed<Churn>;
}
export interface Totals {
  readonly queues: number; readonly exchanges: number; readonly connections: number;
  readonly channels: number; readonly consumers: number;
}
export interface Counter {
  readonly count: number;
  readonly completeSince: Instant;   // bộ đếm chắc chắn đầy đủ kể từ thời điểm này
}
export interface Churn {
  readonly connectionCreated: Rate; readonly connectionClosed: Rate;
  readonly queueDeclared: Rate; readonly queueCreated: Rate; readonly queueDeleted: Rate;
}

export interface Node {
  readonly ref: { kind: 'node'; name: string };
  readonly running: boolean;
  readonly version: Observed<Version>;
  readonly memLimitBytes: Observed<number>;
  readonly diskFreeLimitBytes: Observed<number>;
  readonly uptime: Observed<Seconds>;
}

export interface Vhost {
  readonly ref: { kind: 'vhost'; name: string };
  readonly defaultQueueType: Observed<QueueType | null>;
}

export type QueueType = 'classic' | 'quorum' | 'stream';
export type ArgMap = Readonly<Record<string, ArgValue>>;

export interface Exchange {
  readonly ref: { kind: 'exchange'; vhost: string; name: string };
  readonly type: string;                                // direct, topic, fanout, headers, plugin
  readonly durable: boolean;
  readonly autoDelete: boolean;
  readonly internal: boolean;
  readonly arguments: ArgMap;
  readonly appliedPolicy: Observed<string | null>;
  readonly effective: Observed<Effective>;
  readonly effectiveCheck: EffectiveCheck;
}

export interface Queue {
  readonly ref: { kind: 'queue'; vhost: string; name: string };
  readonly type: QueueType;
  readonly durable: boolean;
  readonly autoDelete: boolean;
  readonly exclusive: boolean;
  readonly arguments: ArgMap;
  readonly appliedPolicy: Observed<string | null>;
  readonly appliedOperatorPolicy: Observed<string | null>;
  readonly brokerEffectivePolicy: Observed<ArgMap>;     // effective_policy_definition
  readonly effective: Observed<Effective>;
  readonly effectiveCheck: EffectiveCheck;
  readonly leader: Observed<string>;
  readonly members: Observed<readonly string[]>;        // chỉ quorum, stream
  readonly consumers: Observed<number>;
  readonly ready: Observed<number>;
  readonly unacked: Observed<number>;
  readonly publishRate: Observed<Rate>;
  readonly deliverRate: Observed<Rate>;
  readonly redeliverRate: Observed<Rate>;
}

export interface Binding {
  readonly ref: Extract<ObjectRef, { kind: 'binding' }>;
  readonly arguments: ArgMap;
}

export type ApplyTo = 'all' | 'exchanges' | 'queues' | 'classic_queues' | 'quorum_queues' | 'streams';
export interface Policy {
  readonly ref: { kind: 'policy' | 'operator_policy'; vhost: string; name: string };
  readonly pattern: string;
  readonly applyTo: ApplyTo;
  readonly priority: number;
  readonly definition: ArgMap;
}

export interface Connection {
  readonly ref: { kind: 'connection'; name: string };
  readonly vhost: string;
  readonly user: string;
  readonly protocol: string;                            // 'AMQP 0-9-1', 'MQTT 5-0'
  readonly heartbeat: Observed<Seconds>;                // 0 = tắt
  readonly connectionName: Observed<string | null>;
  readonly clientProduct: Observed<string | null>;
  readonly peerHost: Observed<string>;
  readonly connectedAt: Observed<Instant>;
  readonly channelCount: Observed<number>;
}

export interface Channel {
  readonly ref: { kind: 'channel'; name: string };
  readonly connection: string;
  readonly number: number;
  readonly vhost: string;
  readonly user: string;
  readonly confirm: Observed<boolean>;
  readonly prefetch: Observed<number>;
  readonly globalPrefetch: Observed<number>;
  readonly consumerCount: Observed<number>;
  readonly publishCount: Observed<number>;              // từ lúc channel mở
  readonly publishRate: Observed<Rate>;
}

export interface Consumer {
  readonly ref: { kind: 'consumer'; channel: string; tag: string };
  readonly queue: { kind: 'queue'; vhost: string; name: string };
  readonly connection: string;
  readonly ackRequired: boolean;
  readonly prefetch: number;
  readonly exclusive: boolean;
  readonly active: Observed<boolean>;
}

export interface Principal { readonly name: string; readonly tags: readonly string[] }
```

**`Counter.completeSince`.** Bộ đếm toàn cluster là tổng bộ đếm của các node, và bộ đếm của một node về 0 khi node khởi động lại. Vì vậy `completeSince = readStartedAt − min(uptime của các node đang chạy)`: trước thời điểm đó có thể đã có mất mà bộ đếm không còn giữ. Không đọc được `uptime` thì `completeSince` là `unknown: depends_on`, và cả `Counter` thành `unknown`, vì một con số không có mốc là một con số không kiểm chứng được (A13).

## Ánh xạ từ broker

Mỗi trường của `Actual` có đúng một đường dẫn nguồn, hoặc một danh sách nguồn theo thứ tự ưu tiên. `ingest` không suy diễn ngoài những gì bảng này ghi; trường nào bảng không ghi thì không tồn tại trong model.

**Quy tắc chọn lý do khi một trường vắng.** Trường thuộc nhóm thống kê (cột Nguồn là `http.stats`) mà `meta.sources['http.stats']` khác `ok` thì lý do là `source_unavailable`. Còn lại, endpoint trả 200 nhưng phần tử thiếu trường thì `field_absent`. Endpoint trả 401 hoặc 403 thì cả bộ sưu tập là `forbidden`; 404 thì `endpoint_missing`.

**Broker, node, vhost, người dùng hiện tại.**

| Trường model | Nguồn | Đường dẫn | Chuyển đổi |
| --- | --- | --- | --- |
| `broker.productName` | http.list | `/api/overview` `product_name` | — |
| `broker.version` | derived | Nhỏ nhất của `nodes[].version`; nếu không có thì `/api/overview` `rabbitmq_version` | Parse theo mục quy ước |
| `broker.clusterName` | http.list | `/api/overview` `cluster_name` | — |
| `broker.totals` | http.list | `/api/overview` `object_totals.{queues,exchanges,connections,channels,consumers}` | — |
| `broker.counters.unroutableDropped` | prometheus, rồi http.stats | `rabbitmq_global_messages_unroutable_dropped_total` cộng mọi series; rồi `/api/overview` `message_stats.drop_unroutable` | `completeSince` theo mục `Actual` |
| `broker.counters.unroutableReturned` | prometheus, rồi http.stats | `rabbitmq_global_messages_unroutable_returned_total`; rồi `message_stats.return_unroutable` | Như trên |
| `broker.churn` | http.stats | `/api/overview` `churn_rates.{connection_created,connection_closed,queue_declared,queue_created,queue_deleted}_details.rate` | `Rate`, cửa sổ 5 giây |
| `broker.featureFlags` | http.list | `/api/feature-flags` `[].{name,state}` | — |
| `broker.metadataStore` | derived | `featureFlags.khepri_db` | `enabled` thì `khepri`, còn lại `mnesia` |
| `broker.deprecatedInUse` | http.list | `/api/deprecated-features/used` `[].name` | — |
| `nodes[].ref.name`, `running` | http.list | `/api/nodes` `name`, `running` | — |
| `nodes[].version` | http.list | `/api/nodes` phần tử `applications` có `name` = `rabbit`, trường `version` | Giả định GC9 |
| `nodes[].memLimitBytes`, `diskFreeLimitBytes` | http.list | `mem_limit`, `disk_free_limit` | — |
| `nodes[].uptime` | http.list | `uptime` | mili-giây → giây |
| `vhosts[].defaultQueueType` | http.list | `/api/vhosts` `default_queue_type` | Vắng hoặc `undefined` → `null` |
| `whoami` | http.list | `/api/whoami` `name`, `tags` | `tags` là chuỗi cách bởi dấu phẩy ở bản cũ, mảng ở bản mới → luôn thành mảng |

**Exchange, queue, binding, policy.** Endpoint danh sách gọi với `page`, `page_size=500`, `columns=` đúng các cột trong bảng.

| Trường model | Nguồn | Đường dẫn | Chuyển đổi |
| --- | --- | --- | --- |
| `exchanges[]` lõi | http.list | `/api/exchanges` `vhost`, `name`, `type`, `durable`, `auto_delete`, `internal`, `arguments` | — |
| `exchanges[].appliedPolicy` | http.list | `policy` | Vắng hoặc `""` → `null` |
| `queues[]` lõi | http.list | `/api/queues` `vhost`, `name`, `durable`, `auto_delete`, `exclusive`, `arguments` | — |
| `queues[].type` | http.list | `type`; vắng thì `arguments['x-queue-type']`; vẫn vắng thì `classic` | Giá trị ngoài ba loại → bỏ queue, thêm bất thường `unsupported_type` |
| `queues[].appliedPolicy`, `appliedOperatorPolicy` | http.list | `policy`, `operator_policy` | Vắng hoặc `""` → `null` |
| `queues[].brokerEffectivePolicy` | http.list | `effective_policy_definition` | Giả định GC12 |
| `queues[].leader`, `members` | http.list | `node`, `members` | `members` chỉ với quorum, stream |
| `queues[].consumers` | http.list | `consumers` | — |
| `queues[].ready`, `unacked` | http.stats | `messages_ready`, `messages_unacknowledged` | — |
| `queues[].publishRate`, `deliverRate`, `redeliverRate` | http.stats | `message_stats.{publish,deliver_get,redeliver}_details.rate` | `Rate` |
| `bindings[]` | http.list | `/api/bindings` `vhost`, `source`, `destination`, `destination_type`, `routing_key`, `arguments` | Bỏ binding có `source` = `""` (binding ngầm của exchange mặc định); tính `argsKey` |
| `policies[]`, `operatorPolicies[]` | http.list | `/api/policies`, `/api/operator-policies` `vhost`, `name`, `pattern`, `apply-to`, `priority`, `definition` | `apply-to` vắng → `all`; `priority` vắng → 0 |

**Connection, channel, consumer.**

| Trường model | Nguồn | Đường dẫn | Chuyển đổi |
| --- | --- | --- | --- |
| `connections[]` lõi | http.list | `/api/connections` `name`, `vhost`, `user`, `protocol` | — |
| `connections[].heartbeat` | http.list | `timeout` | Giây; 0 nghĩa là tắt |
| `connections[].connectionName`, `clientProduct` | http.list | `client_properties.connection_name`, `client_properties.product` | Vắng → `null` (client không gửi là thông tin đã biết, không phải `unknown`) |
| `connections[].peerHost` | http.list | `peer_host` | — |
| `connections[].connectedAt` | http.list | `connected_at` | mili-giây Unix → `Instant` |
| `connections[].channelCount` | http.list | `channels` | — |
| `channels[]` lõi | http.list | `/api/channels` `name`, `connection_details.name`, `number`, `vhost`, `user` | — |
| `channels[].confirm` | http.list | `confirm` | Giả định GC2 |
| `channels[].prefetch`, `globalPrefetch`, `consumerCount` | http.list | `prefetch_count`, `global_prefetch_count`, `consumer_count` | — |
| `channels[].publishCount`, `publishRate` | http.stats | `message_stats.publish`, `message_stats.publish_details.rate` | Channel chưa từng publish thì API không có `message_stats.publish`: khi `http.stats` là `ok`, vắng nghĩa là 0, không phải `unknown` |
| `consumers[]` | http.list | `/api/consumers` `consumer_tag`, `channel_details.name`, `channel_details.connection_name`, `queue.{vhost,name}`, `ack_required`, `prefetch_count`, `exclusive` | — |
| `consumers[].active` | http.list | `active` | Vắng trên bản cũ → `field_absent` |

Dòng `publishCount` là ngoại lệ duy nhất của quy tắc chọn lý do, và nó phải có fixture riêng: một channel chỉ consume, thống kê bật, phải ra `publishCount = 0` chứ không phải `unknown`. Nếu sai chỗ này, R1 sẽ `not_checked` trên mọi channel consume và báo cáo đầy nhiễu.

## `Effective`

`Effective` trả lời cho mỗi khoá: giá trị đang có hiệu lực là gì, đến từ lớp nào, ai đặt, và giá trị nào đã thua. Luật chỉ đọc `value`; `explain` đọc toàn bộ.

```ts
export type Layer =
  | 'argument' | 'policy' | 'operator_policy' | 'vhost_default' | 'builtin_default';

export interface EffectiveEntry {
  readonly value: ArgValue;
  readonly layer: Layer;
  readonly by: string | null;                 // tên policy, hoặc null
  readonly overridden: readonly {
    readonly layer: Layer; readonly by: string | null; readonly value: ArgValue;
    readonly why: 'lower_wins' | 'argument_wins';
  }[];
}
export type Effective = Readonly<Record<string, EffectiveEntry>>;  // khoá chuẩn, không tiền tố x-
export type EffectiveCheck = 'verified' | 'unverified';           // thêm vào Queue và Exchange
```

**Bảng khoá v0.1.** Khoá ngoài bảng vẫn được đưa vào `Effective` với quy tắc "argument thắng", để `explain` in đủ, nhưng không luật nào đọc chúng.

| Khoá chuẩn | Tên argument | Khoá policy | Áp cho | Argument và policy cùng có | Kiểu |
| --- | --- | --- | --- | --- | --- |
| `alternate-exchange` | `alternate-exchange` | `alternate-exchange` | exchange | argument thắng | string |
| `dead-letter-exchange` | `x-dead-letter-exchange` | `dead-letter-exchange` | classic, quorum | argument thắng | string |
| `dead-letter-routing-key` | `x-dead-letter-routing-key` | `dead-letter-routing-key` | classic, quorum | argument thắng | string |
| `dead-letter-strategy` | `x-dead-letter-strategy` | `dead-letter-strategy` | quorum | argument thắng | `at-most-once`, `at-least-once` |
| `overflow` | `x-overflow` | `overflow` | classic, quorum | argument thắng | `drop-head`, `reject-publish`, `reject-publish-dlx` |
| `max-length` | `x-max-length` | `max-length` | classic, quorum | nhỏ hơn thắng | số nguyên |
| `max-length-bytes` | `x-max-length-bytes` | `max-length-bytes` | mọi loại | nhỏ hơn thắng | số nguyên |
| `message-ttl` | `x-message-ttl` | `message-ttl` | classic, quorum | nhỏ hơn thắng | số nguyên, mili-giây |
| `expires` | `x-expires` | `expires` | classic, quorum | nhỏ hơn thắng | số nguyên, mili-giây |
| `delivery-limit` | `x-delivery-limit` | `delivery-limit` | quorum | nhỏ hơn thắng | số nguyên |
| `queue-type` | `x-queue-type` | không có | queue | chỉ argument, rồi vhost default | `classic`, `quorum`, `stream` |

Toàn bộ cột "cùng có" là giả định GC10. Lưu ý dòng đầu: argument của alternate exchange không có tiền tố `x-`, khác các khoá của queue.

**Mặc định dựng sẵn.** Lấy từ bảng năng lực trong `@ochotona/spec`, theo phiên bản cluster và loại queue. Khoá không có trong cả ba lớp và không có mặc định thì vắng khỏi `Effective`.

| Khoá | Classic | Quorum 3.13 | Quorum 4.0 trở lên |
| --- | --- | --- | --- |
| `overflow` | `drop-head` | `drop-head` | `drop-head` |
| `dead-letter-strategy` | không áp | `at-most-once` | `at-most-once` |
| `delivery-limit` | không áp | vắng (không giới hạn) | 20 |
| `queue-type` | `vhost_default` nếu vhost có, không thì `classic` | — | — |

**Thuật toán `resolveEffective(obj, policies, operatorPolicies, caps)`.**

1. Một trong `policies`, `operatorPolicies` là `unknown` thì kết quả là `unknown: depends_on` trỏ về nó.
2. **Chọn policy.** Ứng viên: cùng vhost, `applyTo` khớp loại đối tượng theo bảng dưới, và `pattern` khớp tên. Nếu một ứng viên có pattern ngoài tập hỗ trợ thì kết quả là `unknown: regex_unsupported`, vì không biết nó có khớp hay không. Lấy priority cao nhất; hai policy trở lên cùng priority cao nhất thì `unknown: tie`, kèm tên đã sắp.
3. **Chọn operator policy** theo đúng cách ở bước 2.
4. **Gộp policy với operator policy.** Khoá có ở cả hai: số thì nhỏ hơn thắng, ghi bên thua vào `overridden` với `lower_wins`. Khoá không phải số có ở operator policy là dữ liệu broker không cho phép; ghi bất thường `unexpected_operator_key` và lấy giá trị của operator policy.
5. **Gộp với argument** theo cột "cùng có" của bảng khoá. Bên thua vào `overridden` với `argument_wins` hoặc `lower_wins`.
6. Khoá không có ở cả ba lớp thì lấy mặc định dựng sẵn nếu có.
7. Trả `known` với `prov.source = 'derived'`, `path = 'derived:effective'`, `observedAt` muộn nhất của các đầu vào.

| `applyTo` | Exchange | Classic | Quorum | Stream |
| --- | --- | --- | --- | --- |
| `all` | có | có | có | có |
| `exchanges` | có | không | không | không |
| `queues` | không | có | có | có |
| `classic_queues` | không | có | không | không |
| `quorum_queues` | không | không | có | không |
| `streams` | không | không | không | có |

**Regex.** Pattern được dùng nguyên văn làm `new RegExp(pattern)` không cờ, khớp không neo như Erlang. Pattern bị coi là ngoài tập hỗ trợ khi `RegExp` báo lỗi biên dịch, hoặc khi chứa một trong các cấu trúc PCRE mà JavaScript không có hoặc hiểu khác: `(?>`, `(?|`, `(?#`, `(?(`, `(?R`, `(?P`, cờ nội tuyến như `(?i)`, lượng từ chiếm hữu (`*+`, `++`, `?+`, `}+`), `\A`, `\Z`, `\z`, `\G`, `\Q`, `\E`, `\K`, `\R`, `\h`, `\v`, `\p`. Không dịch gần đúng.

**Tự kiểm với broker.** Sau bước 4, model có ba kết quả broker cũng tự tính: tên policy, tên operator policy, và định nghĩa đã gộp. So với `appliedPolicy`, `appliedOperatorPolicy`, `brokerEffectivePolicy` (so định nghĩa bằng `stableJson`).

| Kết quả so | `effective` | `effectiveCheck` |
| --- | --- | --- |
| Mọi trường broker đọc được đều khớp | `known` | `verified` |
| Trường broker `unknown` | `known` | `unverified` |
| Lệch ở bất kỳ trường nào | `unknown: model_mismatch`, `detail` dạng `policy: model=scan-dlx broker=catch-all` | `unverified` |

Exchange chỉ có `appliedPolicy` để so. Luật đọc `effective` như mọi trường khác; `effectiveCheck` chỉ để `explain` in dòng "Broker agrees".

## `Desired` và schema `ocho.yaml` v0.1

Model nhận `ocho.yaml` đã được `@ochotona/compiler` parse thành object JS, kiểm tra nó, và dựng `Desired`. YAML dùng `snake_case`, model dùng `camelCase`; ánh xạ một-một, không có khoá nào đổi nghĩa.

**Khoá cấp cao nhất.**

| Khoá | Bắt buộc | Kiểu | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| `spec` | có | chuỗi | — | Major phải bằng major spec mà gói hỗ trợ |
| `broker.min_version` | có | chuỗi phiên bản | — | Chọn bảng năng lực và mặc định dựng sẵn |
| `families` | không | map tên → family | `{}` | — |
| `flows` | không | map tên → flow | `{}` | — |
| `services` | không | map tên → service | `{}` | Dùng cho R1 |
| `waivers` | không | danh sách | `[]` | — |
| `topology` | không | object | rỗng | `import` luôn ghi; mục topology |

**Family.** `vhost` (mặc định `/`), `exchange`, `routing_key` (mẫu), `queue` (mẫu), `members` (danh sách chuỗi, hoặc chữ `registry`). Mẫu là chuỗi có tham số `{tên}`; tập tham số của `queue` và `routing_key` phải bằng nhau.

**Flow.** `vhost` (mặc định `/`), `tolerance` (`strict`, `loose`, `undeclared`; mặc định `undeclared`), và đúng một trong bốn dạng đích:

| Dạng | Khoá | Ý nghĩa |
| --- | --- | --- |
| `family` | `family: <tên>` | Luồng phủ mọi thành viên của family |
| `binding` | `exchange`, `routing_key`, `groups` | Mỗi phần tử của `groups` là tên một queue nhận luồng |
| `fanout` | `exchange`, `groups`, không có `routing_key` | Exchange fanout |
| `direct` | `queue` | Publisher gửi qua exchange mặc định thẳng vào queue |

**Service.** `user` (user RabbitMQ), `flows` (danh sách tên luồng service publish hoặc consume).

**Waiver.** `rule`, `object` (dạng đầy đủ hoặc rút gọn ở mục định danh), `reason`, `by`, `until` (ngày `YYYY-MM-DD`, hết hiệu lực từ 00:00 UTC ngày hôm sau).

```ts
export type Tolerance = 'strict' | 'loose' | 'undeclared';

export interface Desired {
  readonly spec: string;
  readonly broker: { readonly minVersion: Version };
  readonly families: Readonly<Record<string, Family>>;
  readonly flows: Readonly<Record<string, Flow>>;
  readonly services: Readonly<Record<string, Service>>;
  readonly waivers: readonly Waiver[];
  readonly topology: Topology;
}

export interface Template {
  readonly raw: string;                                   // 'request_{engine_id}_q'
  readonly parts: readonly (string | { readonly param: string })[];
  readonly params: readonly string[];                     // theo thứ tự xuất hiện
}

export interface Family {
  readonly name: string; readonly vhost: string; readonly exchange: string;
  readonly routingKey: Template; readonly queue: Template;
  readonly members: readonly string[] | 'registry';
}

export type FlowTarget =
  | { readonly kind: 'family'; readonly family: string }
  | { readonly kind: 'binding'; readonly exchange: string; readonly routingKey: string;
      readonly groups: readonly string[] }
  | { readonly kind: 'fanout'; readonly exchange: string; readonly groups: readonly string[] }
  | { readonly kind: 'direct'; readonly queue: string };

export interface Flow {
  readonly name: string; readonly vhost: string;
  readonly tolerance: Tolerance; readonly target: FlowTarget;
}
export interface Service { readonly name: string; readonly user: string; readonly flows: readonly string[] }
export interface Waiver {
  readonly rule: string; readonly object: ObjectRef;
  readonly reason: string; readonly by: string; readonly until: string;
}
```

**Mã kiểm tra.** `validateDesired(obj, now)` trả `{ errors, warnings }`, mỗi mục là `{ code, path, params }`. `path` là mảng khoá YAML (`['flows', 'billing', 'tolerance']`); compiler đổi nó thành dòng và cột. `buildDesired` chỉ trả `Desired` khi không có lỗi.

| Mã | Mức | Khi nào |
| --- | --- | --- |
| Y1 | lỗi | Khoá không có trong schema, ở bất kỳ cấp nào |
| Y2 | lỗi | Sai kiểu |
| Y3 | lỗi | Thiếu khoá bắt buộc |
| Y4 | lỗi | Flow không có đúng một dạng đích |
| Y5 | lỗi | Flow tham chiếu family không tồn tại |
| Y6 | lỗi | Mẫu sai cú pháp, hoặc tập tham số của `queue` khác của `routing_key` |
| Y7 | lỗi | Thành viên family chứa `.`, `*`, `#`, `/`, `+` (H2) |
| Y8 | lỗi | Service tham chiếu luồng không tồn tại |
| Y9 | lỗi | Waiver thiếu `reason`, `by` hoặc `until`, hoặc `until` sai định dạng |
| Y10 | cảnh báo | Waiver đã hết hạn so với `now`; waiver đó không có hiệu lực |
| Y11 | lỗi | `object` của waiver sai định dạng |
| Y12 | lỗi | `spec` khác major |
| Y13 | lỗi | Hai luồng cùng nhận một bộ (vhost, exchange, routing key, queue) |
| Y14 | lỗi | `broker.min_version` không parse được |

## Luồng và dung sai

`buildFlowMap(desired, actual)` mở mỗi luồng thành tập đối tượng cụ thể và trả lời hai câu cho mọi luật: đối tượng này thuộc luồng nào, và dung sai của nó là gì. Không có `ocho.yaml` thì mọi đối tượng có dung sai `undeclared`.

**Mở luồng thành đối tượng.**

| Dạng đích | Exchange | Queue | Binding mong đợi |
| --- | --- | --- | --- |
| `family`, thành viên tĩnh | `family.exchange` | `queue(m)` với mỗi thành viên `m` | `exchange` → `queue(m)`, key `routingKey(m)` |
| `family`, `registry` | Như trên | Queue trong `actual` khớp mẫu `queue`; giá trị tham số tách từ tên | Như trên |
| `binding` | `exchange` | Mỗi phần tử `groups` | `exchange` → mỗi queue, key `routingKey` |
| `fanout` | `exchange` | Mỗi phần tử `groups` | `exchange` → mỗi queue, key `""` |
| `direct` | Exchange mặc định, không đưa vào tập | `queue` | Không có |

**Mẫu thành regex.** Phần chữ được escape; mỗi tham số thành `([^.*#/+]+)`; neo `^` và `$`. Hai tham số đứng sát nhau là lỗi Y6, vì không tách được giá trị.

**Dung sai của một đối tượng.** Lấy tập luồng chứa đối tượng, rồi gộp theo thứ tự `strict` > `undeclared` > `loose`:

- Có ít nhất một luồng `strict` thì `strict`: một queue mang cả dữ liệu không được mất thì phải được canh như vậy.
- Không có `strict` nhưng có `undeclared` thì `undeclared`: chưa biết thì không được hạ xuống `loose`, vì hạ xuống là che phát hiện.
- Chỉ có `loose` thì `loose`. Không thuộc luồng nào thì `undeclared`.

| Đối tượng | Dung sai lấy từ |
| --- | --- |
| Exchange, queue | Các luồng chứa nó |
| Binding | Luồng chứa queue đích |
| Consumer | Queue mà consumer đọc |
| Connection, channel | Các luồng của mọi service có `user` trùng user của connection; không service nào khớp thì `undeclared` |

```ts
export interface FlowMap {
  flowsOf(ref: ObjectRef): readonly string[];        // sắp theo tên
  toleranceOf(ref: ObjectRef): Tolerance;
  membersOf(flow: string): {
    readonly exchanges: readonly ObjectRef[];
    readonly queues: readonly ObjectRef[];
    readonly bindings: readonly ObjectRef[];
  };
  readonly missing: readonly ObjectRef[];            // có trong Desired, vắng trong Actual
  readonly incomplete: UnknownReason | null;          // khác null khi không kiểm đủ missing
}
```

`missing` không phải luật ở v0.1. `import` dùng nó để báo khi `ocho.yaml` lệch khỏi broker, và `lint` của v0.2 sẽ dùng lại nguyên trường này. Nếu `actual.queues` là `unknown` thì `missing` chỉ chứa exchange và binding kiểm được, và `FlowMap` ghi lý do vào `incomplete`.

## Topology chuẩn hoá và diff

`Topology` là dạng chung của phần khai báo, dùng cho cả hai phía: `topologyFromActual` dựng nó từ broker, `Desired.topology` đọc nó từ YAML. Hai phía qua cùng một hàm `normalizeTopology` rồi mới so, nên diff rỗng nghĩa là YAML giữ đúng mọi thứ broker có.

```ts
export interface Topology {
  readonly exchanges: readonly TopoExchange[];
  readonly queues: readonly TopoQueue[];
  readonly bindings: readonly TopoBinding[];
  readonly policies: readonly TopoPolicy[];
  readonly operatorPolicies: readonly TopoPolicy[];
}
export interface TopoExchange {
  readonly vhost: string; readonly name: string; readonly type: string;
  readonly durable: boolean; readonly autoDelete: boolean; readonly internal: boolean;
  readonly arguments: ArgMap; readonly flow?: string;
}
export interface TopoQueue {
  readonly vhost: string; readonly name: string; readonly type: QueueType;
  readonly durable: boolean; readonly autoDelete: boolean;
  readonly arguments: ArgMap; readonly flow?: string;
}
export interface TopoBinding {
  readonly vhost: string; readonly source: string;
  readonly destinationType: 'queue' | 'exchange'; readonly destination: string;
  readonly routingKey: string; readonly arguments: ArgMap;
}
export interface TopoPolicy {
  readonly vhost: string; readonly name: string; readonly pattern: string;
  readonly applyTo: ApplyTo; readonly priority: number; readonly definition: ArgMap;
}
```

`topologyFromActual` trả `Observed<Topology>`: một trong năm bộ sưu tập `unknown` thì cả topology `unknown: depends_on`, vì `import` không được ghi một topology thiếu mà trông như đủ.

**`normalizeTopology`, theo thứ tự.**

1. Bỏ exchange tên `""` và mọi exchange tên bắt đầu bằng `amq.` (tiền tố dành riêng, người dùng không tạo được). Binding đi ra từ các exchange `amq.*` vẫn giữ, vì đó là cấu hình thật của ứng dụng.
2. Bỏ queue `exclusive`, queue tên `amq.gen-*`, queue tên `mqtt-subscription-*`.
3. Bỏ binding có `source` = `""`.
4. Bỏ trường `flow` khỏi mọi phần tử: đó là chú thích cho người đọc, không phải trạng thái của broker.
5. Giữ nguyên `arguments` và `definition`, kể cả `x-queue-type`; không ép kiểu, không thêm mặc định.
6. Sắp mỗi danh sách theo `refKey`.

**So bằng nhau.** Hai phần tử cùng `refKey` là bằng nhau khi `stableJson` của chúng bằng nhau.

**Diff.**

```ts
export type TopoRef = Extract<ObjectRef, { kind: 'exchange' | 'queue' | 'binding' | 'policy' | 'operator_policy' }>;
export interface FieldChange {
  readonly path: readonly (string | number)[];         // ['arguments', 'x-max-length']
  readonly before: ArgValue | undefined;
  readonly after: ArgValue | undefined;
}
export type Change =
  | { readonly op: 'add'; readonly ref: TopoRef; readonly after: unknown }
  | { readonly op: 'remove'; readonly ref: TopoRef; readonly before: unknown }
  | { readonly op: 'update'; readonly ref: TopoRef; readonly fields: readonly FieldChange[] };

export function diffTopology(from: Topology, to: Topology): readonly Change[];
```

- Khớp phần tử hai phía theo `refKey`. Có ở `to` mà không có ở `from` là `add`; ngược lại là `remove`; có cả hai mà khác là `update`.
- `update` so đệ quy theo khoá object; mảng so nguyên khối, đường dẫn dừng ở mảng.
- Binding có `argsKey` trong khoá, nên đổi argument của binding là một `remove` cộng một `add`, đúng với việc broker không cho sửa binding tại chỗ.
- Sắp kết quả theo loại (exchange, queue, binding, policy, operator policy), rồi `refKey`, rồi `path`.

Ở v0.1 diff có hai người dùng: tự kiểm vòng tròn của `import` (phải rỗng) và phần in thay đổi khi import lại. `plan` của v0.3 dùng lại nguyên hàm này và chỉ thêm nhãn `hot`, `migrate`, `restart`, `redeploy`.

## Ảnh chụp

Ảnh chụp chỉ lưu dữ liệu đọc được, không lưu dữ liệu suy ra. Khi nạp lại, model tính lại mọi trường `derived` bằng mã hiện tại, nên một luật hay một bản sửa thuật toán mới chạy được trên broker đã chụp từ tuần trước.

```json
{
  "schema": "ocho.snapshot/1",
  "tool": { "name": "ocho", "version": "0.1.0", "spec": "0.4" },
  "takenAt": "2026-10-04T01:22:14.031Z",
  "context": { "name": "prod", "urlHash": "sha256:3f9a1c0b7e2d" },
  "redaction": { "hosts": true },
  "actual": { "meta": { }, "broker": { }, "queues": { "state": "known", "value": [ ], "prov": { } } }
}
```

**Không lưu:** `effective`, `effectiveCheck`, `broker.version`, `broker.metadataStore`, `Counter.completeSince`, và mọi `Observed` có `prov.source = 'derived'`. Không bao giờ có trong ảnh chụp: mật khẩu (CLI không đọc), header xác thực, `password_command`, URL đầy đủ của broker (chỉ có băm).

**Nguồn gốc giữ nguyên.** Trường đọc từ `http.list` vẫn mang `http.list` sau khi nạp lại; `meta.fromSnapshot` ghi file và thời điểm chụp. Renderer dựa vào `meta.fromSnapshot` để in "from snapshot taken at…". Đây là thay đổi so với tab v0.1, vốn đổi mọi nguồn thành `snapshot`: đổi như vậy làm mất thông tin trường nào từng đến từ thống kê, và chính thông tin đó quyết định lý do `not_checked`.

**Che thông tin với `--redact-hosts`.**

| Trường | Cách che |
| --- | --- |
| `connections[].peerHost` | Thay bằng mã |
| `connections[].ref.name` | Thay cả chuỗi bằng mã |
| `channels[].ref.name` | Thay phần tên connection bằng đúng mã ở trên, giữ hậu tố `  (n) ` |
| `channels[].connection`, `consumers[].connection`, `consumers[].ref.channel` | Dùng cùng mã với trường gốc |
| `context.urlHash` | Luôn là băm, kể cả khi không bật che |

Mã = `h-` + 12 ký tự hex đầu của SHA-256 trên (muối + giá trị gốc). Muối là 32 byte ngẫu nhiên sinh cho mỗi lần chụp và không được ghi vào file: cùng một giá trị cho cùng một mã trong một ảnh chụp, nên quan hệ giữa connection, channel, consumer còn nguyên, nhưng không tra ngược được. Tên vhost, queue, exchange, user, `connectionName` không bị che vì luật cần chúng; che các tên này là việc của bản sau.

**Nạp lại.** `loadSnapshot(json)` kiểm tra theo thứ tự, gặp lỗi đầu tiên thì dừng:

| Mã | Khi nào |
| --- | --- |
| SNAP1 | `schema` không phải `ocho.snapshot/1`, hoặc major khác 1 |
| SNAP2 | Sai hình dạng, kèm đường dẫn JSON tới chỗ sai |
| SNAP3 | Bất biến của mục dưới bị vi phạm theo cách không thể là đọc không nhất quán (ví dụ trùng khoá) |

Nén `.gz` là việc của CLI; model chỉ nhận và trả chuỗi JSON.

## Bất biến và đọc không nhất quán

Đọc 10.000 queue theo trang mất vài phút, và broker không đứng yên trong lúc đó. Model phân biệt hai loại sai lệch: bất thường do broker thay đổi giữa các trang (được ghi lại, không chặn), và vi phạm bất biến (là lỗi của Ocho, chặn).

**Bất thường khi đọc.** Ghi vào `actual.anomalies`, mỗi mục `{ kind, ref, detail }`.

| Loại | Hiện tượng | Xử lý |
| --- | --- | --- |
| `duplicate_key` | Một `refKey` xuất hiện ở hai trang, do đối tượng mới chèn làm dịch trang | Giữ bản ở trang sau (mới hơn) |
| `page_shift` | Số phần tử đọc được ít hơn `min(totals lúc đầu, totals lúc cuối)`, do đối tượng bị xoá làm dịch trang và có thể đã bỏ sót phần tử | Ghi số mong đợi và số đọc được |
| `dangling_ref` | Binding, consumer, channel trỏ tới đối tượng không có trong danh sách | Giữ phần tử; chỉ mục bỏ qua liên kết đó |
| `unsupported_type` | Queue có `type` ngoài ba loại | Bỏ queue khỏi model |
| `unexpected_operator_key` | Operator policy có khoá không phải số | Như mục `Effective` |

Bất thường của một bộ sưu tập vượt 1% số phần tử thì `meta.consistency` của bộ sưu tập đó là `degraded`, và báo cáo in một dòng "broker changed during read; run again for a complete view". Bất thường chỉ có thể làm luật bỏ sót, không làm luật báo nhầm, nên chúng không biến kết quả thành `not_checked`.

**Bất biến.** `checkInvariants(actual)` trả danh sách vi phạm; test gọi nó sau mọi lần dựng `Actual`, và `loadSnapshot` gọi nó trước khi trả kết quả (SNAP3).

| Mã | Bất biến |
| --- | --- |
| INV1 | Trong mỗi bộ sưu tập, `refKey` là duy nhất sau khi xử lý `duplicate_key` |
| INV2 | Mọi bộ sưu tập `known` đã sắp theo `refKey` |
| INV3 | Mọi `prov.observedAt` nằm trong `[readStartedAt, readFinishedAt]` |
| INV4 | `queue.type` thuộc ba loại; quorum thì `durable` = true |
| INV5 | Mục `builtin_default` trong `Effective` chỉ có cho khoá nằm trong bảng mặc định của đúng loại queue và phiên bản |
| INV6 | `Counter.count` ≥ 0 và `completeSince` ≤ `readStartedAt` |
| INV7 | Không trường số nào là `NaN` hoặc vô cực |

Vi phạm bất biến trong lúc chạy thật thì CLI thoát 5 kèm đề nghị gửi ảnh chụp: đó là lỗi của Ocho, không phải trạng thái của broker.

## API công khai

Gói xuất đúng các hàm dưới đây; mọi thứ khác là nội bộ. `buildActual` là cửa duy nhất để có một `Actual`, và nó làm mọi phép suy ra (phiên bản cluster, `completeSince`, `Effective`, tự kiểm), nên không gói nào khác có thể dựng một `Actual` thiếu bước.

```ts
// Kết quả có lỗi, không ném ngoại lệ ở API công khai
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Đầu vào thô do @ochotona/broker thu về
export type RawResult<T = unknown> =
  | { status: 'ok'; pages: readonly { body: T; observedAt: Instant }[] }
  | { status: 'http_error'; code: number }
  | { status: 'network_error'; message: string }
  | { status: 'not_attempted' };

export interface RawResponses {
  overview: RawResult; whoami: RawResult; nodes: RawResult; vhosts: RawResult;
  featureFlags: RawResult; deprecatedUsed: RawResult;
  exchanges: RawResult; queues: RawResult; bindings: RawResult;
  policies: RawResult; operatorPolicies: RawResult;
  connections: RawResult; channels: RawResult; consumers: RawResult;
  prometheus: RawResult<string>;                       // văn bản exposition
  totalsAtEnd: RawResult;                              // overview đọc lại lúc cuối, cho page_shift
}

export interface BuildContext {
  contextName: string; readStartedAt: Instant; readFinishedAt: Instant;
  scope: { vhosts: readonly string[] | 'all' };
  caps: CapabilityTable;                               // từ @ochotona/spec
}

// Dựng
export function buildActual(raw: RawResponses, ctx: BuildContext): Actual;
export function validateDesired(obj: unknown, now: Instant): { errors: Diag[]; warnings: Diag[] };
export function buildDesired(obj: unknown, now: Instant): Result<Desired, Diag[]>;
export function buildFlowMap(desired: Desired | null, actual: Actual): FlowMap;
export function buildIndexes(actual: Actual): Indexes;

// Giá trị hiệu lực, dùng cho cả Actual và Desired
export function resolveEffective(
  obj: { ref: ObjectRef; queueType?: QueueType; arguments: ArgMap },
  policies: Observed<readonly Policy[]>,
  operatorPolicies: Observed<readonly Policy[]>,
  caps: Capabilities,
): { effective: Observed<Effective>; chosen: { policy: string | null; operator: string | null };
    mergedPolicyDefinition: ArgMap };

// Topology
export function topologyFromActual(actual: Actual): Observed<Topology>;
export function normalizeTopology(t: Topology): Topology;
export function diffTopology(from: Topology, to: Topology): readonly Change[];

// Ảnh chụp
export function saveSnapshot(actual: Actual, opts: {
  toolVersion: string; specVersion: string; takenAt: Instant; contextName: string;
  url: string; redactHosts: boolean; randomBytes: (n: number) => Uint8Array;
}): string;
export function loadSnapshot(json: string, caps: CapabilityTable): Result<Actual, SnapshotError>;

// Bất biến
export function checkInvariants(actual: Actual): readonly Violation[];

// Định danh, giá trị, phiên bản
export function refKey(ref: ObjectRef): string;
export function refLabel(ref: ObjectRef): string;
export function parseObjectSelector(s: unknown): Result<ObjectRef, Diag>;
export function stableJson(v: ArgValue): string;
export function argsKey(args: ArgMap): string;
export function parseVersion(s: string): Version | null;
export function compareVersion(a: Version, b: Version): -1 | 0 | 1;

// Observed: known, unknown, isKnown, map, all, firstKnown, derive, rootReason, displayOr

export interface Indexes {
  bindingsBySource(ref: ObjectRef): readonly Binding[];
  bindingsByDestination(ref: ObjectRef): readonly Binding[];
  consumersByQueue(ref: ObjectRef): readonly Consumer[];
  channelsByConnection(name: string): readonly Channel[];
  exchange(ref: ObjectRef): Exchange | undefined;
  queue(ref: ObjectRef): Queue | undefined;
}
```

`randomBytes` được truyền vào thay vì gọi `crypto.randomBytes` trực tiếp, để test ảnh chụp tất định. Không hàm nào ném ngoại lệ với dữ liệu xấu từ broker; ngoại lệ chỉ dành cho lỗi lập trình, và CLI biến chúng thành exit 5.

## Test bắt buộc và định nghĩa hoàn thành

Model là nơi một lỗi biến thành sai ở mọi luật cùng lúc, nên ngưỡng test ở đây cao hơn mọi gói khác: phủ nhánh ≥ 95% cho `ingest/`, `effective.ts`, `flow.ts`, và điểm mutation ≥ 80% cho `effective.ts`.

| Nhóm | Test | Nghiệm thu |
| --- | --- | --- |
| Ingest | JSON thô ghi từ broker thật 3.13, 4.2, 4.3 và Amazon MQ (`tools/record-raw.ts`) qua `buildActual`, so với `Actual` vàng | Mỗi dòng của bảng ánh xạ có ít nhất một khẳng định |
| Lý do `unknown` | Mọi tổ hợp: 403 ở policy, 404 ở deprecated features, thống kê tắt, Prometheus đóng | Đúng `kind` ở đúng trường, không lan sang trường khác |
| Ngoại lệ `publishCount` | Channel chỉ consume, thống kê bật | `publishCount` = 0, không phải `unknown` |
| `completeSince` | Ba node, uptime khác nhau; một node thiếu uptime | Lấy uptime nhỏ nhất; thiếu thì `Counter` là `unknown` |
| Chọn policy | Ma trận `applyTo` 6 × 4; priority; hoà; khác vhost; từng cấu trúc regex ngoài tập hỗ trợ | Đúng bảng ở mục `Effective` |
| Gộp giá trị | Mỗi khoá trong bảng × 6 tổ hợp lớp (chỉ argument, chỉ policy, chỉ operator, argument + policy, policy + operator, cả ba) × loại queue × phiên bản 3.13 và 4.0 | Đúng `value`, `layer`, `by`, `overridden` |
| Tự kiểm | Dựng dữ liệu cho model chọn khác broker | `unknown: model_mismatch` với `detail` đúng |
| Phiên bản | Parse và so sánh, kể cả `rc`, thiếu patch, chuỗi hỏng; cluster lệch phiên bản | Lấy phiên bản nhỏ nhất |
| `Desired` | Mỗi mã Y1 đến Y14 có một đầu vào sai và một đầu vào gần giống hợp lệ | Đúng mã, đúng `path` |
| `FlowMap` | Bảng gộp dung sai đủ mọi tổ hợp; family `registry` tách tham số; service nối connection | Đúng bảng ở mục luồng |
| Topology | Mỗi quy tắc chuẩn hoá; diff `add`, `remove`, `update`; đổi argument binding ra `remove` + `add`; thứ tự | Đúng từng phần tử |
| Vòng tròn | Property test bằng fast-check: topology ngẫu nhiên với tên Unicode, dấu cách, `/`, số lớn, argument lồng nhau → YAML → parse → `buildDesired` → diff | Diff rỗng sau 10.000 ca |
| Ảnh chụp | Lưu rồi nạp; che host; `randomBytes` cố định; SNAP1 đến SNAP3 | `Actual` nạp lại bằng `Actual` gốc; không còn IPv4, IPv6 nào trong file đã che |
| Bất biến | `checkInvariants` chạy sau mọi `buildActual` trong toàn bộ bộ test | 0 vi phạm |
| Tất định | Cùng đầu vào dựng hai lần | `JSON.stringify` giống từng byte |
| Hiệu năng | 10.000 queue, 20.000 binding, 200 policy | `buildActual` ≤ 500 ms trên máy CI; regex của mỗi policy biên dịch một lần |

**Định nghĩa hoàn thành.**

- [ ] Mọi test ở bảng trên xanh trên Node 20 và 22.
- [ ] Phủ nhánh và điểm mutation đạt ngưỡng ở đầu mục.
- [ ] Mọi hàm xuất ra có TSDoc nêu đơn vị, khi nào trả `unknown`, và ví dụ.
- [ ] Phụ thuộc lúc chạy chỉ có `@ochotona/spec` và `node:crypto`; phụ thuộc lúc dev thêm `fast-check` và Stryker.
- [ ] JSON schema của `ocho.snapshot/1` công bố trong `@ochotona/spec`.

## Giả định và thay đổi so với tab v0.1

Spec này thay thế mục "Kiểu dữ liệu lõi" của tab v0.1; khi hai chỗ khác nhau, tab này có hiệu lực.

| # | Thay đổi | Lý do |
| --- | --- | --- |
| 1 | Khớp policy chuyển từ `@ochotona/broker` sang model | `Desired` và `Actual` phải dùng cùng một thuật toán |
| 2 | Ánh xạ HTTP (`ingest/`) nằm trong model | Test được bằng JSON ghi lại, không cần mạng |
| 3 | Mọi bộ sưu tập là `Observed` | Endpoint nào cũng có thể 403 hoặc 404 |
| 4 | `observedAt` chuyển vào `prov`; thêm lý do `depends_on`, `inconsistent_read`; bỏ nguồn `snapshot` | Giữ nguyên gốc thật của trường sau khi nạp ảnh chụp |
| 5 | Thêm lớp `vhost_default` và trường `overridden` | `explain` nói được giá trị nào thua và vì sao |
| 6 | `Counter.since` thành `completeSince` với nghĩa chặt | Bộ đếm về 0 khi node khởi động lại |
| 7 | Thêm `anomalies`, `meta.consistency` | Đọc theo trang không nhất quán trên broker đang chạy |
| 8 | Ảnh chụp không lưu dữ liệu suy ra | Luật và thuật toán mới chạy được trên ảnh chụp cũ |

| Mã | Giả định | Kiểm ở |
| --- | --- | --- |
| GC13 | Endpoint danh sách trả phần tử theo thứ tự tên ổn định giữa các trang | Broker 10.000 queue, tạo và xoá queue trong lúc đọc |
| GC14 | `apply-to` vắng nghĩa là `all`; operator policy chỉ chứa khoá số | JSON thô ghi từ 3.13 |
| GC15 | `/api/vhosts` có `default_queue_type` trên 3.13 | JSON thô ghi từ 3.13 |
| GC16 | Đọc lại `/api/overview` ở cuối chỉ tốn một request và đủ để phát hiện `page_shift` | Như GC13 |

Các giả định GC2, GC9, GC10, GC12 ở tab v0.1 vẫn áp cho spec này. Câu hỏi mở về hai policy cùng priority được xử lý tạm bằng `unknown: tie` cho tới khi đọc mã nguồn broker.
