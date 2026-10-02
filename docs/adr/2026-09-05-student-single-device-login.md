# ADR: Học sinh chỉ giữ một thiết bị đăng nhập, xác minh bằng magic link gắn với thiết bị khởi tạo

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

Tài khoản học sinh đang bị chia sẻ giữa nhiều người. Cơ chế hiện tại là JWT access + refresh token lưu ở `users.refresh_token` (một cột đơn), không thu hồi được một thiết bị cụ thể giữa chừng và không biết có bao nhiêu thiết bị đang dùng.

Ràng buộc "mỗi lần đăng nhập đều xác minh qua email" cộng với "chỉ một phiên hoạt động" tạo ra một cái bẫy quen thuộc: học sinh bấm Đăng nhập trên laptop, mở email trên điện thoại, bấm magic link ở đó — phiên duy nhất được cấp cho điện thoại, và laptop bị chính hệ thống chặn với thông báo "tài khoản đang đăng nhập ở thiết bị khác".

## Decision

1. Thêm bảng `user_devices` (một dòng = một phiên đăng nhập còn hiệu lực, có token lưu dạng hash, `last_active_at`). Tên **không** dùng chữ "session": `sessions` trong hệ thống này đã là **Buổi học**.
2. Luật một thiết bị tại một thời điểm và xác minh email mỗi lần đăng nhập **chỉ áp dụng cho `UserRole.student`**. Staff/admin giữ nguyên cơ chế hiện hành vì họ làm việc trên nhiều máy hàng ngày.
3. Đăng nhập tạo một bản ghi `login_requests` gắn với đúng trình duyệt đã bấm Đăng nhập. Magic link trong email **chỉ đánh dấu yêu cầu đó là đã xác minh**; thiết bị được kích hoạt luôn là thiết bị khởi tạo yêu cầu. Trình duyệt khởi tạo ở màn "Đang chờ xác minh" và poll cho tới khi yêu cầu được xác minh, rồi mới nhận cookie. Máy bấm link hiện thông báo "Đã xác minh, quay lại thiết bị vừa đăng nhập" và không nhận phiên nào.
4. Thiết bị tự giải phóng sau 60 ngày không hoạt động. Admin, CSKH và trợ lí force-logout được, có ghi lịch sử thao tác.

## Considered options

- **Magic link kích hoạt phiên trên chính máy bấm link**: ít code hơn nhiều, nhưng với luật một phiên thì đây là cách để học sinh tự khoá mình, và sẽ đổ thẳng thành ticket CSKH.
- **OTP 6 số nhập trên trang đăng nhập**: giải quyết vấn đề thiết bị một cách tự nhiên, không cần login_request + poll. Bị loại vì lý do trải nghiệm (thêm một bước gõ tay mỗi lần đăng nhập).
- **Áp dụng cho mọi tài khoản**: đúng chữ PRD, nhưng ép gia sư/kế toán xác minh email mỗi lần đổi máy sẽ phá vận hành hàng ngày.

## Consequences

- Có một cơ chế poll ở luồng đăng nhập mà người đọc sau dễ tưởng là thừa và "dọn cho gọn". Bỏ nó đi sẽ tái tạo lại đúng cái bẫy đã mô tả ở trên.
- `login_requests` là bảng ngắn hạn, cần cron dọn bản ghi hết hạn.
- Hai luồng đăng nhập song song (student và staff) phải cùng tồn tại — mọi thay đổi auth về sau phải kiểm tra cả hai.
