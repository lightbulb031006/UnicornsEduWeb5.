# Auth Forgot Password Page (`/auth/forgot-password`)

## Mục tiêu

Cho phép user yêu cầu link reset password qua email, phản hồi bằng Sonner toast.

## Hành vi chính

- Form nhập email.
- Submit gọi `authApi.forgotPassword({ email })`.
- Thành công hiển thị thông báo generic (tránh lộ email tồn tại/không tồn tại).
- Card hiển thị đầy đủ logo mark + tên **Unicorns Edu** trước tiêu đề.
- Backend gửi email đổi mật khẩu bằng React Email, dùng cùng baseline nhận diện với email xác thực và có CTA + fallback link.

## Feedback UI

- Success: `toast.success(...)`.
- Error: `toast.error(...)` với fallback message.
- Nếu backend trả `429 Too Many Requests` do vượt rate limit (`5` lần / giờ / IP), frontend vẫn hiển thị lỗi qua toast hiện có.
- Không render alert inline cho error/success.

## Ghi chú

- Không redirect sau submit thành công.
- Giữ nguyên nội dung message hiện có.
- Link reset gắn với trạng thái mật khẩu hiện tại; sau khi mật khẩu đổi thành công, link cũ tự vô hiệu dù JWT chưa hết hạn.
