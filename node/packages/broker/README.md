# @ochotona/broker

Gói duy nhất của Ocho nói chuyện với broker RabbitMQ qua mạng. Nó nhận một đích kết nối và một kế hoạch đọc, gọi management API và endpoint Prometheus, rồi trả JSON thô (`RawResponses`) cho `model.buildActual`. Gói không hiểu ý nghĩa của trường nào: không ánh xạ, không suy ra, không chấm.

```
spec ← model ← broker ← cli
```

Phụ thuộc lúc chạy: `@ochotona/spec`, `@ochotona/model`, `undici`.

## Nguyên tắc

- **Chỉ GET**, cưỡng chế ở ba tầng: `BrokerReader` không có phương thức ghi, hàm gửi request viết cứng `GET`, và một interceptor của undici chặn mọi method khác trước khi request rời máy (CL1).
- **Lỗi là dữ liệu.** Broker trả 403 hay mạng chập chờn không làm `read` ném lỗi; mỗi endpoint thành một `RawResult` có trạng thái. Chỉ lỗi lập trình mới ném.
- **Kế hoạch đọc do model sinh** (`planRead`). Broker không tự quyết đọc endpoint nào, cột nào.
- **Không đồng hồ, không ngẫu nhiên trực tiếp.** `clock`, `sleep`, `random` được truyền vào để test tất định.
- **Nhẹ tay với broker.** Mọi request đi qua một bộ giới hạn thích nghi (mặc định 5 request mỗi giây, 2 request song song), tôn trọng `Retry-After`.
- **Không lộ bí mật.** Mật khẩu chỉ nằm trong closure của transport; origin trong thông báo lỗi được thay bằng tên context. Prometheus không bao giờ nhận thông tin đăng nhập.

## Dùng

```ts
import { createReader, planRead } from '@ochotona/broker';
import { buildActual, DEFAULT_CAPABILITY_TABLE } from '@ochotona/model';

const created = createReader(
  { url: 'https://host:15671', user: 'ocho-doctor', password, name: 'prod' },
  { toolVersion: '0.1.0' },
);
if (!created.ok) throw new Error(created.error.diag); // CX4, CX10
const reader = created.value;

const plan = planRead({ scope: { vhosts: 'all' } });
const opts = { maxRps: 5, concurrency: 2, signal, onEvent: render };

const id = await reader.identify(plan, opts); // phiên bản, nguồn, ước tính
if (id.status === 'ok') {
  const out = await reader.read(plan, id.identified, opts);
  if (out.status === 'complete') {
    const actual = buildActual(out.raw, {
      contextName: 'prod',
      readStartedAt: out.readStartedAt,
      readFinishedAt: out.readFinishedAt,
      scope: plan.scope,
      caps: DEFAULT_CAPABILITY_TABLE,
    });
  }
}
await reader.close();
```

`identify` trả `failed` kèm mã chẩn đoán khi không đọc được `/api/overview`: CX1 (không nối được), CX2 (TLS), CX3 (401), CX8 (phiên bản quá cũ), CX9 (403). Cả hai hàm trả `aborted` khi `signal` bị huỷ.

## API chính

| Nhóm                         | Xuất ra                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| Reader                       | `createReader`, `BrokerReader` (`identify`, `read`, `stats`, `close`)                                    |
| Kiểu                         | `BrokerTarget`, `ReaderDeps`, `ReadOptions`, `IdentifyOutcome`, `Identified`, `ReadOutcome`, `ReadEvent` |
| Kế hoạch (xuất lại từ model) | `planRead`, `ReadPlan`, `EndpointRead`, `RawResponses`, `RawResult`                                      |
| Tiện ích                     | `normalizeUrl`, `apiUrl`, `prometheusUrl`, `estimateRead`, `parseRetryAfter`, `backoffMs`, `pageCap`     |

## Cấu trúc mã

```
src/
  target.ts       chuẩn hoá URL, ghép đường dẫn, TLS
  transport.ts    GET duy nhất, interceptor chặn method khác, proxy, đo thời gian
  throttle.ts     token bucket thích nghi
  retry.ts        phân loại lỗi, backoff có jitter, Retry-After
  fetch.ts        một GET qua bộ giới hạn, kèm thử lại
  paginate.ts     đọc theo trang, ghép trang
  sources.ts      phát hiện ba nguồn
  prometheus.ts   lấy văn bản exposition
  reader.ts       identify, read, close
  events.ts       kiểu sự kiện tiến trình
tools/            record-raw, redact-raw, check-assumptions, mock-mgmt
```

## Phát triển

```sh
pnpm build            # rollup → dist/
pnpm test             # vitest, chạy trên management API giả lập
pnpm test:coverage
pnpm typecheck        # gồm cả test biên dịch âm của CL1
pnpm format
```

Ghi fixture thô từ broker thật và kiểm giả định: xem [tools/README.md](tools/README.md).

## Tài liệu

- [docs/spec.md](docs/spec.md): spec đầy đủ (đích kết nối, các pha đọc, phát hiện nguồn, phân trang, kiểm soát tải, bảng lỗi và mã CX, Prometheus, bảo mật, test bắt buộc).
- [docs/implementation-notes.md](docs/implementation-notes.md): chỗ mã khác spec, quyết định nhỏ, và phần định nghĩa hoàn thành còn thiếu.

`/api/users` chỉ được đọc khi kế hoạch có (`planRead({ users: true })`, CLI bật khi chạy bằng user quản trị); khi đó `raw.users` có mặt trong kết quả.
