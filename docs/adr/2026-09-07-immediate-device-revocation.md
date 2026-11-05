# ADR: Thu hồi phiên đăng nhập tức thời qua `UserDevice`

- **Status:** Accepted
- **Date:** 2026-09-07

## Context

Access JWT sống ~15 phút. `StudentDeviceGuard` chỉ gắn `/auth/refresh`, còn `jwt-refresh.strategy` chỉ verify chữ ký. `users.refresh_token` bị set `null` lúc logout/đổi mật khẩu nhưng không ai đọc lại, nên cookie refresh cũ vẫn đổi được access token. Ticket #101 yêu cầu request kế tiếp sau logout / force-logout / đổi mật khẩu phải 401, không chờ access hết hạn.

`Session` trong hệ thống là **Buổi học**. Phiên đăng nhập đã có bảng `user_devices` (ADR 2026-09-05). Không thêm bảng hay Redis.

## Decision

1. Access và refresh JWT mang `deviceId` = `UserDevice.id` (không đặt tên `sessionId`).
2. `JwtStrategy` (đã là `APP_GUARD`) đối chiếu `UserDevice` còn sống và chưa idle (60 ngày). `last_active_at` chỉ ghi lại khi cách lần trước ≥ 1 phút.
3. `JwtRefreshStrategy` so khớp SHA-256 của refresh cookie với `user_devices.token_hash` **và** `deviceId`. Token đã rotate / thiết bị đã xóa → 401.
4. Staff/admin cũng có `UserDevice` để thu hồi theo thiết bị, nhưng **không** áp luật một máy hay magic link (vẫn ADR 2026-09-05).
5. `POST /auth/logout` xóa đúng thiết bị của cookie hiện tại. `changePassword` / `resetPassword` / force-logout xóa mọi thiết bị của user đó.

## Consequences

- Deploy: refresh cookie cũ (chưa có `deviceId` / `token_hash` là hash JWT) bị 401 trừ học sinh còn đúng một device live (một lần rebind). Staff/admin cần đăng nhập lại.
- Không cache tình trạng thiết bị theo `deviceId`; identity cache 5s vẫn invalidate khi xóa device.

## Amendment 2026-10-10

- Bỏ nhánh fallback "thiết bị sống mới nhất" cho học sinh trong `assertLiveRefreshDevice`. Nhánh này bắt cả token **có** `deviceId` nhưng lệch hash / thiết bị đã xoá, nên cookie refresh của máy đã bị force-logout (hoặc token đã rotate) chiếm phiên của máy đang đăng nhập — luật một thiết bị vô hiệu. Refresh token không `deviceId` (≤ 30 ngày) đã hết hạn nên không còn cần rebind.
- `POST /auth/login` từ chối học sinh (`STUDENT_LOGIN_REQUIRED`); Google OAuth cho học sinh áp luật một thiết bị (`device_blocked`).

## Amendment 2026-10-26

- Thiết bị "sống" phải còn refresh token hợp lệ: thêm `user_devices.refresh_expires_at`, ghi ở mỗi lần cấp/rotate. Trước đó chỉ xét idle 60 ngày trong khi refresh chỉ sống 1 ngày (30 ngày khi «Ghi nhớ»), nên học sinh đóng trình duyệt/hết hạn cookie mà không bấm Đăng xuất bị `DEVICE_ACTIVE` chặn bởi chính phiên đã chết, dù không ai đang đăng nhập.
- Backfill row cũ: học sinh `last_active_at + 1 ngày` (không biết rememberMe; lấy 30 ngày thì học sinh đang bị chặn oan vẫn bị chặn tới 30 ngày sau deploy — đổi lại học sinh «Ghi nhớ» bỏ máy > 1 ngày phải đăng nhập lại một lần), staff/admin `+ 30 ngày`.
- `POST /auth/student/logout` là `@Public()` + idempotent: access token hết hạn không còn làm logout 401 rồi bỏ lại device sống. Chỉ xóa thiết bị khi cookie khớp device còn tồn tại (hash refresh hoặc `deviceId` của access), nên token của máy đã bị force-logout không đăng xuất được máy đang đăng nhập.
- Luật một thiết bị nguyên tử: check-then-act cũ (`hasActiveDevice` rồi `deleteMany` + `create`) để hai lần đăng nhập đồng thời cùng lọt qua bước kiểm tra, sinh hai row; row thừa chặn `DEVICE_ACTIVE` tới khi refresh hết hạn. Giờ `UserDeviceService.replaceDevicesForUser` khoá `pg_advisory_xact_lock(hashtext('user_device:<userId>'))` rồi mới kiểm tra + thay thiết bị trong một transaction (cùng pattern `one-time-charge.util.ts`). Chọn advisory lock thay vì unique `user_id` vì staff/admin vẫn được nhiều thiết bị; không cần migration. Áp cho `student/login`, Google học sinh, `student/activate` (legacy, bỏ qua kiểm tra nhưng vẫn khoá khi thay).
