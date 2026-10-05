# @ochotona/cli

Lệnh `ocho`. Lớp mỏng: phân tích tham số, đọc và ghi đĩa, nói chuyện với terminal, rồi gọi năm gói kia theo đúng thứ tự. Mọi quyết định về dữ liệu (luật nào `fail`, giá trị nào hiệu lực, YAML viết thế nào) nằm ở gói khác; CLI chỉ quyết định cách hiện chúng ra.

Phụ thuộc lúc chạy: năm gói Ocho và `yaml`.

```
spec ← model ← rules, broker, compiler ← cli
```

## Nguyên tắc

- **Lõi là `run(argv, io)` trả exit code.** `io` gom mọi thứ bên ngoài (stdout, stderr, stdin, env, TTY, đồng hồ, fs, exec, signal). `bin/ocho.ts` chỉ nối `io` thật; test đầu-cuối chạy trong tiến trình.
- **stdout chỉ chứa kết quả.** Báo cáo văn bản, hoặc đúng một document JSON (kể cả khi lỗi: `ocho.error/1`). Tiến trình, cảnh báo, `--debug` đi stderr.
- **Chỉ đọc.** Không lệnh nào ghi lên broker; mọi request là GET (CL1).
- **Không lộ bí mật.** Mật khẩu chỉ đi qua `target.ts`; file context chỉ giữ `password_command`.
- **Khởi động lười.** `--version` không nạp gì ngoài hằng số phiên bản; lệnh khác chỉ nạp mã của chính nó.

## Dùng

```sh
npx @ochotona/cli doctor --url https://host:15671 --user ocho-doctor   # hỏi mật khẩu một lần

ocho context add prod --url https://b-1234.mq.example.com --user ocho-doctor \
  --password-command "op read op://infra/rabbit-prod/password"
ocho doctor                          # context hiện tại
ocho doctor --json --fail-on S2 | jq .summary
ocho import                          # hỏi dung sai từng luồng, ghi ocho.yaml
ocho explain T2
ocho explain queue orders --vhost billing
```

Nhúng vào công cụ khác:

```ts
import { nodeIO, run } from '@ochotona/cli';

const code = await run(['doctor', '--json'], nodeIO());
```

Công cụ cần nhiều hơn exit code (như `@ochotona/tui`) dùng `@ochotona/cli/api`: `makeSession`, `parse`, từng bước của lệnh không in gì (`diagnose`, `prepareImport`, `importResult`, `writeImport`), và các khối render của báo cáo (`headLines`, `failBlock`, `summaryLine`…). `doctor` và `import` của CLI chính là các bước đó cộng phần in ra terminal.

## Lệnh

| Lệnh                                   | Việc                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `doctor`                               | Đọc broker (hoặc ảnh chụp `--from`), chấm luật, in báo cáo và ba việc làm trước         |
| `import`                               | Ghi `ocho.yaml` từ topology của broker hoặc `definitions.json`, hỏi dung sai từng luồng |
| `explain <đích>`                       | Mã luật, mã điểm mù, mã chẩn đoán (không cần mạng); `queue`, `exchange`, `flow <tên>`   |
| `context add\|use\|list\|show\|remove` | Quản lý broker đã lưu; `add` nối thử trước khi lưu                                      |
| `version`, `help [lệnh]`               |                                                                                         |

Mật khẩu, theo thứ tự: `--password-stdin`, `OCHO_PASSWORD`, `password_command` của context, ô nhập ẩn khi có terminal. Mọi giá trị khác: cờ > biến môi trường > context > mặc định.

## Exit code

| Mã  | Nghĩa                                                             |
| --- | ----------------------------------------------------------------- |
| 0   | Không có `fail`, không có `not_checked` ở mức `--fail-on` trở lên |
| 1   | Có `fail` ở mức `--fail-on` trở lên (mặc định S1)                 |
| 2   | Không có `fail`, nhưng có luật ở mức đó chưa kiểm được            |
| 3   | Không nối được broker, thiếu quyền, phiên bản không hỗ trợ        |
| 4   | Cách dùng sai: cờ, file context, `ocho.yaml`, ảnh chụp            |
| 5   | Lỗi nội bộ của Ocho                                               |
| 130 | Ctrl-C                                                            |

## Cấu trúc mã

```
src/
  bin/ocho.ts          nối io thật
  run.ts args.ts       chọn lệnh, bắt lỗi ngoài cùng; ngữ pháp, gợi ý cờ gần đúng
  io.ts io-node.ts     kiểu IO và bản trên Node
  target.ts            đích kết nối, mật khẩu
  contexts.ts          file context, quyền 0600
  connect.ts           reader, identify, read cho mọi lệnh
  exit.ts report.ts    exit code của doctor; kết quả dùng chung cho renderer
  commands/            doctor, import, explain, context, version, help
  render/              text, json, progress, errors, layout, color
  prompt/              đọc dòng, ô nhập ẩn
  i18n/{en,vi}.json    chữ giao diện riêng của CLI
```

## Phát triển

```sh
pnpm build          # rollup → dist/ (ESM, tách chunk theo lệnh)
pnpm build:sea      # esbuild + Node SEA → dist/sea/ocho cho nền tảng đang chạy
pnpm test           # vitest; broker giả phát lại bản ghi thô trong fixtures/raw
pnpm test:perf      # ngân sách trên broker giả 10.000 queue: doctor, explain, dòng xác nhận
pnpm test:sea       # dựng binary SEA rồi chạy test/bin.test.ts trên chính nó (test:bin: dist/bin)
pnpm test:coverage
pnpm test:mutation  # Stryker trên exit, target, args, layout; ngưỡng 85%
pnpm typecheck
pnpm format
```

Chạy thử trên broker thật: xem từng bước ở [README gốc](../../../README.md).

## Phát hành

Tự động bằng release-please: commit theo Conventional Commits (`feat:`, `fix:`) lên `main`, merge PR phát hành mà bot mở, rồi binary SEA cho Linux x64/arm64, macOS arm64, Windows x64 được dựng, test và đính kèm vào GitHub Release. Chi tiết ở [docs/release.md](docs/release.md).

## Tài liệu

- [docs/spec.md](docs/spec.md): spec đầy đủ (ngữ pháp, context và mật khẩu, trình tự từng lệnh, bố cục báo cáo, JSON, exit code, lỗi, test bắt buộc).
- [docs/release.md](docs/release.md): luồng phát hành, commit nào nâng phiên bản nào, workflow, cài đặt một lần trên GitHub.
- [docs/implementation-notes.md](docs/implementation-notes.md): chỗ mã khác hoặc thêm so với spec, thay đổi ở gói khác, và tình trạng so với định nghĩa hoàn thành.
