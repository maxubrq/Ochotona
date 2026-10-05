# @ochotona/compiler

Mọi thứ nằm giữa file `ocho.yaml` và model: đọc và ghi YAML mà không làm lệch kiểu dữ liệu, suy luồng và họ topology từ broker, điều phối phiên `import`, và tự kiểm vòng tròn.

Gói không đọc đĩa, không hỏi qua terminal; đó là việc của CLI. Phụ thuộc lúc chạy là `@ochotona/spec`, `@ochotona/model` và `yaml`.

```
spec ← model ← rules, broker, compiler ← cli
```

## Nguyên tắc

- **Phiên import là máy trạng thái thuần.** Compiler sinh câu hỏi, nhận câu trả lời, trả `Desired` và chuỗi YAML. CLI hỏi qua terminal; `--non-interactive` gọi `answerDefaults()`.
- **Hai lớp của file đối xử khác nhau.** Lớp ngữ nghĩa (`families`, `flows`, `services`, `waivers`) là của người dùng: import lại sửa trên cây cú pháp, giữ chú thích và thứ tự. Lớp `topology` là ảnh của broker, sinh lại toàn bộ mỗi lần.
- **Tất định.** Cùng `Desired` cho cùng chuỗi byte; import lại trên broker không đổi cho diff git rỗng.
- **Không dùng tính năng YAML mà hai thư viện có thể hiểu khác nhau.** Không anchor, alias, tag, merge key, nhiều document. Chuỗi mà YAML 1.2 hoặc 1.1 có thể đọc thành thứ khác (`on`, `017`, `2026-10-04`…) luôn nằm trong nháy kép.

## Dùng

```ts
import {
  createImportSession,
  loadOchoYaml,
  formatGnu,
} from '@ochotona/compiler';
import { topologyFromActual } from '@ochotona/model';
import '@ochotona/spec/i18n/en'; // văn bản cho formatGnu

// Import: actual do @ochotona/model dựng từ dữ liệu của @ochotona/broker
const session = createImportSession({
  topology: topologyFromActual(actual).value,
  actual,
  existing: oldText === null ? null : { text: oldText },
  context: { name: 'prod', toolVersion: '0.1.0', now },
});
for (let [q] = session.questions(); q; [q] = session.questions()) {
  session.answer(q.id, await ask(q)); // CLI hỏi qua terminal
}
const r = session.result();
if (r.ok) write('ocho.yaml', r.value.yaml); // đã qua tự kiểm vòng tròn

// Đọc ocho.yaml cho doctor, lint
const loaded = loadOchoYaml(text, now);
if (!loaded.ok) for (const d of loaded.error) console.error(formatGnu(d, 'en'));
// ocho.yaml:12:5: error Y4 Flow billing.invoice.created does not have exactly one target…
```

## API chính

| Nhóm      | Hàm                                                                    |
| --------- | ---------------------------------------------------------------------- |
| YAML      | `readOchoYaml`, `writeOchoYaml`, `loadOchoYaml`, `needsQuotes`         |
| Suy luận  | `inferFlows`, `inferFamilies`                                          |
| Import    | `createImportSession`, `roundTrip`, `formatChange`, `defaultSchemaUrl` |
| Chẩn đoán | `locate`, `formatGnu`, `formatJson`                                    |

Mã chẩn đoán mới: YP1 đến YP6 (lỗi cú pháp), YW1, YW2 (cảnh báo), IM1 (tự kiểm hỏng), IM2 (file cũ không hợp nhất được); đăng ký trong `codes.json` của `@ochotona/spec`.

## Cấu trúc mã

```
src/
  yaml/read.ts       parse, chẩn đoán YP, YW, bảng vị trí
  yaml/write.ts      lớp ngữ nghĩa qua cây Document, giữ chú thích khi có file cũ
  yaml/emit.ts       lớp topology, kết xuất thẳng
  yaml/scalar.ts     quy tắc trích dẫn, tuỳ chọn parse và ghi
  yaml/load.ts       read + model.buildDesired + locate
  infer/flows.ts     suy luồng, tên, va tên
  infer/families.ts  suy họ topology
  import/session.ts  máy trạng thái của phiên import
  import/merge.ts    import lại: phủ luồng, thành viên mới, đối tượng mất
  import/roundtrip.ts
  locate.ts          dòng, cột, dạng GNU và JSON
```

## Phát triển

```sh
pnpm build          # rollup → dist/
pnpm test           # vitest, trừ test hiệu năng
pnpm test:perf      # import 10.000 queue ≤ 2 giây
pnpm test:coverage
pnpm test:mutation  # Stryker trên scalar, families, merge, write; ngưỡng 85%
pnpm typecheck
pnpm format
```

## Tài liệu

- [docs/spec.md](docs/spec.md): spec đầy đủ (quy tắc đọc, ghi, trích dẫn; thuật toán suy luồng, suy họ topology; phiên import; bảng hợp nhất; bảy bước tự kiểm; test bắt buộc).
- [docs/implementation-notes.md](docs/implementation-notes.md): chỗ mã khác hoặc thêm so với spec, quyết định nhỏ, và tình trạng so với định nghĩa hoàn thành.
