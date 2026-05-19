# Auth Setup Password Page (`/auth/setup-password`)

## Mục tiêu

Buộc user vừa đăng nhập Google OAuth nhưng chưa có `passwordHash` phải tạo mật khẩu trước khi tiếp tục dùng app.

## Hành vi chính

- Route này chỉ có ý nghĩa khi user đã đăng nhập và `requiresPasswordSetup=true`.
- User vẫn được vào route này nếu `roleType` hiện tại là `guest`, miễn là đã có session hợp lệ (`id` + `accountHandle`) từ flow Google OAuth.
- Backend Google callback sẽ redirect sang `/auth/setup-password?source=google` nếu user chưa có mật khẩu.
- Root auth gate ở `apps/web/app/providers.tsx` sẽ tự redirect về route này từ mọi màn khác cho tới khi setup xong; nếu đang ở `/auth/*`, gate chỉ giữ `next` hợp lệ và fallback `/` để tránh vòng lặp quay lại login.
- Form gồm:
  - `password`
  - `confirmPassword`
- Validation client-side:
  - password và confirmPassword phải khớp
  - password tối thiểu 6 ký tự
- Submit gọi `authApi.setupPassword` (`POST /auth/setup-password`).
- Thành công:
  - backend hash mật khẩu, rotate lại cookie auth, ghi audit
  - frontend clear cờ `requiresPasswordSetup`
  - redirect về `next` hợp lệ nếu có, ngược lại fallback theo role giống login thường
- Page hiển thị đầy đủ logo mark + tên **Unicorns Edu** trước tiêu đề để đồng bộ với login/forgot/reset.

## Feedback UI

- Thành công: `toast.success("Mật khẩu đã được tạo. Đang chuyển tiếp...")`.
- Lỗi API/validation: `toast.error(...)`.
- Nếu user chưa đăng nhập hoặc đã không còn cần setup password, page sẽ redirect ra khỏi route này.

## Ghi chú

- Đây là bước bắt buộc cho tài khoản OAuth chưa có mật khẩu, không phải trang “đổi mật khẩu” chung.
- Nếu user muốn bỏ flow hiện tại và đổi tài khoản Google, CTA phù hợp là `Đăng xuất`, không phải tiếp tục đi vào app.
