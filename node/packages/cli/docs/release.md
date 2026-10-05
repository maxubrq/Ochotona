# Phát hành `ocho`

Phiên bản nâng tự động bằng [release-please](https://github.com/googleapis/release-please) từ commit message. Không ai sửa số phiên bản bằng tay.

## Luồng

1. Commit lên `main` theo [Conventional Commits](https://www.conventionalcommits.org/): `feat: …`, `fix: …`, `feat!: …`.
2. Workflow `Release` chạy release-please. Nó mở (hoặc cập nhật) PR `chore(main): release cli X.Y.Z`, trong đó:
   - `node/packages/cli/package.json`, `node/packages/cli/src/version.ts` (dòng có `x-release-please-version`), `node/package.json` có phiên bản mới;
   - `node/packages/cli/CHANGELOG.md` có mục mới, nhóm theo Features, Bug Fixes, Performance.
3. Merge PR đó khi muốn phát hành. release-please tạo tag `cli-vX.Y.Z` và GitHub Release.
4. Cùng workflow dựng binary SEA từ đúng tag cho 4 nền tảng, chạy test trên từng binary, rồi đính kèm vào release:

| File                             | Nền tảng                 |
| -------------------------------- | ------------------------ |
| `ocho-X.Y.Z-linux-x64.tar.gz`    | Linux x64                |
| `ocho-X.Y.Z-linux-arm64.tar.gz`  | Linux arm64              |
| `ocho-X.Y.Z-darwin-arm64.tar.gz` | macOS Apple Silicon      |
| `ocho-X.Y.Z-win-x64.zip`         | Windows x64              |
| `SHA256SUMS`                     | checksum của mọi archive |

Mỗi archive có attestation nguồn gốc (SLSA build provenance) của GitHub.

## Commit nào nâng phiên bản nào

| Commit                                                   | Trước 1.0                      | Từ 1.0          |
| -------------------------------------------------------- | ------------------------------ | --------------- |
| `fix: …`, `perf: …`                                      | patch: 0.1.0 → 0.1.1           | patch           |
| `feat: …`                                                | minor: 0.1.0 → 0.2.0           | minor           |
| `feat!: …` hoặc footer `BREAKING CHANGE:`                | minor (`bump-minor-pre-major`) | major           |
| `docs:`, `test:`, `ci:`, `chore:`, `refactor:`, `build:` | không phát hành                | không phát hành |

Mọi commit chạm `node/` đều tính, không riêng `node/packages/cli`: binary gói cả spec, model, rules, broker, compiler, nên một `fix:` trong model cũng là bản vá của `ocho`.

Ép một số phiên bản cụ thể (ví dụ lên 1.0.0): thêm footer vào commit bất kỳ:

```
chore: release 1.0.0

Release-As: 1.0.0
```

Lần phát hành đầu: `.release-please-manifest.json` còn rỗng, nên release-please dùng `initial-version` 0.1.0 và gom mọi commit từ đầu repo vào CHANGELOG.

## Cài đặt một lần trên GitHub

- **Settings → Actions → General → Workflow permissions**: bật _Allow GitHub Actions to create and approve pull requests_. Thiếu nó release-please không mở được PR.
- **Tuỳ chọn, secret `RELEASE_PLEASE_TOKEN`**: PAT (fine-grained, quyền Contents và Pull requests read/write) hoặc token của GitHub App. PR mở bằng `GITHUB_TOKEN` không kích hoạt workflow khác, nên không có secret này thì `CLI CI` không tự chạy trên PR phát hành. Binary vẫn được dựng và test lại khi phát hành.
- **Merge kiểu squash**: tiêu đề PR thành commit message, nên tiêu đề PR phải theo Conventional Commits.
- **Runner `ubuntu-24.04-arm`** miễn phí cho repo public. Với repo private, kiểm gói GitHub có runner arm64 không; không có thì bỏ dòng `linux-arm64` trong `cli-sea.yml`.

## Workflow

| File                                 | Khi nào                          | Làm gì                                                                                                                                                        |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/cli-ci.yml`       | PR và push chạm `node/`          | Typecheck, format, `codegen:check`; test 6 gói trên Node 20, 22, 24; test `dist/bin`; gọi `cli-sea.yml`. Test hiệu năng compiler chạy riêng, không chặn       |
| `.github/workflows/cli-sea.yml`      | Được gọi, hoặc chạy tay          | Dựng SEA trên 4 runner, kiểm `--version` khớp `package.json`, đo khởi động (p95 ≤ 100 ms; Windows chỉ báo cáo), chạy `test/bin.test.ts` trên binary, đóng gói |
| `.github/workflows/release.yml`      | Push lên `main`                  | release-please; khi có release thì dựng, tính SHA256SUMS, attestation, đính kèm                                                                               |
| `.github/workflows/cli-mutation.yml` | Thứ Hai hằng tuần, hoặc chạy tay | Stryker, ngưỡng 85%                                                                                                                                           |
| `.github/dependabot.yml`             | Hằng tuần                        | PR nâng các action (pin theo SHA)                                                                                                                             |

## Người dùng tải về

```sh
# Linux, macOS
curl -LO https://github.com/maxubrq/Ochotona/releases/download/cli-vX.Y.Z/ocho-X.Y.Z-linux-x64.tar.gz
curl -LO https://github.com/maxubrq/Ochotona/releases/download/cli-vX.Y.Z/SHA256SUMS
sha256sum --check --ignore-missing SHA256SUMS
gh attestation verify ocho-X.Y.Z-linux-x64.tar.gz --repo maxubrq/Ochotona
tar -xzf ocho-X.Y.Z-linux-x64.tar.gz && ./ocho --version
```

- **macOS**: binary chỉ ký ad-hoc, chưa notarize, nên Gatekeeper chặn file tải bằng trình duyệt. Chạy `xattr -d com.apple.quarantine ocho`. Notarize cần tài khoản Apple Developer, chưa làm.
- **Windows**: binary chưa ký, SmartScreen có thể cảnh báo lần đầu.

## Không nén bằng UPX

Đã thử với UPX 5.2.1 trên binary SEA Linux:

- Nén sau khi nhúng blob: UPX từ chối (`CantPackException: bad e_phoff`), vì postject đã sửa bảng program header.
- Nén node trước rồi nhúng: postject không tìm thấy sentinel `NODE_SEA_FUSE_…` vì nó đã bị nén.

Archive cho kết quả gần bằng mà không đụng tới binary: 43 MB `.tar.gz` so với 118 MB binary, còn UPX nén riêng node được khoảng 37 MB. Khởi động cũng không phải trả giá giải nén mỗi lần chạy.

## Chạy thử trên máy

```sh
cd node
pnpm exec turbo run build --filter=@ochotona/cli...
pnpm --filter @ochotona/cli test:sea          # dựng dist/sea/ocho rồi chạy test/bin.test.ts trên nó
node packages/cli/scripts/startup.mjs packages/cli/dist/sea/ocho
```
