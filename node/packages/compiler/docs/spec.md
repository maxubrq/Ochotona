# Spec @ochotona/compiler v0.1

Oct 4, 2026 · @Max Darius

## Phạm vi và quyết định

Ở v0.1, `@ochotona/compiler` là mọi thứ nằm giữa file `ocho.yaml` và model: đọc và ghi YAML mà không làm lệch kiểu dữ liệu, suy luồng và họ topology từ broker, điều phối phiên `import`, và chạy tự kiểm vòng tròn. Phần "biên dịch" theo nghĩa hẹp (`Desired` thành definitions, policy, user) là việc của v0.3; mục ranh giới ở cuối tab nói nó sẽ cắm vào đâu.

| Gói này làm | Gói này không làm |
| --- | --- |
| Parse YAML thành object JS, kèm vị trí của từng đường dẫn | Kiểm tra ngữ nghĩa Y1 đến Y14 (model) |
| Ghi `Desired` thành YAML tất định, giữ chú thích của người dùng | Chuẩn hoá topology, diff (model) |
| Suy luồng, suy họ topology | Hỏi người dùng qua terminal (cli) |
| Phiên import: sinh câu hỏi, áp câu trả lời, dựng `Desired` | Đọc, ghi đĩa (cli) |
| Hợp nhất khi import lại | — |
| Tự kiểm vòng tròn | — |

**Ba quyết định.**

1. **Phiên import là máy trạng thái thuần.** Compiler sinh danh sách câu hỏi, nhận câu trả lời, trả `Desired`; không biết terminal, không biết stdin. CLI hỏi qua terminal; chế độ `--non-interactive` trả lời mặc định; bàn đỡ về sau có thể hỏi qua giao diện web bằng đúng máy trạng thái này.
2. **Hai lớp của file được đối xử khác nhau.** Lớp ngữ nghĩa (`families`, `flows`, `services`, `waivers`) là của người dùng: compiler sửa nó bằng cách sửa cây cú pháp YAML, giữ chú thích và thứ tự họ viết. Lớp `topology` là ảnh của broker: compiler sinh lại toàn bộ mỗi lần import, và dòng đầu file nói rõ điều này.
3. **Không dùng tính năng YAML nào mà hai thư viện có thể hiểu khác nhau.** Không anchor, không alias, không tag, không merge key, không nhiều document. File `ocho.yaml` phải đọc giống hệt nhau bằng thư viện của Go, Python hay Rust khi các client đó ra đời.

```
packages/compiler/
  src/
    yaml/read.ts         parse, kiểm cú pháp, bảng vị trí
    yaml/write.ts        sinh YAML, quy tắc trích dẫn, sửa cây giữ chú thích
    infer/flows.ts
    infer/families.ts
    import/session.ts    máy trạng thái
    import/merge.ts      import lại
    import/roundtrip.ts
    index.ts
```

Phụ thuộc lúc chạy: `@ochotona/spec`, `@ochotona/model`, `yaml`.

## Đọc `ocho.yaml`

`readOchoYaml(text)` trả object JS thuần, bảng vị trí, và chẩn đoán cú pháp. Object đó rồi đi vào `model.buildDesired`; compiler không kiểm ngữ nghĩa.

**Tuỳ chọn parse của thư viện `yaml`.** YAML 1.2, schema `core`, `merge: false`, `uniqueKeys: true`, `customTags: []`, `maxAliasCount: 0`, có `LineCounter` để lấy dòng và cột.

**Chẩn đoán cú pháp.** Tiền tố mới YP (lỗi) và YW (cảnh báo), cần đăng ký trong `codes.json`.

| Mã | Mức | Khi nào |
| --- | --- | --- |
| YP1 | lỗi | Lỗi cú pháp YAML |
| YP2 | lỗi | Khoá trùng trong cùng một map |
| YP3 | lỗi | File có nhiều hơn một document |
| YP4 | lỗi | Có anchor, alias, tag hoặc merge key `<<` |
| YP5 | lỗi | Số nguyên vượt `Number.MAX_SAFE_INTEGER`; viết thành chuỗi nếu đó là tên |
| YP6 | lỗi | File lớn hơn 5 MB |
| YW1 | cảnh báo | Số nguyên có số 0 ở đầu (`017`): YAML 1.2 đọc là 17, YAML 1.1 đọc là 15 |
| YW2 | cảnh báo | Chuỗi `yes`, `no`, `on`, `off`, `y`, `n` ở chỗ schema đòi boolean: YAML 1.2 coi chúng là chuỗi |

YW2 tồn tại vì lỗi Y2 của model ("sai kiểu") đúng nhưng không giúp gì cho người vừa gõ `durable: yes` theo thói quen YAML 1.1. Cảnh báo đi kèm Y2 ở cùng vị trí, nói thẳng: "YAML 1.2 reads `yes` as a string; write `true`".

**Bảng vị trí.** Map từ đường dẫn (mảng khoá, giống `path` của chẩn đoán model) sang `{ line, column, endLine, endColumn }` của **giá trị** tại đường dẫn đó, và của khoá khi giá trị vắng. Đường dẫn không có trong file (khoá bắt buộc bị thiếu) thì trỏ về map cha.

## Ghi `ocho.yaml`

Cùng một `Desired` luôn cho cùng một chuỗi byte. Đó là điều kiện để `import` lại cho diff git sạch, và để tự kiểm vòng tròn có nghĩa.

**Ba dòng đầu file.**

```yaml
# yaml-language-server: $schema=<URL schema ocho-yaml 0.1 theo docs.spec của gói spec>
# ocho import 0.1.0 · context prod · 2026-10-04T01:30:00.000Z
# Edit families, flows, services, waivers. The topology section mirrors the broker; ocho import rewrites it.
```

**Thứ tự khoá cấp cao nhất:** `spec`, `broker`, `families`, `flows`, `services`, `waivers`, `topology`. Trong `families`, `flows`, `services`: sắp theo tên khi tạo mới; khi import lại thì giữ thứ tự người dùng đã có, phần tử mới thêm vào cuối.

**Thứ tự khoá trong một luồng:** `vhost` (bỏ khi là `/`), `tolerance` (luôn ghi, kể cả `undeclared`, để quyết định còn treo hiện ra trên file), rồi khoá đích theo thứ tự `family`, hoặc `exchange`, `routing_key`, `groups`, hoặc `queue`.

**Lớp `topology`.** Mỗi danh sách sắp theo `refKey`. Mỗi phần tử viết một dòng kiểu flow (`{ … }`) khi vừa 120 ký tự, nếu không thì kiểu block; thứ tự khoá cố định: `vhost`, `name`, `type`, `durable`, `auto_delete`, `internal`, `arguments`, `flow`.

**Quy tắc trích dẫn chuỗi.** Một chuỗi được đặt trong nháy kép khi bất kỳ điều kiện nào đúng; còn lại viết trơn:

- rỗng, hoặc có khoảng trắng đầu hay cuối;
- YAML 1.2 **hoặc** YAML 1.1 sẽ đọc nó thành không phải chuỗi: `true`, `false`, `yes`, `no`, `on`, `off`, `y`, `n` (mọi kiểu hoa thường), `null`, `~`, số thập phân, số có `0x`, `0o`, `0` đầu, số kiểu `1:20`, `.inf`, `.nan`, ngày giờ;
- bắt đầu bằng một trong `- ? : , [ ] { } # & * ! | > ' " % @` hoặc dấu backtick;
- chứa ` :  ` hoặc `  # `;
- chứa ký tự điều khiển (được escape kiểu `\uXXXX`).

Điều kiện thứ hai xét cả YAML 1.1 vì người khác có thể đọc file bằng công cụ cũ: queue tên `on` viết trơn sẽ thành `true` dưới PyYAML.

**Định dạng.** Thụt lề 2 dấu cách, không tab, xuống dòng LF, kết thúc bằng một dòng trống, không gấp dòng (`lineWidth: 0`) vì gấp dòng có thể đổi khoảng trắng của chuỗi. Ký tự Unicode ghi nguyên văn.

## Suy luồng

`inferFlows(topology)` trả danh sách ứng viên luồng tất định, từ topology đã chuẩn hoá. Thứ gì không thành luồng được thì được liệt kê kèm lý do, để dòng "unmanaged" của `import` nói được vì sao.

| Exchange hoặc binding | Luồng sinh ra | Tên |
| --- | --- | --- |
| Exchange `fanout` | Một luồng dạng `fanout`, `groups` là mọi queue gắn vào | Tên exchange |
| Exchange `direct`, `topic`: mỗi routing key khác nhau | Một luồng dạng `binding`, `groups` là các queue gắn bằng key đó | Key, nếu khớp `^[a-z0-9_-]+(\.[a-z0-9_-]+){2,}$` (ít nhất ba đoạn, không ký tự đại diện); không thì `<exchange>/<key>` |
| Queue chỉ nhận từ exchange mặc định | Một luồng dạng `direct` | `direct:<queue>` |
| Exchange `headers` | Không sinh luồng | Unmanaged, lý do `headers_exchange`: dạng đích của v0.1 không diễn đạt được định tuyến theo header |
| Binding exchange tới exchange | Không sinh luồng | Unmanaged, lý do `exchange_to_exchange` |

**Va tên.** Hai ứng viên cùng tên ở hai vhost khác nhau: thêm hậu tố `@<vhost>` cho ứng viên không ở `/`. Vẫn còn va (cùng vhost, hai exchange có cùng key): mọi ứng viên va đều chuyển sang dạng `<exchange>/<key>`. Sau hai bước này tên là duy nhất vì cặp (exchange, key) là duy nhất trong một vhost.

**Thứ tự** theo vhost, exchange, key. Một queue có thể thuộc nhiều luồng; đó là cấu trúc thật của broker, không phải lỗi.

**Tốc độ của luồng**, chỉ dùng để xếp thứ tự câu hỏi: lớn nhất trong `publishRate` của các queue trong `groups`. Đây là xấp xỉ, vì tốc độ của queue gộp mọi đường đi vào nó; nó đủ để đưa luồng bận nhất lên trước, và không được dùng vào việc gì khác.

## Suy họ topology

`inferFamilies(topology)` tìm nhóm queue chỉ khác nhau ở đúng một đoạn tên và có cấu hình giống nhau, rồi đề xuất thành family. Mọi bước tất định; một queue thuộc tối đa một đề xuất.

1. **Tách tên** thành chuỗi xen kẽ từ và dấu phân cách `.`, `_`, `-`. `request_clamav_q` thành `request` `_` `clamav` `_` `q`.
2. **Gom theo khung.** Queue cùng vhost, cùng số từ, cùng chuỗi dấu phân cách vào một nhóm.
3. **Tìm vị trí tham số.** Với mỗi vị trí từ `i`, gom các queue giống nhau ở mọi từ trừ `i`. Nhóm có ≥ 3 queue là ứng viên, vị trí `i` là tham số.
4. **Tách theo chữ ký.** Chữ ký = loại queue, `durable`, `autoDelete`, `stableJson(arguments)`, tên policy đang áp. Ứng viên có nhiều chữ ký thì tách; nhóm con còn ≥ 3 queue mới giữ.
5. **Khớp routing key.** Mọi thành viên phải có đúng một binding từ cùng một exchange E; các routing key đó cùng khung, khác nhau ở đúng một vị trí `j`, và từ ở `j` của key bằng từ ở `i` của tên queue, với từng thành viên. Không khớp thì không có family: các queue ở lại thành luồng thường, vì dạng family của `ocho.yaml` gắn với một exchange và một mẫu key.
6. **Lọc giá trị.** Giá trị tham số chứa `.`, `*`, `#`, `/`, `+` vi phạm H2; thành viên đó bị loại, ứng viên còn ≥ 3 thành viên mới giữ.
7. **Giải chồng lấn.** Một queue nằm trong nhiều ứng viên thì giữ ứng viên nhiều thành viên hơn; hoà thì vị trí tham số nhỏ hơn; vẫn hoà thì mẫu tên nhỏ hơn theo code unit.

```ts
export interface FamilyProposal {
  readonly id: string;                         // ổn định: băm của vhost, exchange, mẫu
  readonly vhost: string;
  readonly exchange: string;
  readonly queueTemplate: string;              // 'request_{p1}_q'
  readonly routingKeyTemplate: string;         // 'request_{p1}'
  readonly members: readonly string[];         // ['clamav', 'pdf', 'yara'], đã sắp
  readonly evidence: readonly string[];        // tên queue thật
}
```

Đề xuất luôn dùng danh sách thành viên tĩnh. Chuyển sang `members: registry` là quyết định của người dùng, làm bằng cách sửa file, vì nó đổi cách Ocho hiểu "queue mới xuất hiện" và không nên được chọn qua một phím bấm.

## Phiên import

Phiên import là một máy trạng thái thuần ba pha: `families` → `tolerance` → `done`. CLI lặp `questions()`, hỏi, gọi `answer()`, cho tới khi không còn câu hỏi, rồi gọi `result()`.

```ts
export function createImportSession(input: {
  topology: Topology;                 // topologyFromActual, đã chuẩn hoá
  actual: Actual;                     // cho tốc độ, phiên bản
  existing: ExistingFile | null;      // ocho.yaml đã có: { text, desired }
  context: { name: string; toolVersion: string; now: Instant };
}): ImportSession;

export interface ImportSession {
  questions(): readonly Question[];   // câu hỏi của pha hiện tại, đã xếp thứ tự
  answer(id: string, a: Answer): Result<void, AnswerError>;
  answerDefaults(): void;             // --non-interactive
  result(): Result<ImportResult, ImportError>;
}

export type Question =
  | { id: string; kind: 'family'; proposal: FamilyProposal }
  | { id: string; kind: 'tolerance'; flow: FlowCandidate; rate: Rate | null;
      queues: number; consequence: I18nKey };

export type Answer =
  | { kind: 'family'; action: 'accept' | 'skip' }
  | { kind: 'family'; action: 'rename'; param: string }
  | { kind: 'tolerance'; value: Tolerance; scope: 'flow' | 'exchange' };
```

**Pha `families`.** Một câu hỏi cho mỗi đề xuất. `accept` gộp các luồng của thành viên thành một luồng dạng `family`; `rename` kiểm tên tham số theo `^[a-z][a-z0-9_]*$` rồi coi như `accept`; `skip` giữ các luồng riêng. Hết câu hỏi thì tập luồng được tính lại, và pha chuyển sang `tolerance`.

**Pha `tolerance`.** Một câu hỏi cho mỗi luồng chưa có dung sai trong file cũ, xếp theo tốc độ giảm dần, rồi số queue giảm dần, rồi tên. `scope: 'exchange'` áp cùng giá trị cho mọi luồng còn lại của cùng exchange và xoá các câu hỏi đó. `consequence` trỏ tới văn bản i18n nói một dòng hệ quả của `strict` cho luồng đó.

**Mặc định của `--non-interactive`.** Đề xuất family không được chấp nhận, mà được ghi thành chú thích ngay dưới khoá `families`, để người duyệt thấy và tự quyết:

```yaml
families:
  # ocho: proposal: request_{p1}_q via scan.request, key request_{p1}, members [clamav, pdf, yara]
  # ocho:   run `ocho import` interactively, or add the family by hand
```

Dung sai mặc định là `undeclared`.

**Kết quả.** `ImportResult` gồm `desired`, `yaml` (chuỗi để CLI ghi ra đĩa), `summary` (số luồng, số family, số đối tượng unmanaged theo lý do, số câu đã trả lời), và kết quả tự kiểm vòng tròn. `result()` trả lỗi `IM1` khi tự kiểm hỏng; khi đó CLI không ghi file.

## Import lại và hợp nhất

Import lại không bao giờ làm mất một quyết định của người dùng (A2: hỏi một lần). Nó chỉ làm mới ảnh của broker và hỏi về những gì mới xuất hiện.

| Phần của file | Khi import lại |
| --- | --- |
| `spec` | Giữ. Khác major với gói spec đang chạy → IM2, dừng |
| `broker.min_version` | Giữ giá trị người dùng. Broker thật thấp hơn giá trị này → cảnh báo |
| `families` | Giữ nguyên. Ứng viên mới không chồng lên family đã có → hỏi như lần đầu |
| Thành viên tĩnh của family | Queue mới khớp mẫu → câu hỏi `family_members` (thêm hay không). Thành viên không còn trong broker → giữ, thêm chú thích Ocho |
| `flows` | Giữ nguyên, kể cả dung sai. Luồng mà mọi đối tượng đã biến mất → giữ, thêm chú thích Ocho. Ứng viên mới chưa được luồng nào phủ → hỏi dung sai |
| `services`, `waivers` | Không đụng tới |
| `topology` | Sinh lại toàn bộ |
| Chú thích của người dùng trong lớp ngữ nghĩa | Giữ nguyên vị trí |
| Chú thích của Ocho | Xoá rồi sinh lại |

**Chú thích của Ocho** luôn bắt đầu bằng `# ocho:`, để phân biệt chắc chắn với chú thích của người dùng. Chú thích đề xuất family ở mục trước do đó có dạng `# ocho: proposal: request_{p1}_q …`, và chú thích luồng mất đối tượng có dạng `# ocho: not found in broker at 2026-10-04T01:30:00Z`.

**File cũ có lỗi.** Có bất kỳ lỗi YP hay Y nào thì IM2: không hợp nhất, không ghi đè, thông báo chỉ dòng lỗi. Một file người dùng đang sửa dở không bao giờ bị thay bằng bản Ocho sinh ra.

**Thay đổi in ra.** Lớp `topology`: `diffTopology(cũ, mới)`, dạng `+ queue billing.ledger`, `~ queue orders: arguments.x-max-length 1000 → 5000`. Lớp ngữ nghĩa: số luồng mới, số family mới, số thành viên đã thêm, số luồng mất đối tượng.

CLI chịu trách nhiệm phần còn lại: băm file lúc đọc và so lại ngay trước khi ghi; file đã đổi trong lúc hỏi thì không ghi, yêu cầu chạy lại.

## Tự kiểm vòng tròn

`roundTrip(desired, actual, now)` chạy bảy bước; hỏng ở bước nào thì dừng, trả IM1 kèm bước và tối đa 20 khác biệt đầu tiên.

1. `A = normalizeTopology(topologyFromActual(actual))`.
2. `text = writeOchoYaml(desired)`.
3. `parsed = readOchoYaml(text)`: phải không có chẩn đoán nào, kể cả cảnh báo YW.
4. `d2 = model.buildDesired(parsed.value, now)`: phải thành công.
5. `diffTopology(A, normalizeTopology(d2.topology))` phải rỗng.
6. Lớp ngữ nghĩa (`spec`, `broker`, `families`, `flows`, `services`, `waivers`) của `desired` và `d2` phải bằng nhau theo `stableJson`.
7. `writeOchoYaml(d2)` phải giống `text` từng byte.

Bước 5 bảo đảm U3 (`plan` ngay sau `import` cho 0 thay đổi). Bước 6 bảo đảm quyết định của người dùng không bị đổi nghĩa khi qua YAML. Bước 7 bảo đảm import lại trên một broker không đổi cho diff git rỗng; thiếu bước này, một khác biệt nhỏ ở cách trích dẫn sẽ hiện ra như thay đổi mỗi lần chạy, và người dùng sẽ học cách lờ diff đi.

## Định vị chẩn đoán

`locate(diagnostics, positions, file)` gắn dòng và cột cho mọi chẩn đoán YP, YW (của compiler) và Y (của model), rồi sắp theo dòng, cột, mã.

Dạng văn bản theo quy ước của trình biên dịch GNU, để editor và CI bắt được không cần cấu hình:

```
ocho.yaml:12:5: error Y4 flow "billing.invoice.created" has two target forms (family, exchange)
ocho.yaml:30:14: warning YW2 "yes" is a string in YAML 1.2; write true
```

Dạng JSON: `{ file, line, column, endLine, endColumn, code, severity, message, path }`. Đường dẫn không có trong file (khoá bắt buộc bị thiếu) trỏ về vị trí của map cha. Hàm này được `lint` của v0.2 dùng lại nguyên vẹn.

## Ranh giới với v0.3

Phần biên dịch theo nghĩa hẹp chưa có ở v0.1, nhưng hợp đồng của nó đã được chốt bởi các tab trước, nên v0.1 không được làm gì phá nó.

```ts
// v0.3, module compile/ — chỉ khai ở đây để giữ chỗ
export function compile(desired: Desired, caps: Capabilities): {
  topology: Topology;          // trạng thái mong muốn, cùng hình dạng với topologyFromActual
  users: readonly UserSpec[];  // Q1: một user cho mỗi service
};
// plan = diffTopology(normalizeTopology(actualTopology), normalizeTopology(compiled.topology))
//        + nhãn hot | migrate | restart | redeploy theo từng FieldChange
```

Đây là lý do `Topology` là hình dạng chung ở tab model: `plan` của v0.3 là đúng hàm `diffTopology` mà tự kiểm vòng tròn của v0.1 đang dùng. Chiến lược sinh topology theo `broker.min_version` (mục 9 của spec lõi) lấy từ `capabilitiesFor`, cùng nguồn mà luật dùng.

## API công khai

```ts
// YAML
export function readOchoYaml(text: string): {
  value: unknown | null; positions: PositionMap; diagnostics: readonly YamlDiag[];
};
export function writeOchoYaml(desired: Desired, opts: {
  header: { context: string; toolVersion: string; at: Instant; schemaUrl: string };
  ochoComments: readonly OchoComment[];    // đề xuất, đối tượng mất…
  base?: { text: string };                 // file cũ, để giữ chú thích và thứ tự của người dùng
}): string;
export function loadOchoYaml(text: string, now: Instant):
  Result<{ desired: Desired; positions: PositionMap; warnings: readonly LocatedDiag[] },
         readonly LocatedDiag[]>;          // read + model.buildDesired + locate

// Suy luận
export interface FlowCandidate {
  readonly name: string; readonly vhost: string; readonly target: FlowTarget;
  readonly queues: number; readonly rate: Rate | null;
}
export function inferFlows(t: Topology): {
  candidates: readonly FlowCandidate[];
  unmanaged: readonly { ref: ObjectRef; reason: 'headers_exchange' | 'exchange_to_exchange' }[];
};
export function inferFamilies(t: Topology): readonly FamilyProposal[];

// Import
export function createImportSession(input: ImportInput): ImportSession;
export function roundTrip(desired: Desired, actual: Actual, now: Instant):
  Result<void, { code: 'IM1'; step: 1 | 2 | 3 | 4 | 5 | 6 | 7; differences: readonly string[] }>;

// Chẩn đoán
export function locate(diags: readonly (YamlDiag | Diag)[], positions: PositionMap, file: string):
  readonly LocatedDiag[];
export function formatGnu(d: LocatedDiag, lang: Lang): string;
```

## Test bắt buộc và định nghĩa hoàn thành

| Nhóm | Test | Nghiệm thu |
| --- | --- | --- |
| Đọc | Mỗi mã YP, YW; vị trí của đường dẫn lồng sâu; file 5 MB; tài liệu "billion laughs" | Đúng mã, đúng dòng và cột; anchor bị chặn bằng YP4 trước khi mở rộng |
| Trích dẫn, chéo thư viện | fast-check sinh chuỗi: tập mơ hồ của YAML 1.1 đủ mọi kiểu hoa thường, số đủ dạng, ngày giờ, Unicode, ký tự điều khiển, ký tự đặc biệt ở đầu | Ghi rồi đọc lại bằng `yaml` (1.2) **và** bằng `js-yaml` (1.1) đều trả đúng chuỗi gốc |
| Tất định | Cùng `Desired` ghi hai lần | Giống từng byte |
| Giữ chú thích | File vàng có chú thích người dùng ở mọi cấp, import lại trên broker đã đổi | Chú thích người dùng còn nguyên vị trí; chú thích `# ocho:` được làm mới |
| Suy luồng | Bảng mọi loại exchange, binding exchange tới exchange, va tên hai bậc | Đúng ứng viên, đúng tên, đúng lý do unmanaged |
| Suy họ topology | Ca dương: `request_{engine}_q` ba thành viên. Ca âm: hai thành viên; chữ ký khác; routing key lệch; vi phạm H2; chồng lấn hai ứng viên | Đúng đề xuất, hoặc đúng không có đề xuất |
| Phiên import | Mọi chuyển trạng thái; `rename` sai mẫu; `scope: exchange`; chế độ không tương tác | Đúng câu hỏi còn lại; đúng chú thích đề xuất |
| Hợp nhất | Mỗi dòng của bảng hợp nhất có một ca vàng; file cũ có lỗi | Đúng kết quả; IM2 và không ghi |
| Vòng tròn | fast-check sinh topology ngẫu nhiên (dùng chung bộ sinh của tab model) | 7 bước xanh sau 10.000 ca |
| Định vị | Snapshot dạng GNU, tiếng Anh và tiếng Việt | Khớp |
| Hiệu năng | Import không tương tác broker 10.000 queue, 300 family ứng viên | ≤ 2 giây cho suy luận, ghi và tự kiểm |

**Định nghĩa hoàn thành.**

- [ ] Mọi test ở bảng trên xanh; phủ nhánh ≥ 95% cho `yaml/write.ts`, `infer/families.ts`, `import/merge.ts`.
- [ ] Ba fixture import của tab v0.1 (một có family) chạy qua `createImportSession` và `roundTrip` xanh.
- [ ] Mã YP, YW, IM đã đăng ký trong `codes.json`, đủ văn bản hai thứ tiếng.
- [ ] Phụ thuộc lúc chạy chỉ có `spec`, `model`, `yaml`; `js-yaml` và `fast-check` chỉ ở dev.

## Thay đổi và giả định

| # | Thay đổi | Chỗ cần sửa |
| --- | --- | --- |
| 1 | Mã mới YP1 đến YP6, YW1, YW2, IM1, IM2 | Tab spec: `codes.json`, i18n |
| 2 | Chú thích do Ocho ghi luôn bắt đầu bằng `# ocho:` | Tab v0.1, ví dụ `ocho.yaml` ở mục import |
| 3 | Exchange `headers` và binding exchange tới exchange không thành luồng ở v0.1 | Tab v0.1, bảng suy luồng |
| 4 | Quy tắc va tên luồng hai bậc | Tab v0.1, bảng suy luồng |
| 5 | Câu hỏi mới `family_members` khi import lại | Tab v0.1, mục import lại |
| 6 | Phiên import là máy trạng thái thuần trong compiler; CLI chỉ hỏi và ghi | Tab v0.1, cấu trúc repo (`prompt.ts` của CLI chỉ còn phần terminal) |

| Mã | Giả định | Kiểm ở |
| --- | --- | --- |
| GC28 | Thư viện `yaml` giữ được chú thích và thứ tự khi thêm, sửa, xoá phần tử của map qua API `Document` | Test giữ chú thích |
| GC29 | `js-yaml` đại diện đủ cho cách các công cụ YAML 1.1 (PyYAML, Ruby Psych) hiểu chuỗi mơ hồ | So bảng chuỗi mơ hồ với tài liệu của PyYAML |
