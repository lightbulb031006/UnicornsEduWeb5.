# Auth Reset Password Page (`/auth/reset-password`)

## Mục tiêu

Đặt lại mật khẩu bằng token từ email, dùng Sonner toast cho feedback.

## Hành vi chính

- Đọc `token` từ query string.
- Nếu thiếu token: hiển thị state no-token hiện có (không đổi), gợi ý quay về forgot-password.
- Cả state thiếu token và form reset hiển thị đầy đủ logo mark + tên **Unicorns Edu**.
- Validation client-side:
  - Password và confirmPassword phải khớp.
  - Password tối thiểu 6 ký tự.
- Submit gọi `authApi.resetPassword({ token, password })`.
- Backend kiểm tra token còn khớp với trạng thái mật khẩu hiện tại; link cũ không dùng lại được sau khi mật khẩu đã được đổi.
- Thành công: `toast.success(...)`, delay 2s rồi redirect `/auth/login`.

## Feedback UI

- Validation fail: `toast.error(...)`.
- API fail: `toast.error(...)` với fallback message.
- Nếu backend trả `429 Too Many Requests` do vượt rate limit (`10` lần / giờ / IP), frontend vẫn hiển thị lỗi qua toast hiện có.
- Không còn alert box inline error/success trong form reset.

## Ghi chú

- Giữ nguyên behavior cho case thiếu token.
- Không đổi contract API reset-password.
