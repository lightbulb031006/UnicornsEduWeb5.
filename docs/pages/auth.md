# Auth pages (Login / Register / Forgot / Reset / Setup Password / Verify Email)

## Tổng quan

- **Paths:** `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/setup-password`, `/verify-email`.
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
  - mọi staff role vận hành không phải admin (`teacher`, `lesson_plan`, `lesson_plan_head`, `assistant`, `accountant`, `communication`, `technical`, `customer_care`, kể cả multi-role như `teacher + lesson_plan`) -> `/staff` chỉ khi session contract xác nhận `hasStaffProfile=true` và `staffProfileComplete=true` / `access.staff.profileComplete=true`; nếu thiếu profile, thiếu field bắt buộc, hoặc chưa đồng ý phiên bản data-consent hiện hành thì fallback `/user-profile?profile_required=1&from=/staff`
  - linked `studentInfo` -> `/student` khi user không có linked staff profile
  - `guest -> /`
- Google OAuth thành công:
  - nếu user đã có `passwordHash`: backend set cookie và redirect về `FRONTEND_URL` như flow cũ
  - nếu user chưa có `passwordHash`: backend set cookie và redirect tới `/auth/setup-password?source=google`
  - trường hợp account mới vẫn có `roleType = guest` vẫn được coi là session hợp lệ để hoàn tất setup password, không bị đá về login chỉ vì role là `guest`
- Setup password thành công:
  - ưu tiên redirect về `next` hợp lệ nếu route đó bị gate chặn trước đó
  - nếu không có `next`, redirect theo role giống login thường
- Register thành công: toast success, delay 3s rồi redirect `/auth/login`.
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

- **API (real only):** login, logout, me (profile + role + `requiresPasswordSetup`), register, verify email, forgot password, reset password, setup password đầu tiên cho user OAuth.
- **Backend Auth endpoints hiện có:**
  - `POST /auth/login` body: `{ accountHandle, password, rememberMe? }`
    - Validation: `password` tối thiểu **6 ký tự** (`@MinLength(6)`). Nếu không đạt, API trả **400** (trước khi kiểm tra credentials); sai mật khẩu hợp lệ về độ dài thì **401**.
    - `accountHandle`: có thể là **email** hoặc **account handle** (username); backend tìm user theo accountHandle trước, không có thì theo email.
    - refresh token policy: mặc định 7 ngày, nếu `rememberMe=true` thì 30 ngày.
    - rate limit: `20` request / `5 phút` / IP.
  - `POST /auth/register` body: `{ email, accountHandle, password, ... }`
    - `accountHandle` phải unique; nếu trùng với user khác (khác email) sẽ trả 400.
    - rate limit: `10` request / `1 giờ` / IP.
  - `POST /auth/refresh` dùng `refresh_token` cookie
    - backend verify chữ ký refresh JWT **và** đối chiếu hash token đang trình bày với `user.refreshToken` đã lưu; refresh token cũ/đã rotate sẽ bị từ chối.
    - rate limit: `120` request / `1 phút` / IP.
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
    - rate limit: `10` request / `1 giờ` / IP.
  - `POST /auth/setup-password` body: `{ password }`
    - chỉ dùng cho user đã đăng nhập nhưng chưa có `passwordHash`
    - backend sẽ hash mật khẩu, ghi audit, rotate lại cookies auth hiện tại
    - rate limit: `10` request / `30 phút` / IP.
  - `POST /auth/change-password`
    - chỉ dùng khi tài khoản đã có mật khẩu và cần truyền `currentPassword`
    - rate limit: `10` request / `30 phút` / IP.
- **Global rate limit:** các endpoint HTTP khác của API dùng limit mặc định `300` request / `60s` / endpoint / IP; health check `GET /` được `@SkipThrottle()`.
- **Phản hồi khi vượt ngưỡng:** backend trả `429 Too Many Requests`; frontend nên surface message này qua Sonner toast như các lỗi auth khác.
- **Contract:** Auth DTO và role enum aligned với backend.
- **Mock:** Not used for auth; mock layer chỉ dùng cho nội dung sau đăng nhập.

## Hồ sơ cá nhân (User module)

Các endpoint xem/sửa hồ sơ hiện tại nằm trong **user module** (không phải auth):

- `GET /users/me/full` — hồ sơ đầy đủ: user + `staffInfo` + `studentInfo` (nếu có). Yêu cầu cookie `access_token`.
- Trong rollout hiện tại, tên staff canonical nằm ở `User` (`first_name`, `last_name`) và hiển thị theo thứ tự Việt Nam `last_name` + `first_name`; frontend có thể nhận thêm `fullName` nếu backend expose. `staffInfo.fullName` vẫn có thể xuất hiện trong response nhưng chỉ là giá trị derived để tương thích ngược.
- `PATCH /users/me` — cập nhật thông tin tài khoản (first_name, last_name, email, phone, province, accountHandle). Body: `UpdateMyProfileDto`. Nếu đổi email, backend tự reset `emailVerified=false` để bắt buộc xác minh lại email mới. Trả về full profile.
- `PATCH /users/me/staff` — cập nhật hồ sơ nhân sự (`cccd_*`, `ethnicity`, `gender`, `current_address`, `birth_date`, `university`, `high_school`, `specialization`, `bank_account`, `bank_qr_link`). Body: `UpdateMyStaffProfileDto`. Không dùng endpoint này để đổi tên staff canonical. `bank_qr_link` chỉ chấp nhận URL `http/https` (được trim trước khi lưu). 400 nếu user không có staff.
- `PATCH /users/me/student` — cập nhật hồ sơ học viên (full_name, email, school, liên hệ phụ huynh gồm `parent_name`/`parent_phone`/`parent_email`, …). Body: `UpdateMyStudentProfileDto` (self-service không cho cập nhật `status`). `parent_email` là email nhận **biên lai nạp ví** (sau webhook SePay), không phải email đăng nhập; truyền `null` hoặc chuỗi rỗng để xoá. 400 nếu user không có student.
- `POST /users/me/avatar` — upload ảnh đại diện, chỉ nhận JPEG/PNG/WEBP, tối đa 5MB (controller-level filter + service-level validation).
- `GET /users/me/student-detail` — hồ sơ self-service của học sinh hiện tại, chỉ trả về field an toàn cho student UI (không có gói học phí / field admin-only).
- `GET /users/me/student-wallet-history?limit=` — lịch sử ví của học sinh hiện tại từ `wallet_transactions_history`.
- `GET /users/me/student-wallet-sepay-static-qr` — trả **QR SePay tĩnh** cho học sinh hiện tại; QR không chứa số tiền, nội dung chuyển khoản là `[SEPAY_TRANSFER_NOTE_PREFIX] UNIST-{uuid} UNICL-{uuid}... LOP <tên lớp...>` và response có `classIds`. Prefix mặc định rỗng; VietinBank theo hướng dẫn SePay nên dùng `SEVQR`. Frontend hiển thị QR này trực tiếp trong popup nạp ví; webhook mới cộng `account_balance` theo student/class id ở đầu nội dung và vẫn tương thích QR cũ có marker `NAPVI`.
- `POST /users/me/student-wallet-sepay-topup-order` — legacy/dynamic order endpoint; tạo yêu cầu nạp tiền SePay kèm QR theo body `{ amount }`. UI chính không còn gọi endpoint này.
- `POST /webhook/sepay` — webhook/IPN từ SePay khi ngân hàng phát sinh giao dịch; xác thực HMAC bằng `X-SePay-Signature` + `X-SePay-Timestamp` với `SEPAY_WEBHOOK_SECRET`, tính trên chuỗi `{timestamp}.{raw_body}` bằng raw body đúng byte SePay gửi, không serialize lại từ `req.body`; timestamp lệch quá `SEPAY_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` giây (mặc định `300`) bị từ chối, fallback `X-Secret-Key` cũ chỉ được chấp nhận khi `SEPAY_WEBHOOK_ALLOW_LEGACY_SECRET_KEY=1`. Endpoint reconcile đơn dynamic cũ hoặc nội dung QR tĩnh `UNIST-{uuid} UNICL-{uuid}... LOP <tên lớp...>`, parse student/class id từ phần đầu nội dung, vẫn chấp nhận format cũ có `NAPVI`/`NAP VI` và token ngân hàng đã strip dấu như `UNIST<hex>` nếu phần prefix khớp duy nhất một học sinh, tạo ledger completed trong `student_wallet_sepay_orders` để chống cộng trùng, tạo `wallet_transactions_history`, cập nhật số dư ví, lưu payload/tham chiếu giao dịch và trả `{ "success": true }`. Nếu hồ sơ học sinh có `parent_email` thì backend gửi email biên lai nạp ví cho phụ huynh; nếu học sinh có CSKH phụ trách có email thì gửi thêm một email riêng cho CSKH. Biên lai dùng React Email + PDF đính kèm khi cấu hình Chromium, kèm dòng nội dung tiếng Việt nhận diện học sinh/lớp/số tiền; lỗi SMTP chỉ log/catch, không làm fail acknowledge webhook.
- `PATCH /users/me/student-account-balance` — legacy endpoint self-service cũ; backend hiện luôn trả 400 và yêu cầu dùng SePay QR. Học sinh không được tự nạp/rút hoặc gửi số âm để chỉnh số dư trực tiếp.

DTO: `apps/web/dtos/profile.dto.ts` và `apps/api/src/dtos/profile.dto.ts`.

## Trang hồ sơ cá nhân (`/user-profile`)

- **Path:** `/user-profile`.
- **Mục đích:** Hiển thị và cho phép chỉnh sửa thông tin user, staff (nếu có), student (nếu có).
- **UI/UX:** Bố cục hai cột từ `lg` (`max-w-5xl`): **cột trái** (~1/4) — avatar tròn, tên, nút pill «Đặt lại mật khẩu» (`/auth/forgot-password`), upload/xoá ảnh đại diện; **cột phải** — các khối «Thông tin chung», «Nhân sự», «Học viên» với danh sách **nhãn căn phải / giá trị căn trái** (`DetailRows`), phân nhóm bằng `hr`. Điều hướng mục bằng dòng link + %; gợi ý bổ sung (nếu có) phía trên lưới.
- **Tên staff canonical:** hiển thị và chỉnh ở khối «Thông tin chung» vì nguồn chuẩn nằm trên `User`; khối «Nhân sự» cho sửa các field staff-specific (CCCD, dân tộc, giới tính, địa chỉ hiện tại, học vấn, ngân hàng, minh chứng thành tích).
- **Nhân sự (staff):** form gồm CCCD, dân tộc, giới tính, địa chỉ hiện tại, ngày/nơi cấp, ngày sinh, học vấn, chuyên ngành (`specialization` là textarea nhiều dòng, lưu newline thật để render Markdown), tài khoản/QR ngân hàng, **minh chứng thành tích** (`personal_achievement_link`); cập nhật qua `updateMyStaffProfile`. Có thể chỉnh tương đương qua `/staff/profile` (popup self-edit).
- **Data:** `useQuery` với `getFullProfile()` (GET /users/me/full). Cập nhật qua `updateMyProfile`, `updateMyStaffProfile`, `updateMyStudentProfile` với TanStack Query mutation; riêng tên staff canonical ở `/user-profile` đi qua `updateMyProfile`, không đi qua `updateMyStaffProfile`; toast Sonner cho thành công/lỗi. Sau các mutation có thể đổi trạng thái gate (`users/me`, staff profile, avatar, data-consent), frontend refresh lại `GET /auth/session` để `staffProfileComplete`/`access.staff.profileComplete` không bị stale.
- **Xác minh email:** Dòng Email (tài khoản) hiển thị icon + nhãn **Đã xác minh** / **Chưa xác minh** theo `emailVerified` từ `GET /users/me/full` (`EmailVerificationInline`). Khi **chưa** xác minh: nút «Xác minh email →→» gọi `POST /auth/resend-verification` (`authApi.resendVerificationEmail`). Mock `apps/web/mocks/user-profile-verification.mock.ts`: mặc định `forceEmailUnverifiedForTest: false` để hiển thị đúng API; có thể bật tạm khi test UI. `emailVerifiedWhenApiMissing` khi API thiếu field. Email trên hồ sơ **học viên** khác email đăng nhập: hiển thị ghi chú không áp dụng trạng thái xác minh tài khoản; nếu trùng email đăng nhập thì trạng thái trùng với tài khoản.
- **Bảo vệ:** Nếu 401 (chưa đăng nhập), trang gợi ý đăng nhập và link tới `/auth/login`.
- **Auth session contract:** `GET /auth/session` trả role gốc (`roleType`) cùng contract quyền đã resolve: `effectiveRoleTypes`, `staffRoles`, `hasStaffProfile`, `hasStudentProfile`, `staffProfileComplete`, `availableWorkspaces`, `defaultWorkspace`, `preferredRedirect`, và `access.{admin,staff,student}`. Contract này là nguồn chính cho redirect sau login/proxy/client gates khi một user có nhiều linked profile.
- **Role gates:** `AdminAccessGate`, `StudentAccessGate` và `StaffAccessGate` dùng lightweight auth session (`useAuth()` bootstrap từ `GET /auth/session`) để kiểm tra quyền đã resolve thay vì chỉ dựa vào `roleType`. `StaffAccessGate` redirect về `/user-profile` khi actor staff không phải admin có staff workspace nhưng thiếu linked staff profile, thiếu hồ sơ bắt buộc, hoặc chưa đồng ý data-consent hiện hành; nếu profile đã hoàn tất nhưng thiếu quyền route thì hiển thị màn locked. `StudentAccessGate` mở khi session có `access.student.canAccess` hoặc linked `studentInfo`, kể cả khi `roleType` chính không phải `student`.
- **Staff profile completion:** Section «Nhân sự» của `/user-profile` tính 12 field staff người dùng tự hoàn thiện; `status`, `roles`, và `personal_achievement_link` không tính vào bộ đếm bắt buộc. `personal_achievement_link` là minh chứng thành tích tùy chọn.
- **Email verification gate:** Với session `canAccessRestrictedRoutes=false`, frontend chặn các route cá nhân/role routes bằng popup xác minh và giữ user ở Home; backend tiếp tục chặn `users/me/*` bằng guard để tránh lộ dữ liệu cá nhân qua API trực tiếp. Admin đầy đủ (`roleType=admin` hoặc `staff.admin`) được coi là `canAccessRestrictedRoutes=true` trong session và được backend guard bỏ qua bước email verification.

## Tài liệu chi tiết theo trang

- [auth-login.md](./auth-login.md)
- [auth-register.md](./auth-register.md)
- [auth-forgot-password.md](./auth-forgot-password.md)
- [auth-reset-password.md](./auth-reset-password.md)
- [auth-setup-password.md](./auth-setup-password.md)
