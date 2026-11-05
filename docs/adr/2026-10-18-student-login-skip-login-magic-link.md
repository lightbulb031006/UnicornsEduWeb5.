# ADR: Học sinh đã xác minh email đăng nhập thẳng, bỏ magic link mỗi lần đăng nhập

- **Status:** Accepted
- **Date:** 2026-10-18
- **Thay mục 3 của:** `2026-09-05-student-single-device-login.md`

## Context

Từ ADR 2026-09-05, mỗi lần học sinh đăng nhập đều phải bấm magic link trong email (`login_requests` + poll + activate). Admin đã tick «Email đã xác thực» cho học sinh nhưng học sinh vẫn gặp màn «Kiểm tra email của bạn», vì đó là bước xác minh thiết bị, tách khỏi xác minh email. Vận hành muốn cờ `emailVerified` là đủ để học sinh vào thẳng.

## Decision

`POST /auth/student/login`: đúng mật khẩu + `emailVerified = true` + không có thiết bị đang hoạt động → xoá device cũ, tạo `UserDevice`, cấp JWT và set cookie ngay trong response. Không tạo `login_requests`, không gửi mail.

Giữ nguyên:
- Email chưa xác minh → `EMAIL_NOT_VERIFIED` + gửi mail xác minh email.
- Luật một thiết bị: còn thiết bị sống → `409 DEVICE_ACTIVE`.

## Consequences

- Ai biết mật khẩu cũng đăng nhập được khi học sinh không đang online ở máy khác. Chống chia sẻ tài khoản giờ chỉ dựa vào luật một thiết bị.
- Endpoint `student/login/poll`, `verify-login`, `student/activate`, mail `login-verification` và bảng `login_requests` thành legacy, chờ dọn.
