#!/usr/bin/env bash

# File lưu trạng thái chạy gần nhất
STATE_FILE=".last_compose_env"

show_usage() {
    echo "Sử dụng:"
    echo "  $0 up <version> <profile>   - Khởi chạy docker compose"
    echo "  $0 down                     - Hạ docker compose theo cấu hình gần nhất"
    echo ""
    echo "Ví dụ:"
    echo "  $0 up 4.2 traffic"
    echo "  $0 down"
}

COMMAND="$1"

case "$COMMAND" in
    up)
        VERSION="$2"
        PROFILE="$3"

        if [ -z "$VERSION" ] || [ -z "$PROFILE" ]; then
            echo "Lỗi: Lệnh 'up' yêu cầu đủ tham số version và profile."
            show_usage
            exit 1
        fi

        COMPOSE_FILE="${VERSION}/docker-compose.yml"

        if [ ! -f "$COMPOSE_FILE" ]; then
            echo "Lỗi: Không tìm thấy file $COMPOSE_FILE"
            exit 1
        fi

        echo "Đang khởi chạy Compose ($COMPOSE_FILE) với profile '$PROFILE'..."
        docker compose -f "$COMPOSE_FILE" --profile "$PROFILE" up -d --wait

        if [ $? -eq 0 ]; then
            # Lưu lại thông số vào file ẩn nếu up thành công
            echo "VERSION=$VERSION" > "$STATE_FILE"
            echo "PROFILE=$PROFILE" >> "$STATE_FILE"
            echo "Đã lưu trạng thái vào $STATE_FILE"
        fi
        ;;

    down)
        if [ ! -f "$STATE_FILE" ]; then
            echo "Lỗi: Không tìm thấy file trạng thái ($STATE_FILE). Hãy chạy lệnh 'up' trước."
            exit 1
        fi

        # Đọc cấu hình từ file đã lưu
        source "$STATE_FILE"
        COMPOSE_FILE="${VERSION}/docker-compose.yml"

        echo "Đang hạ Compose ($COMPOSE_FILE) với profile '$PROFILE'..."
        docker compose -f "$COMPOSE_FILE" --profile "$PROFILE" down

        if [ $? -eq 0 ]; then
            rm -f "$STATE_FILE"
            echo "Đã dọn dẹp file trạng thái $STATE_FILE."
        fi
        ;;

    *)
        show_usage
        exit 1
        ;;
esac
