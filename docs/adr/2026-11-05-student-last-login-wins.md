# ADR: Học sinh tự đăng xuất mọi thiết bị khi bị chặn — máy đăng nhập sau cùng thắng

- **Status:** Accepted
- **Date:** 2026-11-05
- **Cập nhật:** `2026-09-05-student-single-device-login.md` (luật một thiết bị), `2026-10-18-student-login-skip-login-magic-link.md` (`409 DEVICE_ACTIVE` không còn là ngõ cụt)

## Context

Luật một thiết bị chặn cứng: còn thiết bị sống thì `POST /auth/student/login` trả `409 DEVICE_ACTIVE` và Google redirect `error=device_blocked`. Lối thoát duy nhất là tự đăng xuất trên máy cũ hoặc nhờ admin/CSKH/trợ lí **buộc đăng xuất**. Thực tế học sinh hay mất máy cũ (đổi trình duyệt, xoá cookie, mượn máy trường, quên đăng xuất), nên CSKH nhận ticket «không đăng nhập được» liên tục dù đã sửa nhiều lỗi thiết bị mồ côi.

## Decision

1. Màn bị chặn có nút **«Đăng xuất tất cả thiết bị và đăng nhập»** (có hộp xác nhận). Danh tính chỉ cần chứng minh như lần đăng nhập vừa rồi: đúng mật khẩu (`POST /auth/student/login` kèm `forceLogoutOthers: true`) hoặc xác thực lại Google (`GET /auth/google?force_device=1`, cờ đi qua OAuth `state`). Không xác nhận email, không giới hạn số lần.
2. Luật thành **máy đăng nhập sau cùng thắng**: vẫn không ai dùng chung đồng thời được, nhưng không còn chặn cứng.
3. Máy bị đá nhận `401 DEVICE_SUPERSEDED` (không phải `NO_ACTIVE_DEVICE`) và thấy «Tài khoản vừa được đăng nhập ở thiết bị khác… Nếu không phải bạn, hãy đổi mật khẩu.». Nhận diện bằng cột `users.devices_superseded_at`: token có `iat` cũ hơn mốc này và không còn thiết bị sống thì là máy bị đá. `/auth/session` trả guest kèm `signedOutReason: "device_superseded"` để proxy FE chuyển về `/auth/login?error=device_superseded`.
4. Ghi `action_history` (`entity_type = user_device`, actor là chính học sinh, `before_value` = danh sách thiết bị bị đăng xuất). Không cảnh báo CSKH, không thêm UI lịch sử vào popup thiết bị.

## Considered options

- **Giữ chặn cứng, chỉ sửa lỗi thiết bị mồ côi** — đã làm nhiều đợt (refresh_expires_at, logout idempotent, advisory lock) nhưng không xử lý được ca mất máy thật; ticket vẫn về CSKH.
- **Bắt xác nhận qua email trước khi đá** — chống chia sẻ tốt hơn, nhưng quay lại đúng ma sát mà ADR 2026-10-18 vừa bỏ.
- **Giới hạn số lần / cooldown** — làm phức tạp mà người chia sẻ tài khoản vẫn đá nhau được trong giới hạn; bỏ.
- **Lưu danh sách token bị đá thay vì một mốc thời gian** — chính xác hơn nhưng phải giữ thêm bảng; một cột timestamp là đủ vì máy bị đá luôn có token cấp trước mốc.

## Consequences

- Chia sẻ tài khoản chỉ còn bị cản bởi việc hai người đá nhau liên tục và thông báo «đăng nhập ở thiết bị khác» trên máy bị đá. Ai biết mật khẩu là chiếm được phiên — đổi mật khẩu là cách thu hồi.
- `iat` tính bằng giây; so với đầu giây kế tiếp (`supersededAt >= (iat + 1) * 1000`) để token của chính máy mới, cấp cùng giây với mốc, không bị báo nhầm. Máy cũ có token cấp trong đúng giây đó sẽ nhận `NO_ACTIVE_DEVICE` thay vì `DEVICE_SUPERSEDED` — chấp nhận.
- Buộc đăng xuất bởi admin/CSKH không ghi mốc → máy đó vẫn nhận «phiên hết hạn».
