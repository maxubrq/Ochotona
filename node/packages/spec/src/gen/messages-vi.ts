// Sinh bởi scripts/codegen.ts từ data/. Không sửa tay.

import type { I18nKey } from './i18n-keys';

export const messages: Readonly<Record<I18nKey, string>> = {
  'rule.C1.title': 'Consumer tự động ack',
  'rule.C1.what':
    'Một consumer trên queue {queue}, connection {connection}, dùng ack tự động.',
  'rule.C1.dataSafety':
    'Không. Message bị xoá ngay khi gửi đi, nên consumer sập là mất message.',
  'rule.C1.next':
    'Chuyển consumer này sang ack thủ công, gửi sau khi việc đã commit.',
  'rule.C1.mechanism':
    'Với auto-ack, broker xoá message ngay khi ghi nó ra socket; phần việc consumer chưa làm xong sẽ mất.',
  'rule.C1.predicate': 'Consumer đăng ký với ack tự động thay vì ack thủ công.',
  'rule.C1.action': 'Dùng ack thủ công cho {objects}',
  'rule.C2.title': 'Prefetch của consumer không giới hạn hoặc bằng 1',
  'rule.C2.what': 'Một consumer trên queue {queue} có prefetch {prefetch}.',
  'rule.C2.what.one':
    'Một consumer trên queue {queue} có prefetch 1 trong khi queue giao {rate} message mỗi giây.',
  'rule.C2.dataSafety':
    'Có. Không mất gì; prefetch 0 có thể làm cạn bộ nhớ consumer, prefetch 1 giới hạn thông lượng.',
  'rule.C2.next':
    'Đặt prefetch cho consumer này theo giá trị đã đo, ví dụ 20 đến 100.',
  'rule.C2.mechanism':
    'Prefetch 0 cho broker đẩy mọi message sẵn sàng tới consumer; prefetch 1 chờ trọn một vòng đi về cho mỗi message.',
  'rule.C2.predicate':
    'Consumer có prefetch 0 (không giới hạn), hoặc prefetch 1 trên queue giao hơn {highRate} message mỗi giây.',
  'rule.C2.action': 'Chỉnh prefetch cho {objects}',
  'rule.DX1.title': 'Queue đang bị dùng làm kho',
  'rule.DX1.what': 'Queue giữ {ready, plural, other {# message sẵn sàng}}.',
  'rule.DX1.dataSafety':
    'Có. Chưa mất gì, nhưng tồn dài làm chậm khôi phục và đưa memory alarm, disk alarm tới gần hơn.',
  'rule.DX1.next':
    'Tìm lý do consumer chạy chậm hơn, hoặc chuyển dữ liệu sống lâu sang database.',
  'rule.DX1.mechanism':
    'RabbitMQ được thiết kế cho queue ngắn; với hàng triệu message sẵn sàng, thời gian khởi động lại, đồng bộ và bộ nhớ tăng theo tồn.',
  'rule.DX1.predicate': 'Queue giữ hơn {ready} message sẵn sàng.',
  'rule.DX1.action': 'Rút tồn cho {objects}',
  'rule.DX2.title': 'disk_free_limit thấp hơn bộ nhớ của node',
  'rule.DX2.what':
    'Node có disk_free_limit {diskFreeLimitBytes} byte và giới hạn bộ nhớ {memLimitBytes} byte.',
  'rule.DX2.dataSafety':
    'Chưa biết. Đĩa có thể đầy trước khi broker chặn publisher, và đĩa đầy có thể làm mất message.',
  'rule.DX2.next':
    'Đặt disk_free_limit ít nhất bằng giới hạn bộ nhớ của node, ví dụ disk_free_limit.relative = 1.0.',
  'rule.DX2.mechanism':
    'Khi đẩy bộ nhớ xuống đĩa, node có thể ghi tới cỡ bộ nhớ của nó; giới hạn đĩa trống thấp hơn khiến lần ghi đó hết chỗ.',
  'rule.DX2.predicate':
    'Giới hạn đĩa trống của node nhỏ hơn giới hạn bộ nhớ của nó.',
  'rule.DX2.action': 'Nâng disk_free_limit cho {objects}',
  'rule.DX3.title': 'Connection hoặc queue bị tạo liên tục',
  'rule.DX3.what': 'Broker tạo {rate} đối tượng loại {kind} mỗi giây.',
  'rule.DX3.what.connection': 'Broker mở {rate} connection mỗi giây.',
  'rule.DX3.what.queue': 'Broker tạo {rate} queue mỗi giây.',
  'rule.DX3.dataSafety':
    'Có. Không mất gì, nhưng churn tốn CPU và lượt ghi metadata trên mọi node.',
  'rule.DX3.next':
    'Dùng lại connection và channel sống lâu thay vì mở mới cho mỗi request.',
  'rule.DX3.mechanism':
    'Mỗi connection và queue mới đi qua xác thực và một lần ghi metadata store; ở tốc độ cao, tải này tranh chỗ với lưu lượng message.',
  'rule.DX3.predicate':
    'Connection hoặc queue được tạo nhanh hơn {perSecond} mỗi giây.',
  'rule.DX3.action': 'Dùng lại connection trên {objects}',
  'rule.F4.title': 'Message bị giao lại theo vòng lặp',
  'rule.F4.what':
    'Lượt giao lại chiếm tỷ lệ {ratio} trong {deliverRate} message mỗi giây queue này giao.',
  'rule.F4.dataSafety':
    'Chưa biết. Chưa có message nào bị bỏ, nhưng vòng lặp requeue có thể giữ chân mọi message khác trong queue.',
  'rule.F4.next':
    'Reject message lỗi với requeue false để chúng đi qua dead-letter.',
  'rule.F4.mechanism':
    'Nack kèm requeue đặt message lại đầu queue; message luôn lỗi được giao lại ngay, không bao giờ dừng.',
  'rule.F4.predicate':
    'Queue giao ít nhất {minDeliverRate} message mỗi giây và hơn {ratio} số lần giao là giao lại.',
  'rule.F4.action': 'Ngừng requeue message lỗi cho {objects}',
  'rule.L3.title': 'Nhiều policy cùng khớp, chỉ một policy có hiệu lực',
  'rule.L3.what':
    'Policy {winner} có hiệu lực; {losers} cũng khớp nhưng bị bỏ qua.',
  'rule.L3.what.tie':
    'Policy {winner} và {losers} cùng khớp với cùng priority, nên không xác định được policy nào có hiệu lực.',
  'rule.L3.dataSafety':
    'Chưa biết. Khoá chỉ đặt ở các policy bị bỏ qua không có tác dụng trên đối tượng này.',
  'rule.L3.dataSafety.keys':
    'Không. Khoá {keys} đặt ở policy bị bỏ qua không có tác dụng, nên đối tượng này chạy mà không có chúng.',
  'rule.L3.next':
    'Gộp các khoá vào một policy, hoặc đổi pattern để các policy không chồng nhau.',
  'rule.L3.mechanism':
    'RabbitMQ chỉ áp một policy, policy có priority cao nhất, và không bao giờ gộp khoá từ các policy khác cùng khớp.',
  'rule.L3.predicate':
    'Hai policy người dùng trở lên cùng khớp một exchange hoặc queue; chỉ policy có priority cao nhất được áp.',
  'rule.L3.action': 'Gộp các policy chồng nhau cho {objects}',
  'rule.N1.title': 'Một connection vừa publish vừa consume',
  'rule.N1.what':
    'Connection có {publishChannels, plural, other {# channel đang publish}} và {consumeChannels, plural, other {# channel đang consume}}.',
  'rule.N1.dataSafety':
    'Có. Không mất gì, nhưng memory alarm làm consumer đứng cùng publisher.',
  'rule.N1.next': 'Mở connection riêng cho publish và cho consume.',
  'rule.N1.mechanism':
    'Khi có resource alarm, broker chặn connection đang publish; consumer trên cùng connection cũng dừng, nên tồn đọng không rút được.',
  'rule.N1.predicate':
    'Một connection AMQP vừa có channel publish vừa có channel có consumer.',
  'rule.N1.action': 'Tách publish và consume cho {objects}',
  'rule.N2.title': 'Connection không có tên',
  'rule.N2.what': 'Một connection của user {user} không đặt connection_name.',
  'rule.N2.what.product':
    'Một connection của user {user}, client {clientProduct}, không đặt connection_name.',
  'rule.N2.dataSafety':
    'Có. Message không bị ảnh hưởng; chỉ là khó xác định client hơn.',
  'rule.N2.next':
    'Đặt connection_name trong client properties khi mở connection.',
  'rule.N2.mechanism':
    'Broker chỉ hiện địa chỉ cho connection không tên, nên lần ngược một phát hiện về service phải đoán.',
  'rule.N2.predicate':
    'Connection AMQP không gửi connection_name trong client properties.',
  'rule.N2.action': 'Đặt tên cho {objects}',
  'rule.N3.title': 'Heartbeat bị tắt',
  'rule.N3.what': 'Một connection của user {user} có heartbeat timeout 0.',
  'rule.N3.dataSafety':
    'Chưa biết. Peer đã chết không bị phát hiện, và message chưa ack của nó bị giữ tới khi TCP bỏ cuộc.',
  'rule.N3.next': 'Đặt heartbeat timeout ở client, ví dụ 60 giây.',
  'rule.N3.mechanism':
    'Không có heartbeat, cả hai bên không thấy connection TCP nửa mở; channel của nó giữ message chưa ack tới khi hệ điều hành đóng lại.',
  'rule.N3.predicate':
    'Connection AMQP thoả thuận heartbeat 0, tức tắt heartbeat.',
  'rule.N3.action': 'Bật heartbeat cho {objects}',
  'rule.Q3.title': 'Ứng dụng kết nối bằng user quản trị',
  'rule.Q3.what':
    'Một connection dùng user {user}, là tài khoản quản trị ({reason}).',
  'rule.Q3.what.administrator':
    'Một connection dùng user {user}, có tag administrator.',
  'rule.Q3.what.guest': 'Một connection dùng user mặc định guest.',
  'rule.Q3.dataSafety':
    'Có. Message không bị ảnh hưởng, nhưng ứng dụng này sửa hoặc xoá được mọi đối tượng.',
  'rule.Q3.next': 'Tạo user riêng cho service này, chỉ với quyền nó cần.',
  'rule.Q3.mechanism':
    'Một tài khoản quản trị dùng chung cho phép mọi lỗi hay credential bị lộ xoá queue và policy trên cả broker.',
  'rule.Q3.predicate':
    'Connection dùng user guest, hoặc user có tag administrator.',
  'rule.Q3.action': 'Cấp cho {objects} user riêng không có tag administrator',
  'rule.R1.title': 'Message được publish mà không có confirm',
  'rule.R1.what':
    'Một channel trên connection {connection}, user {user}, đã publish {publishCount, plural, other {# message}} mà không bật publisher confirm.',
  'rule.R1.dataSafety':
    'Chưa biết. Publisher không biết broker đã nhận từng message hay chưa.',
  'rule.R1.next':
    'Bật publisher confirm trên channel này và chờ confirm trước khi coi một lần publish là xong.',
  'rule.R1.mechanism':
    'Không có confirm, lệnh publish trả về khi byte rời client; message mất trên đường hoặc trên node đang hỏng không gây lỗi nào.',
  'rule.R1.predicate': 'Channel đã publish message mà không bật confirm.',
  'rule.R1.action': 'Bật publisher confirm cho {objects}',
  'rule.T1.title': 'Dữ liệu bền nằm trong classic queue',
  'rule.T1.what':
    'Classic queue này đang giữ {messages, plural, other {# message}} và có {consumers, plural, other {# consumer}}.',
  'rule.T1.what.bare':
    'Classic queue bền này giữ message trên một node duy nhất.',
  'rule.T1.dataSafety':
    'Chưa biết. Classic queue nằm trên một node; node đó mất đĩa là mất message.',
  'rule.T1.next': 'Chuyển queue này sang quorum queue bằng một lần migration.',
  'rule.T1.mechanism':
    'Classic queue giữ dữ liệu trên một node, không có bản sao; quorum queue chép mọi message sang đa số node rồi mới confirm.',
  'rule.T1.predicate':
    'Classic queue durable, không auto-delete, thuộc luồng strict; hoặc chưa khai báo mà có consumer và có message đang chờ.',
  'rule.T1.action': 'Chuyển {objects} sang quorum queue',
  'rule.T2.title': 'Message không định tuyến được có thể bị bỏ',
  'rule.T2.what':
    '{count, plural, other {# message không định tuyến được đã bị bỏ}} kể từ {since}.',
  'rule.T2.what.at_risk':
    'Exchange này không có alternate exchange dùng được ({reason}); message không khớp binding nào sẽ bị bỏ.',
  'rule.T2.what.dropped_node':
    'Riêng node {node} đã bỏ {count, plural, other {ít nhất # message không định tuyến được}} kể từ {since}.',
  'rule.T2.dataSafety':
    'Không. Các message đó đã mất, và exchange này còn có thể làm mất thêm.',
  'rule.T2.dataSafety.at_risk':
    'Chưa biết. Chưa đếm được lần bỏ nào, nhưng message kế tiếp không khớp binding nào sẽ mất.',
  'rule.T2.next':
    'Đặt alternate exchange cho exchange này qua policy; exchange fanout ocho.unroutable và queue của nó phải có trước.',
  'rule.T2.mechanism':
    'Exchange không lưu gì: không có binding khớp và không có alternate exchange thì broker bỏ message mà vẫn gửi confirm.',
  'rule.T2.predicate':
    'Exchange có binding đi ra mà không có alternate exchange dùng được: không đặt, trỏ tới exchange không tồn tại, hoặc tới exchange không có binding.',
  'rule.T2.action': 'Thêm alternate exchange cho {objects}',
  'rule.T3.title': 'Queue đầy sẽ bỏ message cũ nhất',
  'rule.T3.what':
    'Queue có giới hạn chiều dài {limit} {limitKind}, với overflow drop-head từ {overflowLayer}.',
  'rule.T3.dataSafety':
    'Không. Khi queue đầy, broker xoá message ở đầu queue để lấy chỗ.',
  'rule.T3.next':
    'Đặt overflow là reject-publish hoặc reject-publish-dlx qua policy.',
  'rule.T3.mechanism':
    'drop-head là overflow mặc định: chạm giới hạn, broker bỏ message cũ nhất và publisher vẫn nhận confirm.',
  'rule.T3.predicate':
    'Queue có max-length hoặc max-length-bytes, và overflow là drop-head, kể cả do mặc định.',
  'rule.T3.action': 'Đặt overflow reject-publish cho {objects}',
  'rule.T4.title': 'Message độc có thể bị bỏ im lặng',
  'rule.T4.what':
    'Quorum queue không có dead-letter exchange; delivery limit là {limit}, từ {limitLayer}.',
  'rule.T4.what.loop':
    'Quorum queue không có dead-letter exchange và không có delivery limit.',
  'rule.T4.dataSafety':
    'Không. Message chạm delivery limit bị bỏ vì không có chỗ đi.',
  'rule.T4.dataSafety.loop':
    'Có. Không mất gì, nhưng message độc được giao lại mãi và chặn queue.',
  'rule.T4.next':
    'Đặt cùng lúc delivery limit, dead-letter exchange, dead-letter at-least-once và overflow reject-publish qua policy.',
  'rule.T4.mechanism':
    'Từ 4.0 quorum queue mặc định delivery limit 20; quá giới hạn, message không có đích dead-letter bị bỏ.',
  'rule.T4.predicate':
    'Quorum queue không có dead-letter-exchange mà có delivery-limit (đặt rõ, hoặc mặc định 20 từ 4.0); hoặc trên 3.13 không có delivery-limit.',
  'rule.T4.mechanism.loop':
    'Trên 3.13 quorum queue mặc định không có delivery limit, nên message luôn lỗi quay lại queue không bao giờ dừng.',
  'rule.T4.action': 'Thêm dead-letter exchange cho {objects}',
  'rule.T5.title': 'Dead-letter có thể làm mất message',
  'rule.T5.what':
    'Dead-letter strategy là {strategy} từ {strategyLayer}, overflow là {overflow} từ {overflowLayer}.',
  'rule.T5.dataSafety':
    'Không. Message bị dead-letter có thể mất trước khi tới parking-lot.',
  'rule.T5.next':
    'Đặt cùng lúc dead-letter-strategy at-least-once và overflow reject-publish.',
  'rule.T5.mechanism':
    'Dead-letter at-least-once cần overflow reject-publish; thiếu nó, broker lặng lẽ quay về at-most-once.',
  'rule.T5.predicate':
    'Quorum queue có dead-letter-exchange mà không đồng thời có dead-letter-strategy at-least-once và overflow reject-publish.',
  'rule.T5.action': 'Chuyển dead-letter sang at-least-once cho {objects}',
  'rule.T9.title': 'Message hết hạn bị xoá, không qua dead-letter',
  'rule.T9.what':
    'Queue có message-ttl {ttlMs} ms từ {layer} và không có dead-letter exchange.',
  'rule.T9.what.expires':
    'Queue có expires {expiresMs} ms từ {layer}; khi hết hạn, queue bị xoá cùng message trong đó.',
  'rule.T9.dataSafety': 'Không. Message hết hạn bị xoá.',
  'rule.T9.dataSafety.expires':
    'Không. Queue hết hạn bị xoá cùng mọi message trong đó, và không message nào qua dead-letter.',
  'rule.T9.next': 'Thêm dead-letter exchange qua policy, hoặc bỏ TTL.',
  'rule.T9.next.expires':
    'Bỏ expires khỏi policy hoặc argument của queue; dead-letter exchange không cứu được queue hết hạn.',
  'rule.T9.mechanism':
    'Message hết hạn mà không có dead-letter exchange thì bị bỏ.',
  'rule.T9.predicate':
    'Queue có message-ttl mà không có dead-letter-exchange, hoặc có expires, dù có dead-letter hay không.',
  'rule.T9.mechanism.expires':
    'expires xoá queue không dùng cùng mọi thứ bên trong, không qua dead-letter.',
  'rule.T9.action': 'Thêm dead-letter exchange hoặc bỏ TTL cho {objects}',
  'rule.VT1.title': 'Classic queue mirrored sẽ hết được nhân bản',
  'rule.VT1.what':
    'Queue đang được nhân bản qua policy {policy}; tính năng nhân bản bị gỡ ở {targetVersion}.',
  'rule.VT1.dataSafety':
    'Không. Sau khi nâng cấp, queue này chỉ còn một bản, mất node đó là mất message.',
  'rule.VT1.next': 'Chuyển queue này sang quorum queue trước khi nâng cấp.',
  'rule.VT1.mechanism':
    'RabbitMQ 4.0 đã gỡ mirroring của classic queue; khoá ha-mode bị bỏ qua và queue lặng lẽ thành classic queue một node.',
  'rule.VT1.predicate':
    'Với --target-version từ 4.0 trên broker cũ hơn 4.0: classic queue có policy mang ha-mode.',
  'rule.VT1.action': 'Chuyển {objects} sang quorum queue trước khi nâng cấp',
  'rule.VT2.title': 'Nâng cấp sẽ bắt đầu bỏ message độc',
  'rule.VT2.what':
    'Quorum queue không có dead-letter exchange; trên {targetVersion} nó nhận delivery limit mặc định {defaultLimit}.',
  'rule.VT2.dataSafety':
    'Không. Sau khi nâng cấp, message được giao lại {defaultLimit} lần sẽ bị bỏ.',
  'rule.VT2.next':
    'Đặt dead-letter exchange với dead-letter at-least-once trước khi nâng cấp.',
  'rule.VT2.mechanism':
    'Từ 4.0 quorum queue có delivery limit mặc định; queue trên 3.13 vốn giao lại không dừng sẽ chuyển sang bỏ message.',
  'rule.VT2.predicate':
    'Với --target-version từ 4.0 trên broker cũ hơn 4.0: quorum queue không có dead-letter và không có delivery-limit.',
  'rule.VT2.action':
    'Thêm dead-letter exchange cho {objects} trước khi nâng cấp',
  'rule.VT3.title': 'Đang dùng tính năng đã deprecate',
  'rule.VT3.what': 'Broker báo đang dùng tính năng đã deprecate {feature}.',
  'rule.VT3.dataSafety':
    'Có. Hiện chưa mất gì, nhưng bản sau có thể từ chối hoặc gỡ các tính năng này.',
  'rule.VT3.next':
    'Lên kế hoạch bỏ từng tính năng trong danh sách trước lần nâng cấp tới.',
  'rule.VT3.mechanism':
    'RabbitMQ đánh dấu deprecate trước khi gỡ, và broker có thể được cấu hình để từ chối tính năng đó, làm hỏng client còn dùng.',
  'rule.VT3.predicate': 'Broker báo một tính năng deprecated đang được dùng.',
  'rule.VT3.action': 'Bỏ tính năng đã deprecate trên {objects}',
  'rule.VT4.title': 'Các node chạy phiên bản RabbitMQ khác nhau',
  'rule.VT4.what': 'Các node trong cluster báo phiên bản {versions}.',
  'rule.VT4.dataSafety':
    'Có. Lệch phiên bản tự nó không làm mất message, nhưng hành vi có thể khác nhau giữa các node.',
  'rule.VT4.next':
    'Hoàn tất nâng cấp cuốn chiếu để mọi node chạy cùng phiên bản.',
  'rule.VT4.mechanism':
    'Cluster lệch phiên bản chỉ chạy những tính năng mọi node cùng có, và mặc định theo phiên bản có thể khác nhau giữa các node.',
  'rule.VT4.predicate': 'Các node đang chạy báo phiên bản RabbitMQ khác nhau.',
  'rule.VT4.action': 'Đưa {objects} về cùng một phiên bản',
  'diag.Y1.message': 'Khoá {key} không có trong schema.',
  'diag.Y1.next': 'Xoá khoá này hoặc sửa chính tả.',
  'diag.Y2.message': 'Sai kiểu: cần {expected}.',
  'diag.Y2.next': 'Đổi giá trị thành {expected}.',
  'diag.Y3.message': 'Thiếu khoá bắt buộc {key}.',
  'diag.Y3.next': 'Thêm {key}.',
  'diag.Y4.message':
    'Luồng {flow} không có đúng một dạng đích: family, queue hoặc exchange.',
  'diag.Y4.next': 'Giữ đúng một dạng đích trong luồng này.',
  'diag.Y5.message':
    'Luồng tham chiếu family {family}, family này không tồn tại.',
  'diag.Y5.next': 'Khai báo family {family} hoặc sửa tên.',
  'diag.Y6.message': 'Mẫu tên sai: {reason}.',
  'diag.Y6.next': 'Sửa mẫu để queue và routing_key dùng cùng tập tham số.',
  'diag.Y7.message':
    'Thành viên family {member} chứa ký tự dành riêng: . * # / +',
  'diag.Y7.next': 'Đổi tên thành viên, bỏ ký tự dành riêng.',
  'diag.Y8.message':
    'Service tham chiếu luồng {flow}, luồng này không tồn tại.',
  'diag.Y8.next': 'Khai báo luồng {flow} hoặc sửa tên.',
  'diag.Y9.message':
    'Trường {key} của waiver bị thiếu, rỗng, hoặc không phải ngày YYYY-MM-DD.',
  'diag.Y9.next': 'Điền {key} cho waiver này.',
  'diag.Y10.message':
    'Waiver cho {rule} đã hết hạn ngày {until} và không còn hiệu lực.',
  'diag.Y10.next':
    'Gia hạn waiver với ngày until muộn hơn, hoặc sửa phát hiện.',
  'diag.Y11.message': 'Đối tượng của waiver sai định dạng: {reason}.',
  'diag.Y11.next': 'Viết đối tượng dạng loại và tên, ví dụ queue orders.',
  'diag.Y12.message':
    'ocho.yaml khai spec {spec}; bản Ocho này hỗ trợ major {supported}.',
  'diag.Y12.next': 'Dùng bản Ocho hỗ trợ spec {spec}.',
  'diag.Y13.message':
    'Luồng {other} đã nhận vhost {vhost}, exchange {exchange}, routing key {routingKey}, queue {queue}.',
  'diag.Y13.next': 'Bỏ phần chồng nhau để mỗi binding chỉ thuộc một luồng.',
  'diag.Y14.message': 'broker.min_version {value} không phải phiên bản.',
  'diag.Y14.next': 'Viết broker.min_version dạng major.minor, ví dụ 3.13.',
  'diag.YP1.message': 'Lỗi cú pháp YAML: {reason}.',
  'diag.YP1.next': 'Sửa cú pháp YAML ở vị trí này.',
  'diag.YP2.message': 'Khoá {key} xuất hiện hai lần trong cùng một map.',
  'diag.YP2.next': 'Giữ một trong hai khoá.',
  'diag.YP3.message': 'File có nhiều hơn một document YAML.',
  'diag.YP3.next': 'Giữ một document và bỏ các dấu phân cách --- thừa.',
  'diag.YP4.message': 'File dùng {feature}, ocho.yaml không cho phép.',
  'diag.YP4.next':
    'Viết đầy đủ giá trị: anchor, alias, tag và merge key được các thư viện YAML hiểu khác nhau.',
  'diag.YP5.message':
    'Số nguyên {value} nằm ngoài khoảng đọc lại được chính xác.',
  'diag.YP5.next': 'Nếu đây là tên, viết nó thành chuỗi trong nháy kép.',
  'diag.YP6.message': 'File có {size} byte, vượt giới hạn {limit} byte.',
  'diag.YP6.next': 'Bỏ các mục không còn dùng.',
  'diag.YW1.message':
    '{value} có số 0 ở đầu: YAML 1.2 đọc là {decimal}, YAML 1.1 đọc là số bát phân.',
  'diag.YW1.next':
    'Bỏ số 0 ở đầu, hoặc đặt giá trị trong nháy kép nếu đó là tên.',
  'diag.YW2.message': 'YAML 1.2 đọc {value} là chuỗi, không phải boolean.',
  'diag.YW2.next': 'Viết true hoặc false.',
  'diag.IM1.message':
    'Tự kiểm của import hỏng ở bước {step} với {count, plural, other {# khác biệt}}.',
  'diag.IM1.next':
    'Chưa ghi gì. Đính kèm kết quả vào một issue gửi người duy trì Ocho.',
  'diag.IM2.message': 'Không hợp nhất được ocho.yaml đang có: {reason}.',
  'diag.IM2.next':
    'Sửa các lỗi được liệt kê trong ocho.yaml rồi chạy lại ocho import.',
  'diag.SNAP1.message': 'Không hỗ trợ schema ảnh chụp {schema}.',
  'diag.SNAP1.next': 'Chụp lại bằng bản Ocho này.',
  'diag.SNAP2.message': 'Ảnh chụp sai hình dạng tại {path}.',
  'diag.SNAP2.next': 'Chụp lại thay vì sửa file bằng tay.',
  'diag.SNAP3.message':
    'Ảnh chụp vi phạm {count, plural, other {# bất biến của model}}.',
  'diag.SNAP3.next': 'Đính kèm ảnh chụp vào một issue gửi người duy trì Ocho.',
  'diag.CX1.message': 'Không nối được tới {host}.',
  'diag.CX1.next': 'Kiểm tra URL, DNS, và cổng management có mở không.',
  'diag.CX2.message':
    'Chứng chỉ TLS của {host} không hợp lệ hoặc không do CA tin cậy ký.',
  'diag.CX2.next': 'Truyền CA của broker bằng --ca.',
  'diag.CX3.message': 'Broker từ chối user {user} ở /api/overview với mã 401.',
  'diag.CX3.next':
    'Tạo user monitoring: rabbitmqadmin users declare --name ocho-doctor --password-stdin --tags monitoring',
  'diag.CX4.message':
    'URL chứa mật khẩu, mật khẩu sẽ nằm lại trong lịch sử shell.',
  'diag.CX4.next':
    'Bỏ mật khẩu khỏi URL và dùng password_command hoặc --password-stdin.',
  'diag.CX5.message': 'Kiểm chứng chỉ TLS đang tắt vì có --insecure.',
  'diag.CX5.next': 'Truyền CA của broker bằng --ca và bỏ --insecure.',
  'diag.CX6.message': 'File context {file} có quyền {mode}, rộng hơn 0600.',
  'diag.CX6.next': 'Chạy chmod 600 cho file context.',
  'diag.CX7.message': 'password_command lỗi hoặc chạy quá {seconds} giây.',
  'diag.CX7.next': 'Chạy tay password_command và sửa đầu ra của nó.',
  'diag.CX8.message':
    'RabbitMQ {version} cũ hơn {min}, phiên bản thấp nhất Ocho hỗ trợ.',
  'diag.CX8.next': 'Nâng broker lên {min} trở lên.',
  'diag.CX9.message':
    'Broker từ chối user {user} ở /api/overview với mã 403: user không có tag management nào.',
  'diag.CX9.next':
    'Thêm tag monitoring cho user: rabbitmqctl set_user_tags {user} monitoring',
  'diag.CX10.message': 'URL {url} không phải URL management hợp lệ.',
  'diag.CX10.next':
    'Dùng dạng https://host:15671, không có query hay fragment.',
  'diag.CX11.message':
    'Không có mật khẩu cho user {user}: không có --password-stdin, OCHO_PASSWORD, password_command, hay terminal để hỏi.',
  'diag.CX11.next':
    'Dùng --password-stdin, đặt OCHO_PASSWORD, hoặc thêm password_command vào context.',
  'diag.OC1.message':
    'Lệnh chỉ đọc đang chạy bằng {user}, user có tag administrator.',
  'diag.OC1.next': 'Tạo cho Ocho một user chỉ có tag monitoring.',
  'reason.source_unavailable': '{source} không có',
  'reason.source_unavailable.unlock': 'Bật {source} trên broker',
  'reason.forbidden': 'user không đọc được {path} (HTTP {status})',
  'reason.forbidden.unlock':
    'Cấp tag monitoring cho user mà Ocho dùng để kết nối',
  'reason.endpoint_missing': 'phiên bản broker này không có endpoint {path}',
  'reason.endpoint_missing.unlock': '',
  'reason.field_absent': 'broker không báo {path}',
  'reason.field_absent.unlock': '',
  'reason.model_mismatch': 'Ocho tính ra policy hiệu lực khác với broker',
  'reason.model_mismatch.unlock':
    'Gửi ảnh chụp lấy bằng --save --redact-hosts vào một issue',
  'reason.tie': 'các policy {policies} cùng khớp với cùng priority',
  'reason.tie.unlock': 'Đặt priority cao hơn cho một trong các policy này',
  'reason.regex_unsupported':
    'policy {policy} dùng pattern mà Ocho không khớp chính xác được',
  'reason.regex_unsupported.unlock':
    'Viết lại pattern, bỏ nhóm nguyên tử, lượng từ chiếm hữu, \\Z và cờ nội tuyến',
  'reason.inconsistent_read': 'đối tượng thay đổi trong lúc Ocho đang đọc',
  'reason.inconsistent_read.unlock': 'Chạy lại lệnh',
  'reason.depends_on': 'phụ thuộc vào {path}, giá trị này chưa biết',
  'reason.depends_on.unlock': '',
  'reason.error': 'đọc thất bại: {message}',
  'reason.error.unlock': 'Chạy lại lệnh',
  'exclusion.EX1': 'Exchange mặc định không cấu hình được.',
  'exclusion.EX2':
    'Tiền tố amq. là dành riêng; broker tự tạo các exchange này.',
  'exclusion.EX3':
    'Exchange amq. này không có binding đi ra, nên không mang luồng nào.',
  'exclusion.EX4': 'Queue exclusive thuộc về một connection và là queue tạm.',
  'exclusion.EX5': 'Tên queue này do broker sinh.',
  'exclusion.EX6':
    'Queue MQTT subscription thuộc luật T11 và T12, ngoài phạm vi Ocho v0.1.',
  'exclusion.EX7':
    'Ocho tự quản lý đối tượng hệ thống của mình; chúng sẽ có luật riêng về sau.',
  'exclusion.EX8': 'Đây là binding ngầm của exchange mặc định.',
  'exclusion.EX9':
    'Direct reply-to bắt buộc ack tự động, nên đây không phải phát hiện C1.',
  'import.consequence.binding':
    'strict nghĩa là classic queue hoặc exchange thiếu alternate exchange trong luồng này là phát hiện S1.',
  'import.consequence.fanout':
    'strict nghĩa là classic queue hoặc exchange thiếu alternate exchange trong luồng này là phát hiện S1.',
  'import.consequence.family':
    'strict nghĩa là classic queue ở bất kỳ thành viên nào của family này, hoặc exchange thiếu alternate exchange, là phát hiện S1.',
  'import.consequence.direct':
    'strict nghĩa là classic queue trong luồng này là phát hiện S1; T2 không áp dụng vì publisher gửi qua exchange mặc định.',
};
