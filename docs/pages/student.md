# Student – `/student`

## Route and role

- **Path:** `/student`
- **Role:** linked `studentInfo.status = active` self-service; actor có nhiều workspace vẫn mở `/student` nếu session resolve `access.student.canAccess=true`.
- **Workspace/tenant:** `/student` là student workspace trong app single-tenant; scope khóa theo tài khoản hiện tại và linked `studentInfo`, không theo `tenant_id`/`workspace_id`.
- **Yêu cầu hồ sơ:** cần linked `studentInfo` còn trạng thái **Đang học** (`active`); thiếu hồ sơ học sinh hoặc hồ sơ đã **Nghỉ học** (`inactive`) thì shell không mở.
- **Guest redirect:** guest mở `/student` được proxy đưa về `/auth/login?next=<path+query>` để sau login quay lại đúng student route nếu session có linked `studentInfo`.
- **Workplan owner:** Minh (Frontend – UX + Assistant/Student).

## Features

- **Loading:** `/student/loading.tsx` uses `StudentDashboardSkeleton`; this stays route-specific because `/student` is a single self-service dashboard rather than a broad segment with many child layouts.

- **Sidebar (`StudentSidebar`):** như staff: chuông trong sidebar, **panel/popup thông báo portal** ra `document.body`, mobile full màn hình; realtime toast hiển thị dạng tóm tắt và bấm vào toast mở đúng popup chi tiết thông báo tương ứng.
- **Thông tin cá nhân:** Dùng cùng bố cục với `/admin/students/[id]` (grid profile `xl` + thẻ ví/lịch thi), nhưng chỉ hiển thị hồ sơ của chính học sinh đang đăng nhập và cho phép học sinh tự chỉnh sửa các thông tin cơ bản của mình. Cùng ràng buộc layout để số dư VND dài không tràn card (xem ghi chú trang chi tiết trong `docs/pages/admin.md`).
- **Save/refetch UX:** form tự sửa hồ sơ và popup ví dùng fast-close UX: pass validate là thoát edit mode/đóng popup ngay, hiện `toast.loading`, rồi resolve success/error khi backend xong; lỗi chỉ hiện toast, không tự mở lại form. Khi self detail refetch mà đã có dữ liệu cũ, section giữ nguyên nội dung, dim nhẹ và hiện refresh strip nhỏ.
- **Dữ liệu tài chính theo lớp:** Hiển thị học phí/buổi và gói học phí đang áp dụng cho từng lớp ở chế độ **chỉ xem** để học sinh theo dõi; không có control chỉnh học phí.
- **Ẩn dữ liệu nhạy cảm còn lại:** Không render customer care profit và các control quản trị lớp/hồ sơ.
- **Ví học viên:** Hiển thị số dư hiện tại và popup lịch sử ví authoritative. Học sinh chỉ tự nạp tiền bằng QR SePay; không có flow tự rút tiền hoặc tự điều chỉnh trực tiếp số dư.
- **Nạp tiền qua SePay:** Học sinh mở popup nạp ví → frontend gọi `GET /users/me/student-wallet-sepay-static-qr` → hiển thị **QR tĩnh riêng học sinh** không chứa số tiền. QR dùng VietQR/bank-transfer với nội dung `[SEPAY_TRANSFER_NOTE_PREFIX] UNIST-{uuid} UNICL-{uuid}... LOP <tên lớp...>`; static QR mới không còn marker `NAPVI` để giảm rủi ro ngân hàng cắt mất token học sinh; prefix mặc định rỗng, VietinBank theo hướng dẫn SePay nên set `SEPAY_TRANSFER_NOTE_PREFIX=SEVQR`. Phụ huynh chuyển khoản số tiền cần nạp, webhook SePay parse student id + class ids ở đầu nội dung (vẫn nhận marker `NAPVI`/`NAP VI` cũ) và chỉ cộng ví khi `accountNumber` của giao dịch trùng tài khoản nhận SePay đang cấu hình. Khi hợp lệ, API cộng ví theo `transferAmount` thực nhận, còn hậu tố `LOP` giúp người nhận đọc được các lớp đang học. API ghi ledger completed trong `student_wallet_sepay_orders` bằng `sepay_transaction_id` / `sepay_reference_code` để chống cộng trùng, tạo `wallet_transactions_history`, cập nhật số dư và gửi **email biên lai nạp ví** tới `parent_email` nếu có, đồng thời gửi riêng cho CSKH đang phụ trách nếu có email. Biên lai có dòng nội dung tiếng Việt để phụ huynh/CSKH đọc được học sinh, lớp gia hạn và số tiền. Endpoint tạo order động cũ vẫn tồn tại để tương thích, nhưng UI chính không còn nhập số tiền hoặc tạo order khi mở QR.
- **Lớp học:** Hiển thị danh sách lớp đang liên kết + học phí đang áp dụng + số buổi đã vào học; không có thao tác đổi lớp/gỡ lớp hoặc sửa học phí.
- **Lịch thi:** Reuse card `StudentExamCard` để xem và quản lý lịch thi authoritative theo đúng `studentId` qua popup form; mỗi bản ghi gồm 1 ngày thi và 1 ghi chú ngắn, có thể thêm, sửa hoặc xóa và dữ liệu được lưu ở backend.
- **Data scope:** All data scoped to current student; backend enforces by identity.

## UI-Schema tokens and components

- **Sidebar:** `bg-secondary`, `border-default`; active route `bg-primary` + `text-inverse`. Panel thông báo: `bg-surface`, `border-default`, badge unread `bg-red-600`.
- **Cards (schedule, document, payment row):** `bg-surface`, `text-primary`, `border-default`; hover `bg-secondary` or `bg-elevated`.
- **Tables / lists:** Header `bg-secondary`; row `bg-surface`; `border-default`; row hover `bg-secondary`.
- **Buttons:** Primary = `primary` + `text-inverse`; Secondary = `secondary` + `border-default`.
- **Inputs (profile):** `bg-surface`, `text-primary`, `border-default`; focus `border-focus`.
- **Badges (payment status):** Same status tints as other routes; icon + label.
- **Tags (e.g. document type):** `bg-secondary`, `text-secondary`, `border-subtle`; selected `primary` + `text-inverse`.

## Data and API

- **Backend domain:** `student_info`, `student_classes`, `wallet_transactions_history`, `student_wallet_sepay_orders`.
- **API (real):**
  - `GET /users/me/student-detail`
  - `PATCH /users/me/student`
  - `GET /users/me/student-wallet-history?limit=`
  - `GET /users/me/student-wallet-sepay-static-qr` (SePay QR tĩnh, nội dung `[SEPAY_TRANSFER_NOTE_PREFIX] UNIST-{uuid} UNICL-{uuid}... LOP <tên lớp...>`, không chứa số tiền; response trả thêm `classIds`)
  - `POST /users/me/student-wallet-sepay-topup-order` body `{ amount }` — legacy/dynamic order endpoint còn tồn tại để tương thích, UI chính không gọi.
  - `PATCH /users/me/student-account-balance` body `{ amount }` — legacy endpoint còn tồn tại để tương thích route cũ nhưng backend luôn trả 400 và yêu cầu dùng SePay QR.
  - `POST /webhook/sepay` — SePay gọi khi có giao dịch ngân hàng; API xác thực HMAC `X-SePay-Signature` + `X-SePay-Timestamp` bằng `SEPAY_WEBHOOK_SECRET` trên chuỗi `{timestamp}.{raw_body}` (raw body đúng byte SePay gửi, không serialize lại từ `req.body`), từ chối timestamp quá `SEPAY_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` giây (mặc định `300`), chỉ nhận fallback `X-Secret-Key` khi `SEPAY_WEBHOOK_ALLOW_LEGACY_SECRET_KEY=1`, reconcile theo mã đơn/nội dung CK, khóa QR tĩnh theo `SEPAY_TRANSFER_ACCOUNT_NUMBER`, nhận diện student token trực tiếp, format cũ có marker `NAPVI`/`NAP VI`, và token ngân hàng đã strip dấu như `UNIST<hex>` khi phần prefix khớp duy nhất một học sinh, trả `{ "success": true }` khi nhận hợp lệ.
  - `GET /users/me/student-exam-schedules`
  - `PUT /users/me/student-exam-schedules` body `{ items: [{ id?, examDate, note? }] }`
- **Self-edit scope:** Chỉ cho cập nhật thông tin cơ bản như họ tên, email liên hệ, trường, tỉnh/thành, năm sinh, liên hệ phụ huynh (`parent_name`, `parent_phone`, `parent_email` – email phụ huynh nhận biên lai nạp ví), giới tính, mục tiêu; không cho tự chỉnh học phí, trạng thái hoặc phân lớp.
- **Balance semantics:** self-service chỉ hiển thị QR tĩnh, sau đó webhook mới cộng ví và ghi `wallet_transactions_history`. Học sinh không được gửi `amount` dương hoặc âm qua `PATCH /users/me/student-account-balance` để thay đổi số dư trực tiếp.
- **Frontend data layer:** TanStack Query + `apps/web/lib/apis/auth.api.ts`; DTO student self-service nằm trong `apps/web/dtos/student.dto.ts`.
- **Exam schedule persistence:** Lịch thi ở `/student` lưu authoritative ở backend qua `student_exam_schedules`; admin/student cùng đọc một nguồn dữ liệu và calendar aggregate có thể render `exam` event trực tiếp từ đó.

## Runtime status

- Route `/student` đã có file runtime thật tại `apps/web/app/student/page.tsx`.
- Shell route dùng `apps/web/app/student/layout.tsx` + `StudentAccessGate`; proxy cũng chặn `/student/**` bằng session nhẹ trước khi vào shell.
- `StudentAccessGate` dùng `GET /auth/session` qua `useAuth()` và chỉ mở khi actor có `access.student.canAccess` từ linked `studentInfo.status = active`; không phụ thuộc duy nhất vào `users.role_type`.
- Layout: `StudentSidebar` + vùng main (`#student-main-content`), skip link “Bỏ qua điều hướng”; không còn `Navbar` trong shell học sinh.
- Nội dung trang bám admin student detail nhưng đổi CTA và copy về hướng self-service.

## DoD and week

- **Tuần 5:** Student sees only own data; basic self-profile editing and SePay QR wallet top-up available for own account only; tuition on linked classes is visible in read-only mode; frontend `/student` connected to real API.

## Accessibility

- Tables/lists with clear structure; status and links not by color only.
- Focus and contrast AA per UI-Schema.

## Archived context (for implementation)

See [ARCHIVED-UI-CONTEXT.md](ARCHIVED-UI-CONTEXT.md) for full mapping.

- **Own profile / read-only scope:** `archived/.../pages/StudentDetail.tsx` — when viewer is student and `user.linkId === id`: profile view/edit, no admin actions (canManageStudentRecord false, canTopUp false); accountIconMode `'self'` for login info.
- **Timetable / schedule:** `pages/Schedule.tsx` — weekly calendar, fetchSessions by date range; in 5.0 scope to current student’s classes/sessions only.
- **Payment history (read-only):** Reuse list/table pattern from `pages/Payments.tsx` but no create/update/delete; fetchPayments or equivalent filtered by current student.
- **Documents:** If present in archived (documentsService), reuse for “tài liệu” under student scope.
- **Layout:** Student uses top nav (no sidebar); same Layout pattern as teacher in archived.
