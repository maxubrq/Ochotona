# Sửa dữ liệu

Người sửa spec chỉ sửa file trong `data/`. Sau mỗi lần sửa, chạy `pnpm codegen` và commit cả `data/` lẫn `src/gen/`.

## Các file

| File                           | Nội dung                                                                                                                                  | Sắp theo                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `spec.json`                    | Phiên bản spec, hợp đồng, broker hỗ trợ; mức, kết quả, dung sai, loại đối tượng, loại lý do `unknown`, exit code; khuôn liên kết tài liệu | —                                            |
| `codes.json`                   | Sổ đăng ký mọi mã                                                                                                                         | `code`, thứ tự tự nhiên (`CL2` trước `CL10`) |
| `rules.json`                   | Danh mục luật                                                                                                                             | `code`                                       |
| `capabilities.json`            | Bảng năng lực theo khoảng phiên bản                                                                                                       | `from`                                       |
| `keys.json`                    | Khoá argument và policy                                                                                                                   | `canonical`                                  |
| `exclusions.json`              | Loại trừ hệ thống                                                                                                                         | `id`                                         |
| `fix-templates.json`           | Khuôn lệnh sửa (rabbitmqadmin) mà `@ochotona/rules` điền                                                                                  | —                                            |
| `blind-spots.json`             | Lỗi của lesson mục 9 và nơi bắt                                                                                                           | `id`                                         |
| `i18n/en.json`, `i18n/vi.json` | Văn bản                                                                                                                                   | —                                            |
| `i18n/glossary.json`           | Thuật ngữ RabbitMQ giữ nguyên trong tiếng Việt, kèm các bản dịch bị cấm                                                                   | `term`                                       |

Ghi chú trong JSON dùng khoá `$comment`. Không dùng `null` với nghĩa "không biết"; thiếu thì vắng khoá.

## Thêm một luật

1. Đăng ký mã trong `codes.json`. Luật cưỡng chế đúng một luật spec lõi thì dùng lại mã đó (`owner: spec-core`); luật không có đối ứng dùng tiền tố của công cụ (`VT`, `DX`), `owner: tool`, `kind: tool-rule`, và `enforces` nếu có.
2. Thêm dòng vào `rules.json`. `tier` là bậc của mức cao nhất trong `severities`; `specRef` là `spec/<major.minor>#<mã>`.
3. Thêm sáu khoá `rule.<MÃ>.{title,what,dataSafety,next,mechanism,action}` vào cả `en.json` và `vi.json`. Tập tham số dùng trong năm khoá đầu, cộng các khoá theo biến thể, phải đúng bằng `params`; `action` phải có `{objects}`.
   Luật có nhiều biến thể thêm khoá `rule.<MÃ>.<what|dataSafety|next|mechanism>.<biến thể>` (ví dụ `rule.T2.what.dropped_node`), có ở cả hai ngôn ngữ; biến thể không có khoá riêng dùng khoá gốc.
   Ngưỡng số của luật nằm ở trường `thresholds` của dòng đó trong `rules.json`; hiệu chỉnh ngưỡng là sửa dữ liệu, không sửa code luật.
4. Nếu luật đọc khoá argument hay policy, thêm mã vào `usedBy` của khoá trong `keys.json`. Nếu luật bắt một lỗi của lesson, thêm vào `rules` của dòng tương ứng trong `blind-spots.json`.
5. `pnpm codegen && pnpm test`.

Luật mới nên vào với `status: experimental`: nó chạy nhưng không làm exit khác 0.

## Khuôn câu

`{tên}` cho tham số; số nhiều viết `{count, plural, one {# message} other {# messages}}`. Tiếng Anh dùng đúng `one` và `other`, tiếng Việt chỉ `other`. Không `select`, không lồng, không tham số trong nhánh số nhiều, không `{` `}` theo nghĩa đen. Số, thời điểm và danh sách được bề mặt định dạng; khuôn câu chỉ nhận giá trị thô.

## Kiểm chéo khi codegen

Codegen dừng ở bước lỗi đầu tiên và in mọi lỗi của bước đó.

1. **Schema.** Mỗi file qua schema của nó trong `schemas/data/` (Ajv strict); bốn schema hợp đồng phải biên dịch được.
2. **Kiểm chéo.**

| Kiểm             | Hỏng khi                                                                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sắp xếp          | Một mảng có khoá định danh không sắp theo khoá đó, hoặc trùng                                                                                                                                                                                               |
| Sổ đăng ký       | Trùng mã; tiền tố không thuộc danh sách hoặc sai chủ; `enforces` trỏ tới mã không phải spec lõi; mã trong `rules`, `exclusions`, `blind-spots`, `keys.assumption` chưa đăng ký hoặc sai loại                                                                |
| Luật             | `family` khác tiền tố; `tier` khác mức cao nhất; `specRef` sai phiên bản hoặc sai neo; `appliesTo` ngoài danh sách loại đối tượng                                                                                                                           |
| Văn bản đủ       | Thiếu khoá bắt buộc của luật, mã chẩn đoán, lý do `unknown`, loại trừ ở `en` hoặc `vi`; có khoá không thuộc thứ gì                                                                                                                                          |
| Tham số          | Tập tham số khác nhau giữa `en` và `vi`, hoặc khác `params` của luật; tham số số nhiều không khai `number`; `action` thiếu `{objects}`                                                                                                                      |
| Quy tắc viết     | `title` > 60 ký tự; `mechanism` > 200 ký tự; `dataSafety` không mở đầu bằng `No.`/`Yes.`/`Not known.` (`Không.`/`Có.`/`Chưa biết.`) hoặc hai thứ tiếng trả lời khác nhau; tính từ mức độ; câu đổ lỗi; Markdown hay mã màu; thuật ngữ trong glossary bị dịch |
| Khoảng phiên bản | Chồng nhau, hở, không bắt đầu từ `minSupported`, khoảng cuối không mở                                                                                                                                                                                       |
| Khoá             | Trùng `canonical`, argument hoặc khoá policy; `usedBy` trỏ tới luật không có                                                                                                                                                                                |
| Loại trừ         | Khoá `match` không hợp với loại đối tượng                                                                                                                                                                                                                   |
| Điểm mù          | LE1 đến LE20 không xuất hiện đúng một lần theo thứ tự; luật không tồn tại; `rules` không khớp với `caughtBy: doctor`                                                                                                                                        |

3. **Sinh** `src/gen/*.ts`, rồi **định dạng** bằng Prettier.

CI chạy `pnpm codegen:check`; `src/gen` lệch so với git là hỏng. `test/checks.test.ts` cũng so `src/gen` với kết quả sinh lại, và có một ca làm hỏng dữ liệu cho mỗi kiểm.
