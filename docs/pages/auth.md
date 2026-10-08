# Auth pages (Login / Register / Forgot / Reset / Setup Password / Verify Email)

## Tổng quan

- **Paths:** `/auth/login`, `/auth/post-login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/setup-password`, `/verify-email`.
- **Disabled:** `/auth/register` redirect về `/auth/login`; `POST /auth/register` trả `403`. Đăng ký công khai (email/password + Google OAuth tạo user mới) đã tắt; admin vẫn tạo user qua `POST /users`.
- **State layer:** TanStack Query (`useMutation`) cho toàn bộ submit flow auth.
- **Global providers:** `QueryClientProvider` + Sonner `Toaster` được mount tại `apps/web/app/providers.tsx`.
- **Auth gate:** `apps/web/app/providers.tsx` có `AuthPasswordSetupGate`; nếu user có session hợp lệ (`id` + `accountHandle`) và `requiresPasswordSetup=true` thì mọi route client sẽ bị đẩy về `/auth/setup-password`, kể cả khi `roleType` hiện tại vẫn là `guest`. Khi gate chạy từ `/auth/*`, nó dùng query `next` hợp lệ nếu có, không lấy chính auth page làm đích sau setup.
- **Auth API contract:** `GET /auth/session` là contract auth nhẹ dùng cho SSR, `proxy.ts`, bootstrap client và redirect sau login/setup-password. `GET /auth/profile` giữ backward compatibility nhưng delegate cùng session resolver. Cả hai trả về `id`, `email`, `emailVerified`, `canAccessRestrictedRoutes`, `accountHandle`, `roleType`, `requiresPasswordSetup`, `avatarUrl`, `staffRoles`, `hasStaffProfile`, `hasStudentProfile`, `effectiveRoleTypes`, `staffProfileComplete`, `availableWorkspaces`, `defaultWorkspace`, `preferredRedirect`, và `access.{admin,staff,student}`.
- **Staff workspace trong session:** `roleType=admin` trả `availableWorkspaces` gồm `staff` và `access.staff.canAccess=true` dù không có linked `staffInfo`; `staffProfileComplete` vẫn phản ánh hồ sơ staff thật, nên proxy/client chỉ bypass profile guard cho admin đầy đủ, không biến admin thành staff self-profile.
- **Cookie policy:** backend set `access_token` và `refresh_token` với `secure=true` + `SameSite=Strict` khi `NODE_ENV=production`; ở `test` và các môi trường non-production thì dùng `secure=false` + `SameSite=Lax`.

## UI feedback chuẩn hoá

- Thay toàn bộ box thông báo inline lỗi/thành công trong 5 auth pages bằng toast của Sonner.
- Dùng `toast.error(...)` cho validation/mutation failure.
- Dùng `toast.success(...)` cho mutation success.
- Giữ nguyên redirect logic và fallback message hiện có.

## Redirect rules

- Guest mở protected route `/admin/**`, `/staff/**`, hoặc `/student` sẽ bị proxy redirect về `/auth/login?next=<path+query hiện tại>`; sau login thành công frontend chỉ ưu tiên `next` nếu internal, không thuộc `/auth/*`, và route đó khớp shell đăng nhập của role chính.
- Login thành công:
  - nếu `canAccessRestrictedRoutes=false` (chưa verify email, trừ admin), frontend giữ user ở Home (`/`) và bật popup xác minh khi truy cập trang cá nhân/role routes
  - nếu có `next` hợp lệ và cùng shell với role chính, redirect về `next`
  - `roleType=admin` -> `/admin/dashboard`
  - `roleType=student` -> `/student` khi session contract xác nhận `hasStudentProfile=true`; nếu chưa có profile thì fallback `/user-profile`
  - staff admin đầy đủ (`roleType=admin`, `staff.admin`, hoặc `access.admin.tier=full`) bypass staff profile completion khi vào staff/admin support shell
  - mọi staff role vận hành không phải admin (`teacher`, `lesson_plan`, `lesson_plan_head`, `assistant`, `accountant_income`, `accountant_expense`, `communication`, `technical`, `customer_care`, `training`, kể cả multi-role như `teacher + lesson_plan`) -> `/staff` chỉ khi session contract xác nhận `hasStaffProfile=true` và `staffProfileComplete=true` / `access.staff.profileComplete=true`; nếu thiếu profile, thiếu field bắt buộc, hoặc chưa đồng ý phiên bản data-consent hiện hành thì fallback `/user-profile?profile_required=1&from=/staff`
  - linked `studentInfo` -> `/student` khi user không có linked staff profile
  - `guest -> /`
- Google OAuth thành công (chỉ khi email **đã tồn tại** trong hệ thống):
  - nếu user đã có `passwordHash`: backend set cookie và redirect về `/auth/post-login`; trang này gọi `GET /auth/session` rồi chuyển tiếp theo cùng rule login thường (`preferredRedirect`, role workspace entrypoint, hoặc `next` hợp lệ)
  - nếu user chưa có `passwordHash`: backend set cookie và redirect tới `/auth/setup-password?source=google`
  - trường hợp account mới vẫn có `roleType = guest` vẫn được coi là session hợp lệ để hoàn tất setup password, không bị đá về login chỉ vì role là `guest`
- Google OAuth với email **chưa có** trong DB: redirect `/auth/login?error=registration_disabled`; frontend hiển thị toast hướng dẫn liên hệ quản trị viên.
- Setup password thành công:
  - ưu tiên redirect về `next` hợp lệ nếu route đó bị gate chặn trước đó
  - nếu không có `next`, redirect theo role giống login thường
- Register công khai: **disabled** — `/auth/register` redirect login; API trả `403`.
- Reset password thành công: toast success, delay 2s rồi redirect `/auth/login`.
- Forgot password thành công: luôn trả generic success message, không redirect, không tiết lộ email có tồn tại hay chưa.
- Forgot/reset/setup password hiển thị đầy đủ logo mark + tên **Unicorns Edu**; email reset password dùng React Email cùng baseline với email xác thực, có CTA, fallback link, và link cũ vô hiệu sau khi mật khẩu đổi.
- Verify email thành công: `/verify-email?token=...` tự gọi backend `GET /auth/verify`, hiển thị success/error và CTA quay về login.
- Khi user đang đăng nhập nhưng chưa verify email:
  - chỉ được ở Home (`/`)
  - bấm avatar hoặc vào route cá nhân/role route sẽ mở popup “Vui lòng xác minh email”
  - popup hỗ trợ 2 case: chưa có email thì nhập email mới; đã có email thì hiển thị email masked và gửi lại mail xác minh; backend chấp nhận `refresh_token` session hợp lệ cho `POST /auth/resend-verification` để user không bị kẹt khi `access_token` đã hết hạn.

## Lấy user trong Server Component

Để lấy thông tin user hiện tại trong **Server Component**, Route Handler hoặc Server Action (không dùng React context):

- Import và gọi `getUser()` từ `@/lib/auth-server`.
- Hàm đọc cookie auth từ request, gọi backend `GET /auth/session`, và trả về đầy đủ `UserInfoDto` nhẹ gồm `id`, `accountHandle`, `roleType`, `requiresPasswordSetup`, `avatarUrl`, `staffRoles`, `hasStaffProfile`, `hasStudentProfile`, `effectiveRoleTypes`, `staffProfileComplete`, `availableWorkspaces`, `defaultWorkspace`, `preferredRedirect`, và `access.{admin,staff,student}`; nếu lỗi thì fallback guest user.
- `apps/web/proxy.ts` dùng helper `shouldVerifySessionInProxy()` để chỉ gọi `GET /auth/session` cho direct/document navigation vào route protected. Next App Router RSC request khi đổi tab/query (`RSC`, `_rsc`, `next-router-state-tree`) và prefetch (`next-router-prefetch`, `purpose=prefetch`) được bỏ qua để không tạo burst verify session trong dashboard.

**Ví dụ (trang server component):**

```tsx
// app/some-page/page.tsx
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth-server";

export default async function SomePage() {
  const user = await getUser();
  if (user.roleType === "guest") {
    redirect("/auth/login");
  }
  return <div>Hello, {user.accountHandle}</div>;
}
```

**Lưu ý:** `getUser()` chỉ chạy được ở môi trường server (Server Components, Route Handlers, Server Actions). Ở Client Component vẫn dùng `useAuth()` từ `AuthContext`.

## Email vs accountHandle (model)

- **email**: địa chỉ email, unique, dùng để gửi xác thực / quên mật khẩu.
- **accountHandle**: định danh đăng nhập (username), unique, dùng trong JWT và hiển thị (navbar, profile).
- Login chấp nhận một chuỗi: backend coi là accountHandle trước, không có thì coi là email.
- User đăng ký Google: `accountHandle` được set = email. User đăng ký form: nhập email và accountHandle riêng (có thể trùng hoặc khác).
- Nếu user đăng nhập Google mà tài khoản tương ứng vẫn chưa có `passwordHash`, backend sẽ giữ session nhưng đánh dấu `requiresPasswordSetup=true` cho tới khi hoàn tất `POST /auth/setup-password`.

## API endpoints đang dùng

- **API (real only):** login, logout, me (profile + role + `requiresPasswordSetup`), verify email, forgot password, reset password, setup password đầu tiên cho user OAuth. `POST /auth/register` vẫn tồn tại nhưng trả `403` (public registration disabled).
- **Backend Auth endpoints hiện có:**
  - `POST /auth/login` body: `{ accountHandle, password, rememberMe? }`
    - Validation: `password` tối thiểu **6 ký tự** (`@MinLength(6)`). Nếu không đạt, API trả **400** (trước khi kiểm tra credentials); sai mật khẩu hợp lệ về độ dài thì **401**.
    - `accountHandle`: có thể là **email** hoặc **account handle** (username); backend tìm user theo accountHandle trước, không có thì theo email.
    - refresh token policy: mặc định 7 ngày, nếu `rememberMe=true` thì 30 ngày.
    - rate limit: `20` request / `5 phút` / IP.
  - `POST /auth/register` — **disabled**; luôn trả `403 Forbidden` với message đăng ký công khai không được hỗ trợ. Rate limit vẫn áp dụng nếu endpoint bị gọi.
  - `POST /auth/refresh` dùng `refresh_token` cookie
    - backend verify chữ ký refresh JWT **và** đối chiếu SHA-256 cookie với `user_devices.token_hash` cùng claim `deviceId` (`UserDevice.id`). Token cũ sau rotate / thiết bị đã xóa → **401**.
    - `last_active_at` được cập nhật khi bind refresh mới.
    - rate limit: `120` request / `1 phút` / IP.
  - `POST /auth/logout` — public (`@Public()`), không yêu cầu JWT guard; luôn xóa cookie `access_token` và `refresh_token`. Nếu request mang cookie auth, backend **xóa `UserDevice` khớp refresh/access** trước khi clear cookie. Request kế tiếp (kể cả access token còn hạn) → **401**.
- `GET /auth/session` — contract auth nhẹ cho frontend/server (`id`, `email`, `emailVerified`, `canAccessRestrictedRoutes`, `accountHandle`, `roleType`, `requiresPasswordSetup`, `avatarUrl`, `staffRoles`, `hasStaffProfile`, `hasStudentProfile`, `effectiveRoleTypes`, `staffProfileComplete`, `availableWorkspaces`, `defaultWorkspace`, `preferredRedirect`, `access.{admin,staff,student}`); guest trả về object cùng shape với default rỗng. `effectiveRoleTypes` là union của `users.role_type`, linked `staffInfo`, linked `studentInfo`, và full-admin staff role; FE/proxy phải dùng contract này thay vì chỉ so sánh `roleType`.
  - `GET /auth/profile` — backward-compatible alias của session resolver.
  - `GET /auth/me` — thông tin auth hiện tại từ DB theo `access_token`, trả cùng session shape.
  - `POST /auth/resend-verification` (cần session đăng nhập qua `access_token` hoặc `refresh_token`)
  - body optional: `{ email?: string }`
  - không truyền email: gửi lại email xác minh tới email hiện tại
  - có truyền email: cập nhật email tài khoản hiện tại, reset `emailVerified=false`, rồi gửi mail xác minh tới email mới
  - email xác minh gửi qua React Email (`apps/api/src/mail/templates/email-verification.email.tsx`): header thương hiệu, nút CTA «Xác thực email», fallback link, ghi chú hết hạn **24 giờ** (khớp JWT verify token), subject `[Unicorns Edu] Xác thực email tài khoản`
  - endpoint này là `@Public()` ở lớp global JWT guard nhưng tự xác thực cookie trong controller; nếu không có session hợp lệ vẫn trả `401`.
  - nếu SMTP chưa cấu hình hoặc provider từ chối đăng nhập SMTP, backend trả `503` với thông báo cấu hình thay vì `500`. Với Gmail, `SMTP_PASS` phải là App Password 16 ký tự, không phải mật khẩu đăng nhập Google thường; backend chấp nhận cả dạng Google hiển thị có khoảng trắng (`abcd efgh ijkl mnop`) và sẽ bỏ khoảng trắng trước khi gửi qua SMTP.
  - `GET /auth/verify?token=...`
    - rate limit: `30` request / `1 giờ` / IP.
  - `POST /auth/forgot-password` body: `{ email }`
    - response luôn generic success; chỉ account tồn tại và đã verify mới được gửi mail reset thật.
    - rate limit: `5` request / `1 giờ` / IP.
  - `POST /auth/reset-password` body: `{ token, password }`
    - token phải còn hợp lệ và khớp với password hash hiện tại; token cũ bị từ chối sau khi mật khẩu đã đổi.
    - xóa **mọi** `UserDevice` của user đó — mọi thiết bị mất quyền ngay request kế.
    - rate limit: `10` request / `1 giờ` / IP.
  - `POST /auth/setup-password` body: `{ password }`
    - chỉ dùng cho user đã đăng nhập nhưng chưa có `passwordHash`
    - backend sẽ hash mật khẩu, ghi audit, rotate lại cookies auth hiện tại (cùng `deviceId` nếu có)
    - rate limit: `10` request / `30 phút` / IP.
  - `POST /auth/change-password`
    - chỉ dùng khi tài khoản đã có mật khẩu và cần truyền `currentPassword`
    - xóa **mọi** `UserDevice` của user đó (cùng hiệu lực với reset password)
    - rate limit: `10` request / `30 phút` / IP.

### Student single-device login (ticket #65) + thu hồi tức thời (#101)

Luật một thiết bị tại một thời điểm, chỉ áp dụng cho `UserRole.student`. Staff/admin **không** magic-link / một máy, nhưng **có** `UserDevice` để thu hồi theo thiết bị (ADR `docs/adr/2026-09-07-immediate-device-revocation.md`).

Không dùng chữ "session" cho phiên đăng nhập: `Session` = Buổi học; phiên đăng nhập = `UserDevice` (`deviceId` trong JWT).

- `POST /auth/student/login` body: `{ accountHandle, password, rememberMe? }`
  - Validate credentials, kiểm tra đã `emailVerified`.
  - Nếu `roleType !== student` → trả `400` với `error: NOT_STUDENT_ACCOUNT`.
  - Nếu email chưa xác minh → trả `400` với `error: EMAIL_NOT_VERIFIED`.
  - Nếu student đã có device active → trả `409` với `error: DEVICE_ACTIVE`.
  - Tạo `login_requests` record, gửi magic link email tới student. Link mở `/auth/verify-login` trên origin public. Thứ tự: `FRONTEND_URL` nếu là HTTPS public; nếu giá trị đó còn là localhost thì `https://` + `VPS_PUBLIC_HOST`, rồi origin của `BACKEND_URL` (bỏ hậu tố `/api`), rồi `Host` + `X-Forwarded-Proto` khi host là `*.uniedu.vn` hoặc `*.unicornsedu.com`. Production không gửi link `localhost`. Host lạ bị từ chối.
  - Response: `{ requestId, activateSecret, message }`. `activateSecret` là one-time secret dùng ở bước activate; frontend lưu trong memory, không lưu localStorage.
  - Rate limit: `5` request / `60s` / IP.

- `POST /auth/student/login/poll` body: `{ requestId }`
  - Frontend poll mỗi 2s để kiểm tra trạng thái xác minh.
  - Response: `{ verified: boolean }`.
  - Khi `verified = true`, frontend gọi `POST /auth/student/activate` kèm `requestId` + `activateSecret`.
  - Rate limit: `30` request / `60s` / IP.

- `GET /auth/verify-login?token=...`
  - Magic link trong email trỏ tới `/auth/verify-login` (FE), FE gọi endpoint này.
  - Đánh dấu `login_requests.verified = true` (chỉ khi chưa verified và chưa hết hạn).
  - **Không** set cookie/kích hoạt phiên trên máy bấm link — thiết bị được kích hoạt luôn là máy khởi tạo (màn chờ xác minh gọi `/auth/student/activate`).
  - Trả `{ status, message, verified }` với `status` phân biệt để UI hiển thị thông báo riêng (ticket #66):
    - `verified` — bấm lần đầu hợp lệ: "Đã xác minh thành công, quay lại thiết bị vừa đăng nhập".
    - `used` — link đã được bấm trước đó (yêu cầu đã verified): "Liên kết đã được sử dụng".
    - `expired` — quá `expires_at` (10 phút): "Liên kết đã hết hạn".
    - `invalid` — token sai/thiếu/không tồn tại: "Liên kết không hợp lệ".
  - FE `/auth/verify-login` gọi endpoint bằng TanStack `useQuery` (`authKeys.verifyLogin`, `retry: false`, `staleTime: Infinity`) — không `useEffect` + `authApi.then`. UI thêm trạng thái `system` khi request lỗi mạng/5xx ("Không xác minh được"), tách khỏi `invalid`.
  - Rate limit: `30` request / `60s` / IP.

- `POST /auth/student/activate` body: `{ requestId, activateSecret, rememberMe? }`
  - Sau khi poll xác nhận `verified = true`.
  - Xác minh `activateSecret` khớp hash trong `login_requests`.
  - Xóa mọi device cũ của student (single-device rule).
  - Tạo `user_devices` record mới, cấp JWT (`deviceId` = id thiết bị), lưu SHA-256 refresh JWT vào `token_hash`, set cookies.
  - Response: `{ message }`.

- `POST /auth/student/logout`
  - Student tự đăng xuất. Xóa tất cả device records, invalidate refresh token.
  - Response: `{ message }`.

- `POST /auth/admin/students/:id/force-logout`
  - Admin/CSKH/assistant buộc đăng xuất học sinh.
  - Xóa mọi device records, invalidate refresh token, ghi audit trail.
  - Request kế tiếp (access token còn hạn) → **401** `NO_ACTIVE_DEVICE`.
  - Yêu cầu `@Roles(UserRole.admin, UserRole.staff)`.

- `DELETE /device/:deviceId/force-logout`
  - Xóa một `UserDevice` cụ thể; invalidate identity cache ngay để request kế không dùng cache `hasActiveDevice` cũ.
  - FE `StudentDevicePopup`: hỏi `window.confirm` trước khi gọi (TODO #11 dialog dùng chung); nút dùng token `error`.

- Kiểm tra phiên trên **mọi** request đã xác thực (`JwtAuthGuard` / `JwtStrategy` là `APP_GUARD`), không chỉ `/auth/refresh`:
  - JWT mới: lookup `UserDevice` theo `deviceId`; không còn / idle 60 ngày → 401 `NO_ACTIVE_DEVICE`.
  - JWT học sinh legacy (chưa có `deviceId`, tối đa ~15 phút): fallback `hasActiveDevice` (cache identity TTL 5s, invalidate khi xóa device).
  - `POST /auth/refresh`: `JwtRefreshStrategy` so khớp refresh cookie với `token_hash` + `deviceId`. Replay cookie sau logout / force-logout / đổi mật khẩu → 401.
  - `last_active_at` throttle 1 phút, không ghi DB mỗi request.

- Lazy cleanup: khi tạo login request mới, tự động xóa login requests hết hạn và devices inactive > 60 ngày.
- **Global rate limit:** các endpoint HTTP khác của API dùng limit mặc định `300` request / `60s` / endpoint / IP; health check `GET /` được `@SkipThrottle()`.
- **Phản hồi khi vượt ngưỡng:** backend trả `429 Too Many Requests`; frontend nên surface message này qua Sonner toast như các lỗi auth khác.
- **Contract:** Auth DTO và role enum aligned với backend.
- **Mock:** Not used for auth; mock layer chỉ dùng cho nội dung sau đăng nhập.

## Hồ sơ cá nhân (User module)

Các endpoint xem/sửa hồ sơ hiện tại nằm trong **user module** (không phải auth):

- `GET /users/me/full` — hồ sơ đầy đủ: user + `staffInfo` + `studentInfo` (nếu có). Yêu cầu cookie `access_token`.
- Trong rollout hiện tại, tên staff canonical nằm ở `User` (`first_name`, `last_name`) và hiển thị theo thứ tự Việt Nam `last_name` + `first_name`; frontend có thể nhận thêm `fullName` nếu backend expose. `staffInfo.fullName` vẫn có thể xuất hiện trong response nhưng chỉ là giá trị derived để tương thích ngược.
- `PATCH /users/me` — cập nhật thông tin tài khoản (first_name, last_name, email, phone, province, accountHandle). Body: `UpdateMyProfileDto`. Nếu đổi email, backend tự reset `emailVerified=false` để bắt buộc xác minh lại email mới. Trả về full profile.
- `PATCH /users/me/staff` — cập nhật hồ sơ nhân sự (`cccd_*`, `ethnicity`, `gender`, `current_address`, `birth_date`, `university`, `high_school`, `bank_account`, `bank_qr_link`). Body: `UpdateMyStaffProfileDto`. Không dùng endpoint này để đổi tên staff canonical, và không dùng để sửa thành tích. `bank_qr_link` chỉ chấp nhận URL `http/https` (được trim trước khi lưu). 400 nếu user không có staff.
- `PATCH /users/me/student` — cập nhật hồ sơ học viên (full_name, email, school, liên hệ phụ huynh gồm `parent_name`/`parent_phone`/`parent_email`/`parent_receipt_email_enabled`, …). Body: `UpdateMyStudentProfileDto` (self-service không cho cập nhật `status`). `parent_email` là email nhận **biên lai nạp ví** (sau webhook SePay), không phải email đăng nhập; truyền `null` hoặc chuỗi rỗng để xoá. `parent_receipt_email_enabled` (mặc định `true`): khi `false`, webhook không gửi email biên lai cho phụ huynh lẫn CSKH. 400 nếu user không có student.
- `POST /users/me/avatar` — upload ảnh đại diện, chỉ nhận JPEG/PNG/WEBP, tối đa 5MB (controller-level filter + service-level validation).
- `GET /users/me/student-detail` — hồ sơ self-service của học sinh hiện tại, chỉ trả về field an toàn cho student UI (không có gói học phí / field admin-only).
- `GET /users/me/student-wallet-history?limit=` — lịch sử ví của học sinh hiện tại từ `wallet_transactions_history`.
- `GET /users/me/student-wallet-sepay-static-qr` — trả **QR SePay tĩnh** cho học sinh hiện tại; QR không chứa số tiền, nội dung chuyển khoản là `[SEPAY_TRANSFER_NOTE_PREFIX] UNIST-[0-9a-f]{10}` và response vẫn có `classIds` để tương thích. Prefix mặc định rỗng; VietinBank theo hướng dẫn SePay nên dùng `SEVQR`. Frontend hiển thị QR này trực tiếp trong popup nạp ví; webhook mới cộng `account_balance` theo student id ở đầu nội dung và vẫn tương thích QR cũ có marker `NAPVI`, `UNICL-*`, `LOP ...`.
- `POST /users/me/student-wallet-sepay-topup-order` — legacy/dynamic order endpoint; tạo yêu cầu nạp tiền SePay kèm QR theo body `{ amount }`. UI chính không còn gọi endpoint này.
- `POST /webhook/sepay` — webhook/IPN từ SePay khi ngân hàng phát sinh giao dịch; xác thực HMAC bằng `X-SePay-Signature` + `X-SePay-Timestamp` với `SEPAY_WEBHOOK_SECRET`, tính trên chuỗi `{timestamp}.{raw_body}` bằng raw body đúng byte SePay gửi, không serialize lại từ `req.body`; timestamp lệch quá `SEPAY_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` giây (mặc định `300`) bị từ chối, fallback `X-Secret-Key` cũ chỉ được chấp nhận khi `SEPAY_WEBHOOK_ALLOW_LEGACY_SECRET_KEY=1`. Endpoint reconcile đơn dynamic cũ hoặc nội dung QR tĩnh `UNIST-[0-9a-f]{10}`, parse student id từ phần đầu nội dung, vẫn chấp nhận format cũ có `NAPVI`/`NAP VI`, `UNICL-*`, `LOP ...` và token ngân hàng đã strip dấu như `UNIST<10hex>`/`UNICL<10hex>`, tạo ledger completed trong `student_wallet_sepay_orders` để chống cộng trùng, tạo `wallet_transactions_history`, cập nhật số dư ví, lưu payload/tham chiếu giao dịch và trả `{ "success": true }`. Chỉ khi `student_info.parent_receipt_email_enabled=true` mới gửi email biên lai (tới `parent_email` nếu có và CSKH phụ trách nếu có email); khi `false` thì bỏ qua toàn bộ email biên lai. Biên lai dùng React Email + PDF đính kèm khi cấu hình Chromium, không hiển thị trường “Người thanh toán”, kèm dòng nội dung `Học sinh <id học sinh> gia hạn học phí các gói <tên lớp active...>`; lỗi SMTP chỉ log/catch, không làm fail acknowledge webhook.
- `PATCH /users/me/student-account-balance` — legacy endpoint self-service cũ; backend hiện luôn trả 400 và yêu cầu dùng SePay QR. Học sinh không được tự nạp/rút hoặc gửi số âm để chỉnh số dư trực tiếp.

DTO: `apps/web/dtos/profile.dto.ts` và `apps/api/src/dtos/profile.dto.ts`.

## Trang hồ sơ cá nhân (`/user-profile`)

- **Path:** `/user-profile`.
- **Mục đích:** Hiển thị và cho phép chỉnh sửa thông tin user, staff (nếu có), student (nếu có).
- **UI/UX:** Trang là vỏ (`app/user-profile/page.tsx`: query, header, banner `profile_required`, gợi ý bổ sung, dòng điều hướng mục + %) bọc component tái sử dụng `components/user-profile/UserProfileEditor.tsx` (nhận `profile`, tự giữ mutation). Mobile-first: một cột xếp dọc; từ `lg` hai cột. **Cột trái** (`#profile-avatar`): avatar (bấm xem full-size), tải/xoá ảnh, tên hiển thị + % hoàn thiện, ô **Tên** và **Họ và tên đệm**, nút pill «Đặt lại mật khẩu» (`/auth/forgot-password`). **Cột phải**: «Thông tin chung» (email + trạng thái xác minh, SĐT, handle, tỉnh/thành, vai trò chỉ đọc), rồi khối «Nhân sự» + «Dữ liệu cá nhân» hoặc «Học viên» (kèm switch biên lai, CTA Học phí, lịch thi). Trang không hiển thị lương.
- **Lưu khi rời ô:** Không còn chế độ xem/sửa, nút «Chỉnh sửa» hay nút «Lưu thay đổi» chung; mọi ô luôn là input. Rời ô (blur) → so với giá trị đã lưu (`lib/profile-blur-save.ts`, trim): không đổi thì **không gọi API**; đổi thì PATCH đúng một field qua `updateMyProfile` / `updateMyStaffProfile` / `updateMyStudentProfile`, toast Sonner «Đã lưu …» hoặc lỗi từ server (lỗi thì ô quay về giá trị đã lưu). Ô chọn (giới tính) lưu ngay khi chọn. Ô trống: tên, email, handle, CCCD, ngày cấp/ngày sinh, họ tên/năm sinh học viên **không cho xoá** (trả về giá trị cũ + toast lỗi, không gọi API); email phụ huynh xoá gửi `null`; ô khác xoá gửi chuỗi rỗng. Các mutation lưu hồ sơ dùng chung `scope` TanStack Query nên chạy nối tiếp, response cuối luôn là bản mới nhất. Avatar vẫn chọn ảnh rồi bấm «Lưu ảnh».
- **Tên staff canonical:** chỉnh ở ô Tên / Họ và tên đệm cột trái vì nguồn chuẩn nằm trên `User` (đi qua `updateMyProfile`); khối «Nhân sự» cho sửa các field staff-specific (CCCD, dân tộc, giới tính, địa chỉ hiện tại, học vấn, ngân hàng), `status`/`roles` chỉ đọc. Thành tích là danh sách riêng.
- **Nhân sự (staff):** CCCD, dân tộc, giới tính, địa chỉ hiện tại, ngày/nơi cấp, ngày sinh, học vấn, tài khoản/QR ngân hàng; cập nhật qua `updateMyStaffProfile`. **Thành tích** dùng `AchievementListEditor` (`/users/me/achievements`): thêm dòng bắt buộc kèm ảnh, ảnh đã có chỉ được thay, dòng cũ thiếu ảnh vẫn hiện. Không còn textarea `specialization` hay ô `personal_achievement_link`. Có thể chỉnh tương đương qua `/staff/profile` (popup self-edit).
- **Data:** `useQuery` với `getFullProfile()` (GET /users/me/full); độ hoàn thiện tính ở `lib/user-profile-completion.ts`. Sau mỗi lần lưu, cache `["profile","full"]` / `["auth","full-profile"]` được set bằng response; các mutation có thể đổi trạng thái gate (`users/me`, staff profile, avatar) refresh lại `GET /auth/session` để `staffProfileComplete`/`access.staff.profileComplete` không bị stale. Quyền sửa không đổi: user chỉ sửa hồ sơ của chính mình qua `users/me/*`.
- **Popup hồ sơ (`UserProfileDialog`):** Gia sư/staff bấm avatar ở footer `StaffSidebar`, học sinh bấm khối avatar + tên trên `StudentHeader` → mở popup «Hồ sơ của tôi» (`components/user-profile/UserProfileDialog.tsx`, nút `UserProfileDialogTrigger`) **không chuyển trang**. Nội dung là cùng `UserProfileEditor` (lưu khi rời ô, cùng mutation/scope), dữ liệu từ cùng cache `["profile","full"]` (`lib/profile-full-query.ts`, dùng chung với trang). `ResponsiveDialog` size `5xl`, render qua `BodyPortal` (sidebar staff có `transform` + `overflow-hidden`); mobile là sheet dính đáy, thân popup cuộn. Đóng bằng nút ×, Escape hoặc backdrop: ô đang focus được blur trước để kịp lưu, mutation vẫn chạy xong sau khi popup gỡ nên dữ liệu đã lưu được giữ (mở lại thấy giá trị mới, avatar/tên trên shell cập nhật theo `["auth","full-profile"]`). Bấm link trong popup (Đặt lại mật khẩu, Học phí, «Mở trang hồ sơ») điều hướng cùng tab thì đóng popup; Ctrl/Cmd-click hoặc `target="_blank"` giữ popup. Nút «Hồ sơ & Lịch thi» trên navbar học sinh và các CTA gate vẫn đi tới trang `/user-profile`.
- **Xác minh email:** Dòng Email (tài khoản) hiển thị icon + nhãn **Đã xác minh** / **Chưa xác minh** theo `emailVerified` từ `GET /users/me/full` (`EmailVerificationInline`). Khi **chưa** xác minh: nút «Xác minh email →→» gọi `POST /auth/resend-verification` (`authApi.resendVerificationEmail`). Mock `apps/web/mocks/user-profile-verification.mock.ts`: mặc định `forceEmailUnverifiedForTest: false` để hiển thị đúng API; có thể bật tạm khi test UI. `emailVerifiedWhenApiMissing` khi API thiếu field. Email trên hồ sơ **học viên** khác email đăng nhập: hiển thị ghi chú không áp dụng trạng thái xác minh tài khoản; nếu trùng email đăng nhập thì trạng thái trùng với tài khoản.
- **Bảo vệ:** Nếu 401 (chưa đăng nhập), trang gợi ý đăng nhập và link tới `/auth/login`.
- **Auth session contract:** `GET /auth/session` trả role gốc (`roleType`) cùng contract quyền đã resolve: `effectiveRoleTypes`, `staffRoles`, `hasStaffProfile`, `hasStudentProfile`, `staffProfileComplete`, `availableWorkspaces`, `defaultWorkspace`, `preferredRedirect`, và `access.{admin,staff,student}`. Contract này là nguồn chính cho redirect sau login/proxy/client gates khi một user có nhiều linked profile.
- **Role gates:** `AdminAccessGate`, `StudentAccessGate` và `StaffAccessGate` dùng lightweight auth session (`useAuth()` bootstrap từ `GET /auth/session`) để kiểm tra quyền đã resolve thay vì chỉ dựa vào `roleType`. `StaffAccessGate` redirect về `/user-profile` khi actor staff không phải admin có staff workspace nhưng thiếu linked staff profile, thiếu hồ sơ bắt buộc, hoặc chưa đồng ý data-consent hiện hành; nếu profile đã hoàn tất nhưng thiếu quyền route thì hiển thị màn locked. `StudentAccessGate` mở khi session có `access.student.canAccess` hoặc linked `studentInfo`, kể cả khi `roleType` chính không phải `student`.
- **Staff profile completion:** Section «Nhân sự» của `/user-profile` tính các field staff người dùng tự hoàn thiện và trạng thái data-consent; `status`/`roles` không tính vào bộ đếm. Gate `staffProfileComplete` (BE) bắt buộc thêm `users.avatar_path` (cùng CCCD, học vấn, ngân hàng, data-consent). `specialization` / `personal_achievement_link` không còn trong gate, không còn trên form và API không nhận ghi; cột DB giữ dữ liệu cũ.
- **Email verification gate:** Với session `canAccessRestrictedRoutes=false`, frontend chặn các route cá nhân/role routes bằng popup xác minh và giữ user ở Home; backend tiếp tục chặn `users/me/*` bằng guard để tránh lộ dữ liệu cá nhân qua API trực tiếp. Admin đầy đủ (`roleType=admin` hoặc `staff.admin`) được coi là `canAccessRestrictedRoutes=true` trong session và được backend guard bỏ qua bước email verification.

## Tài liệu chi tiết theo trang

- [auth-login.md](./auth-login.md)
- [auth-register.md](./auth-register.md)
- [auth-forgot-password.md](./auth-forgot-password.md)
- [auth-reset-password.md](./auth-reset-password.md)
- [auth-setup-password.md](./auth-setup-password.md)
