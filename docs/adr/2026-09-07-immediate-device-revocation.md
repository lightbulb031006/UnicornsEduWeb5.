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
