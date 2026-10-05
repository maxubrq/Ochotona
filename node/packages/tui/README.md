# @ochotona/tui

Lệnh `ocho-tui`: giao diện terminal toàn màn hình của Ocho. Cùng dữ liệu, cùng chữ với `ocho`, nhưng chọn bằng phím mũi tên thay vì nhớ cờ, và báo cáo dài được tách thành danh sách bên trái, chi tiết bên phải.

```sh
ocho-tui                                   # Home: context đã lưu, thêm context, nối bằng URL, mở ảnh chụp, tra luật
ocho-tui --context prod                    # vào thẳng doctor trên prod
ocho-tui --url http://localhost:42011 --user ocho-doctor   # hỏi mật khẩu trong ô ẩn
ocho-tui --from snap.json                  # đọc ảnh chụp, không cần mạng
```

Nhận cùng cờ với `ocho doctor` (bộ phân tích của CLI kiểm, nên cờ sai báo y như `ocho`). Không nhận `--json`, `--password-stdin`, `--save`: đó là việc của script, dùng `ocho`. Không có terminal thì thoát với exit 4.

## Màn hình

| Màn hình        | Làm gì                                                                                                                                                                         | Lệnh `ocho` tương đương                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Home            | Context đã lưu (● là mặc định) và chi tiết của nó; Enter mở menu việc làm được, mỗi việc có phím tắt in sẵn bên phải                                                           | `context list`, `context show`             |
| Doctor          | Ba dòng đầu và dòng đếm như báo cáo văn bản; bên trái: làm trước, lỗi theo mức, chưa kiểm, đã miễn trừ, đã qua, điểm mù; bên phải: khối chi tiết đủ năm nhãn của mục đang chọn | `doctor`                                   |
| Doctor options  | Form cho `--vhost`, `--fail-on`, `--target-version`, `--flow`, `--file`, `--no-file`, `--experimental`                                                                         | `doctor --vhost … --fail-on …`             |
| Explain         | Từ doctor: Enter giải thích luật, `o` giải thích queue hay exchange đang chọn; từ Home: form tên, loại, vhost                                                                  | `explain T2`, `explain queue orders`       |
| Rules and codes | Mọi luật, điểm mù, mã chẩn đoán, lọc bằng `/`; bên phải là đầu ra của `ocho explain <mã>`                                                                                      | `explain <mã>`                             |
| Import          | Mỗi câu hỏi là một menu, giải thích của lựa chọn đang tô sáng hiện ngay dưới; `D` lấy mặc định cho phần còn lại; xem trước rồi mới ghi; Esc hỏi trước khi dừng và không ghi gì | `import`, `import --from definitions.json` |
| Add context     | Form, nối thử trước khi lưu (mật khẩu hỏi trong ô ẩn nếu chưa có lệnh lấy mật khẩu)                                                                                            | `context add`                              |

Mọi kết quả in mờ lệnh `ocho` cho ra đúng kết quả đó ở trên cùng, để chép vào script hay CI. Trong doctor: `s` lưu ảnh chụp (mặc định ẩn tên host), `e` xuất `ocho.report/1` ra file, `r` chạy lại.

**Phím chung**: `?` trợ giúp của màn hình hiện tại, `L` đổi tiếng Anh, tiếng Việt, Esc lùi một màn hình, `q` lùi (ở Home thì thoát), Ctrl-C thoát ngay. Dòng cuối luôn in phím dùng được.

## Nguyên tắc

- **Không tự làm việc của CLI.** Mỗi thao tác dựng một phiên CLI từ argv như người dùng gõ `ocho …` (`makeSession` + `parse`), với IO bắt đầu ra thay vì in lên terminal. Cờ, thứ tự ưu tiên, lỗi D5, chữ, exit code đều của CLI. CLI xuất các bước này qua `@ochotona/cli/api`: `diagnose` (bước 1 tới 11 của doctor, không in), `prepareImport`, `importResult`, `writeImport`, các khối render (`failBlock`, `headLines`…).
- **Chỉ đọc.** Như `ocho`: không gì ghi lên broker. File chỉ được ghi khi người dùng chọn: context, `ocho.yaml` (sau bước xem trước), ảnh chụp, JSON.
- **Không lộ mật khẩu.** Khi CLI báo không có nguồn mật khẩu (CX11), mật khẩu sai (CX3) hay lệnh lấy mật khẩu hỏng (CX7), TUI hỏi trong ô ẩn rồi chạy lại phiên với `OCHO_PASSWORD` chỉ trong env của phiên đó. Mật khẩu nằm trong bộ nhớ tới khi thoát; không vào argv, lệnh tương đương hay đĩa.
- **Màn hình dưới vẫn sống.** Quay lại từ explain không chạy lại doctor; chạy lại là phím `r`.

## Cấu trúc

```
src/
  bin/ocho-tui.ts     --version không nạp gì; còn lại nạp main lười
  main.tsx            runTui(argv, io): kiểm cờ bằng CLI, mở Ink
  ocho.ts             cầu nối tới CLI: đích, phiên, IO bắt đầu ra, mật khẩu
  App.tsx             chồng màn hình, hộp thoại mật khẩu/xác nhận, phím chung, dòng gợi ý
  context.tsx         React context: điều hướng, ngôn ngữ, trạng thái từng màn hình
  ui.tsx              Pane, ListView (có dòng tiêu đề nhóm), ScrollText, Form
  views/              Home, Doctor, Explain, Import, TextView, FormView, Help, actions
  i18n/{en,vi}.json   chữ giao diện riêng của TUI (văn bản về broker lấy từ CLI và spec)
scripts/sea.mjs       binary SEA (xem dưới)
```

Giao diện dùng [Ink](https://github.com/vadimdemedes/ink) 8 và [@inkjs/ui](https://github.com/vadimdemedes/ink-ui) (ô nhập, ô mật khẩu, vòng quay, menu, xác nhận). Ink 8 cần Node ≥ 22; binary SEA mang sẵn Node 24.

## Phát triển

```sh
cd node
pnpm exec turbo run build --filter=@ochotona/tui...   # tui, cli và năm gói
node packages/tui/dist/bin/ocho-tui.js --from snap.json

pnpm --filter @ochotona/tui test        # test giao diện qua Ink với terminal giả 120×40
pnpm --filter @ochotona/tui typecheck
pnpm --filter @ochotona/tui test:sea    # dựng dist/sea/ocho-tui rồi chạy test/bin.test.ts trên nó
```

Test giao diện (`test/harness.tsx`) gắn `App` vào terminal giả kích thước cố định, gõ phím, đợi chữ xuất hiện. Broker là mock phát lại bản ghi thô của SUT, và IO giả, dùng chung với test của CLI.

## Binary SEA

`pnpm build:sea` gói `src/bin/ocho-tui.ts` thành một file CommonJS bằng esbuild rồi nhúng vào bản sao của node, như CLI. Khác CLI ở một chỗ: `yoga-layout` (bộ dàn trang của Ink) nạp WASM bằng top-level await, thứ CommonJS không có, trong khi Node 24 SEA chỉ nhận CommonJS. `scripts/yoga-shim.mjs` thay nó: điểm vào đợi WASM nạp xong rồi mới nạp giao diện. Các nhánh chỉ dành cho React DevTools của Ink (cũng có top-level await) bị bỏ lúc gói.

CI: `.github/workflows/tui-ci.yml` (typecheck, format, test trên Node 22, 24, rồi SEA), `tui-sea.yml` (4 nền tảng, artifact `ocho-tui-<target>`). TUI phát hành cùng `ocho`: cùng phiên bản (release-please nâng cả hai), binary đính kèm cùng release `cli-vX.Y.Z`. Xem [docs/release.md của CLI](../cli/docs/release.md).
