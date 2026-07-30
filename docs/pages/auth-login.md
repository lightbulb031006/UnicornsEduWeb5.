# Auth Login Page (`/auth/login`)

## Mục tiêu

Cho phép người dùng đăng nhập bằng email/password hoặc Google OAuth, hiển thị feedback bằng Sonner toast.

## Hành vi chính

- Submit login gọi `authApi.logIn`.
- Backend set `access_token` + `refresh_token` qua HTTP-only cookies; frontend bootstrap session bằng `authApi.getSession()` (helper `bootstrapPostLoginSession`) rồi resolve redirect.
- User đã có session hợp lệ mở `/auth/login` sẽ được tự chuyển tiếp sang workspace entrypoint tương ứng (trừ khi còn `requiresPasswordSetup`).
- Tài khoản **chưa xác minh email** vẫn đăng nhập thành công (nếu đúng mật khẩu + handle/email) để tạo cảm giác đã đăng nhập.
- Nếu session trả về `canAccessRestrictedRoutes=false`, frontend giữ user ở `/` (Home-only mode). Admin đầy đủ (`roleType=admin` hoặc `staff.admin`) được backend trả `canAccessRestrictedRoutes=true` kể cả khi email chưa verify.
- Nếu URL có query `next` hợp lệ (internal path, không phải `/auth/*`) và route đó khớp shell đăng nhập của role chính, login thành công ưu tiên redirect về `next`; nếu không khớp (ví dụ staff kế toán có `next=/admin/*` nhưng session chỉ nên vào staff shell mặc định) thì bỏ `next` và dùng `preferredRedirect`/workspace entrypoint. Primary admin được giữ `next=/staff/**` để bypass vào staff workspace khi cần kiểm tra/hỗ trợ.
- Nếu session trả `requiresPasswordSetup=true`, login chuyển thẳng sang `/auth/setup-password?next=<redirect đích>` để giữ đúng đích sau bước tạo mật khẩu.
- Redirect theo role:
  - `admin` -> `/admin/dashboard`
  - `student` -> `/student` khi đã có linked student profile; nếu chưa có profile -> `/user-profile`
  - mọi staff role không phải `roleType=admin`, kể cả `staff.admin`, `staff.assistant`, `staff.accountant_income`, `staff.accountant_expense`, `staff.lesson_plan_head`, và multi-role như `teacher + lesson_plan`, -> `/staff` khi đã có linked staff profile; nếu chưa có profile -> `/user-profile`
  - linked `studentInfo` -> `/student` khi user không có linked staff profile
  - fallback -> `/`
- Trường hợp query `error=google_no_user`: hiển thị `toast.error`.
- Trường hợp query `error=registration_disabled`: hiển thị toast *"Tài khoản chưa tồn tại trong hệ thống. Vui lòng liên hệ quản trị viên để được cấp tài khoản."* (Google OAuth với email chưa được admin tạo).
- Nếu user bấm Google OAuth và backend phát hiện tài khoản tương ứng chưa có `passwordHash`, flow sẽ bị chuyển sang `/auth/setup-password?source=google` thay vì cho vào app ngay.
- Google OAuth thành công (đã có mật khẩu): backend redirect `/auth/post-login` để FE resolve dashboard/workspace entrypoint; không dừng ở homepage.

## Feedback UI

- Error network/API: `toast.error(...)`.
- Login fail thông thường: `toast.error("Đăng nhập thất bại.")`.
- Nếu backend trả `429 Too Many Requests`, màn login ưu tiên hiện toast rate-limit thay vì toast thất bại chung.
- Success login: `toast.success("Đăng nhập thành công.")`.
- Không render alert box inline trong form.

## Email vs account handle (login)

- Ô đăng nhập nhận **email** hoặc **account handle** (một trường duy nhất).
- Backend ưu tiên tìm theo `accountHandle` trùng, không có thì tìm theo `email`.
- Profile trả về `accountHandle` (hiển thị trên navbar, popup); với user đăng ký Google thì `accountHandle` = email.

## Ghi chú

- Session contract hiện bao gồm thêm: `email`, `emailVerified`, `canAccessRestrictedRoutes`.
- Khi user non-admin chưa verify, mọi attempt mở route cá nhân/role route sẽ bị chặn về Home và bật popup xác minh email.
- Google button dùng backend URL từ `NEXT_PUBLIC_BACKEND_URL` (fallback localhost:3001).
