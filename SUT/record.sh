#!/usr/bin/env bash
# Dựng ma trận của một phiên bản, ghi fixture thô cho bốn biến thể, rồi dỡ.
#
#   ./record.sh 4.2            # ghi rồi dỡ
#   KEEP=1 ./record.sh 4.2     # ghi, để broker chạy tiếp
#
# Fixture ghi vào node/fixtures/raw/rabbitmq-<phiên bản>/<biến thể>/.
set -euo pipefail

version="${1:?usage: record.sh <3.13|4.0|4.2|4.3>}"
here="$(cd "$(dirname "$0")" && pwd)"
compose="$here/$version/docker-compose.yml"
broker="$here/../node/packages/broker"
out="$here/../node/fixtures/raw"
[[ -f "$compose" ]] || { echo "không có $compose" >&2; exit 2; }

case "$version" in
  3.13) base=31300 ;; 4.0) base=40000 ;; 4.2) base=42000 ;; 4.3) base=43000 ;;
  *) echo "phiên bản lạ: $version" >&2; exit 2 ;;
esac

docker compose -f "$compose" --profile traffic up -d --wait
if [[ -z "${KEEP:-}" ]]; then
  trap 'docker compose -f "$compose" --profile traffic down -v' EXIT
fi

# Chờ lưu lượng chạy qua vài chu kỳ thống kê (collect_statistics_interval = 1 giây).
sleep "${SETTLE:-15}"

(cd "$broker" && pnpm build >/dev/null)
n=0
for variant in full nostats noprom listonly; do
  n=$((n + 1))
  OCHO_PASSWORD=ocho-doctor node "$broker/tools/record-raw.ts" \
    --url "http://localhost:$((base + 10 + n))" \
    --user ocho-doctor \
    --prometheus "http://localhost:$((base + 20 + n))/metrics" \
    --label "rabbitmq-$version" --variant "$variant" \
    --out "$out" --max-rps 10
done

node "$broker/tools/redact-raw.ts" --check "$out"
node "$broker/tools/check-assumptions.ts" "$out" || true
