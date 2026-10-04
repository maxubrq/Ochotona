# @ochotona/model

Lõi thuần của Ocho. Gói định nghĩa broker RabbitMQ trông như thế nào (`Actual`) và người dùng muốn gì (`Desired`). Trên hai thứ đó, nó tính giá trị hiệu lực, chuẩn hoá topology, diff, và lưu, nạp ảnh chụp.

Gói không có I/O, không đọc đồng hồ, không gọi mạng. Phụ thuộc lúc chạy là `@ochotona/spec` (bảng khoá, bảng năng lực, loại trừ hệ thống, kiểu phiên bản) và `node:crypto`.

```
spec ← model ← rules, broker, compiler ← cli
```

## Nguyên tắc

- **Bất biến.** Mọi kiểu là `readonly`, chỉ dựng bằng `buildActual`, `buildDesired` hoặc `loadSnapshot`.
- **Không đoán.** Giá trị đọc từ broker luôn là `Observed<T>`: `known` thì kèm nguồn gốc, `unknown` thì kèm lý do có cấu trúc (`forbidden`, `field_absent`, `tie`…). Gói không có hàm nào đổi `unknown` thành giá trị mặc định.
- **Tất định.** Hàm cần thời điểm nhận `now` làm tham số. Cùng đầu vào cho ra cùng JSON đến từng byte.
- **Không ném ngoại lệ với dữ liệu xấu.** Lỗi trả về qua `Result`, `Diag` hoặc bất thường trong `actual.anomalies`.

## Dùng

```ts
import {
  buildActual,
  buildDesired,
  buildFlowMap,
  DEFAULT_CAPABILITY_TABLE,
} from '@ochotona/model';

// raw: JSON thô do @ochotona/broker thu về từ HTTP API và Prometheus
const actual = buildActual(raw, {
  contextName: 'prod',
  readStartedAt,
  readFinishedAt,
  scope: { vhosts: 'all' },
  caps: DEFAULT_CAPABILITY_TABLE,
});

const q = actual.queues.state === 'known' ? actual.queues.value[0] : undefined;
if (q?.effective.state === 'known') {
  q.effective.value['max-length']; // { value, layer, by, overridden }
}

// obj: ocho.yaml đã được @ochotona/compiler parse thành object
const desired = buildDesired(obj, now);
const flows = buildFlowMap(desired.ok ? desired.value : null, actual);
flows.toleranceOf({ kind: 'queue', vhost: '/', name: 'orders' }); // 'strict' | 'loose' | 'undeclared'
```

## API chính

| Nhóm               | Hàm                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Dựng               | `buildActual`, `validateDesired`, `buildDesired`, `buildFlowMap`, `buildIndexes`                       |
| Kế hoạch đọc       | `planRead`, `ENDPOINT_IDS` (cho `@ochotona/broker`)                                                    |
| Giá trị hiệu lực   | `resolveEffective`                                                                                     |
| Topology           | `topologyFromActual`, `normalizeTopology`, `diffTopology`                                              |
| Ảnh chụp           | `saveSnapshot`, `loadSnapshot`                                                                         |
| Bất biến           | `checkInvariants`                                                                                      |
| Định danh, giá trị | `refKey`, `refLabel`, `parseObjectSelector`, `stableJson`, `argsKey`, `parseVersion`, `compareVersion` |
| `Observed`         | `known`, `unknown`, `isKnown`, `map`, `all`, `firstKnown`, `derive`, `rootReason`, `displayOr`         |

## Cấu trúc mã

```
src/
  units.ts observed.ts ref.ts     đơn vị, Observed, định danh đối tượng
  actual.ts caps.ts               kiểu của Actual, bảng năng lực dựng từ spec
  ingest/                         JSON của HTTP API và văn bản Prometheus → Actual
  build-actual.ts derive.ts       dựng Actual và mọi phép suy ra
  effective.ts                    chọn policy, gộp giá trị hiệu lực, tự kiểm với broker
  desired.ts template.ts flow.ts  ocho.yaml, mẫu tên, luồng và dung sai
  topology.ts                     topology chuẩn hoá và diff
  plan.ts                         kế hoạch đọc: endpoint, cột, tham số cho broker
  snapshot.ts invariants.ts       ảnh chụp ocho.snapshot/1, bất biến
```

## Phát triển

```sh
pnpm build          # rollup → dist/
pnpm test           # vitest
pnpm test:coverage
pnpm typecheck
pnpm format
```

## Tài liệu

- [docs/spec.md](docs/spec.md): spec đầy đủ (bảng ánh xạ từng trường, thuật toán `Effective`, schema `ocho.yaml`, mã lỗi Y1–Y14, SNAP, INV).
- [docs/implementation-notes.md](docs/implementation-notes.md): chỗ mã khác spec, quyết định nhỏ, và phần định nghĩa hoàn thành còn thiếu.
