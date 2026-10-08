# Auth Register Page (`/auth/register`) — DISABLED

## Trạng thái

**Đăng ký công khai đã tắt.** Route `/auth/register` redirect về `/auth/login`. Endpoint `POST /auth/register` trả `403 Forbidden`.

Tài khoản mới chỉ được tạo qua admin (`POST /users`, `POST /users/student` trên `/admin/users`), hoặc CSKH tạo học sinh kèm tài khoản (`POST /users/student` từ `/staff/customer-care-detail`).

## Hành vi hiện tại

- Truy cập `/auth/register` (browser) → server redirect `/auth/login`.
- Gọi trực tiếp `POST /auth/register` → `403` với message: *"Đăng ký công khai hiện không được hỗ trợ. Vui lòng liên hệ quản trị viên."*
- Navbar, login page, và verify-email page **không còn** link/nút Đăng ký.

## Google OAuth

- Google OAuth **không tạo** tài khoản mới cho email chưa có trong hệ thống.
- Email chưa đăng ký → redirect `/auth/login?error=registration_disabled` + toast hướng dẫn liên hệ quản trị viên.
- Email đã tồn tại (admin tạo trước) → đăng nhập/setup-password như flow cũ.

## Spec cũ (archived)

Trước khi disable, form gồm: firstName, lastName, accountHandle, phone, email, password, confirmPassword, province; submit gọi `authApi.register`; thành công toast + redirect login sau 3s. Chi tiết validation/API contract vẫn nằm trong `apps/web/dtos/Auth.dto.ts` và `authService.createPendingUserWithVerificationEmail` (dùng nội bộ bởi admin provisioning).
