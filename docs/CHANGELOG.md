# Changelog / Lịch sử thay đổi

Mọi thay đổi đáng kể của dự án được ghi lại tại file này.

**Quy ước:** Trước khi commit và push lên git, bắt buộc ghi lại các thay đổi vào file này (theo format bên dưới).

---

## Ghi chú cho Cursor (AI)

**Bạn (Cursor) cần tuân thủ rule sau:** Luôn ghi lại log thay đổi vào file `docs/CHANGELOG.md` trước khi đẩy code lên git (trước khi commit/push). Rule tương ứng nằm tại `.cursor/rules/changelog-before-push.mdc`. Mỗi khi chuẩn bị commit hoặc push, hãy cập nhật phần **[Unreleased]** bên dưới với các mục đã thay đổi, rồi mới thực hiện commit/push.

---

## Format

- Mỗi phiên bản có ngày và các mục: `Added`, `Changed`, `Fixed`, `Removed`, `Security`, v.v.
- Phần **[Unreleased]** dùng cho các thay đổi chưa release; trước khi commit/push thì ghi vào đây, sau đó có thể chuyển thành version có ngày.

---

## [Unreleased]

### Changed

- FE form **Thêm buổi bù** (`MakeupScheduleCard`): bỏ ràng buộc chọn buổi gốc từ card **Cảnh báo chưa dạy**; chỉ còn **Ngày gốc** (DateInput tuỳ chọn). Vẫn hiện textarea giải trình khi ngày gốc + gia sư khớp cảnh báo chưa dạy. BE cho phép lưu `originalDate` không kèm `baselineScheduleEntryId`.
- Auth: tắt đăng ký công khai — `POST /auth/register` trả `403`; `/auth/register` redirect login; Google OAuth không tạo user mới (email chưa có → `/auth/login?error=registration_disabled`); ẩn link Đăng ký trên Navbar/login/verify-email. Admin provisioning (`POST /users`) giữ nguyên.

### Added

- BE/FE giải trình vắng trước lịch bù: bảng `missed_teaching_explanations`, API `POST/PATCH` giải trình (admin + staff-ops mirror), missed-alerts trả `status` + `explanation`, guard tạo makeup có `baselineScheduleEntryId` + `originalDate`; card **Cảnh báo chưa dạy** tách **Lưu giải trình** và **Xếp lịch bù**, giữ layout textarea + lưu ở cột phải trước/sau khi lưu; `/admin/staffs/[id]` hỗ trợ thao tác đầy đủ tại chỗ.
- FE popup **Thêm buổi bù** (`MakeupScheduleCard`): khi chọn buổi gốc thuộc cảnh báo chưa dạy, hiện textarea **Lý do giải trình** bắt buộc; submit lưu giải trình rồi tạo buổi bù trong một flow, không bắt user quay sang card **Cảnh báo chưa dạy** (admin + staff class detail). Dropdown **Buổi học gốc** chỉ liệt kê các buổi từ card **Cảnh báo chưa dạy**, không còn sinh toàn bộ occurrence từ `Class.schedule`.
- FE popup **Thanh toán** trên `/admin/staffs/[id]` và mirror `/staff/staffs/[id]`: mỗi card role mặc định **thu gọn** (accordion); bấm header role để mở rộng và xem toàn bộ khoản/source bên trong.
- BE/FE assistant detail tab **Hoa hồng**: thêm module `assistant-commission` với `GET /assistant-commission/staff/:assistantStaffId/managed-customer-care`, `GET .../managed-customer-care/:customerCareStaffId/students`, `GET .../students/:studentId/session-shares`, và `PATCH .../payment-status/bulk`; FE `/admin/assistant_detail?staffId=...` và `/staff/assistant-detail` có tab **Trợ cấp** / **Hoa hồng** hiển thị CSKH được quản lý → học sinh → buổi học (phần chia 3% học phí), filter mặc định **Chưa thanh toán** hoặc **Theo tháng**, và cho phép admin/assistant/kế toán chọn từng buổi để đổi `assistant_payment_status` `pending`/`paid`.
- BE/FE thanh toán nhân sự theo khoản chọn: thêm `PATCH /staff/:id/payment-status/pay-selected` với body `{ month, year, items: [{ sourceType, id }] }`; popup **Thanh toán** trên `/admin/staffs/[id]` và mirror `/staff/staffs/[id]` có checkbox chọn từng khoản (gồm hoa hồng CSKH), nút **Thanh toán N khoản đã chọn**, và giữ shortcut **Thanh toán tất cả** qua `pay-all`.
- BE/FE customer-care detail: thêm `PATCH /customer-care/staff/:staffId/payment-status/bulk` với body `{ attendanceIds, paymentStatus }`; tab **Hoa hồng** trên `/admin/customer_care_detail/[staffId]` và mirror `/staff/customer-care-detail/[staffId]` cho phép admin/assistant/kế toán chọn từng buổi hoa hồng và đổi trạng thái `pending`/`paid` (khi paid snapshot % thuế CSKH hiện hành; khi pending reset về 0). Response `session-commissions` bổ sung `attendanceId`.

### Changed

- BE/FE dual-role `assistant` + `customer_care`: cấm `customer_care_managed_by_staff_id` trỏ về chính mình; dual-role ẩn field **Trợ lí quản lí** và backend normalize FK → `null` khi lưu; runtime/payroll loại trừ trợ cấp 3% khi `assistant_manager_staff_id = customer_care_staff_id`; session mới ghi `assistant_manager_staff_id = null` nếu resolve self-managed; dashboard trợ lí tách **CSKH của tôi** và **CSKH tôi quản lí**; helper copy dưới dòng **Trợ lí** trong **Công việc khác** khi dual-role.
- BE cảnh báo chưa dạy / lịch bù: `GET /sessions/class/:classId/missed-teaching-alerts` và `GET /sessions/staff/:staffId/missed-teaching-alerts` (cùng mirror staff-ops) chỉ trả các cảnh báo có `originalDate >= 2026-06-01`; card **Cảnh báo chưa dạy** trên trang chi tiết lớp/nhân sự tự ẩn khi không còn dòng hợp lệ.
- BE/FE customer-care tab **Hoa hồng**: bỏ giới hạn 30 ngày mặc định; thêm filter `scope=pending|month&month=YYYY-MM` cho `GET /customer-care/staff/:staffId/commissions` và `GET .../session-commissions`, trả thêm `pendingCommission`/`paidCommission`; FE `CustomerCareDetailPanels` đồng bộ UX với tab hoa hồng trợ lí (toggle **Chưa thanh toán** / **Theo tháng**, `MonthInput`, cột `Chưa thanh toán` + `Tổng hoa hồng`). Filter theo tháng hiển thị toàn bộ khoản trong tháng (cả đã thanh toán lẫn chưa thanh toán).
- FE month UX: `MonthInput` reuse `MonthNav` (nút tháng trước/sau + popup chọn tháng/năm giống trang chi tiết staff), `MonthNav` popup dùng nhãn `Tháng 1` thay `Jan/Feb`, và helper `apps/web/lib/month-format.ts` chuẩn hoá hiển thị `Tháng X/YYYY` trên dashboard, extra allowance, lesson work, hoa hồng CSKH/trợ lí.
- FE tab **Công việc** (`/admin/lesson-plans`, mirror `/staff/lesson-plans`): chip trạng thái thanh toán ở cột **Trạng thái** hiển thị thêm **người nhận** (`staffDisplayName`) bên trong pill, cùng số tiền khi `pending`.

- FE customer-care detail tab **Hoa hồng**: cho phép mở rộng đồng thời nhiều học sinh (accordion độc lập, mỗi học sinh fetch `session-commissions` riêng qua TanStack `useQueries`); chọn khoản và đổi trạng thái thanh toán vẫn hoạt động xuyên suốt các học sinh đang mở.

### Fixed

- BE cảnh báo chưa dạy: sửa so khớp `session.startTime` (`@db.Time`) dùng wall-clock từ ISO/UTC thay vì `getHours()` local — tránh false positive khi server TZ `Asia/Ho_Chi_Minh` khiến buổi đã ghi (ví dụ `01/06/2026 09:00`) vẫn hiện trong card **Cảnh báo chưa dạy**.
- FE `/admin/notification`: dedupe nhãn người nhận và dùng key theo index để tránh cảnh báo React duplicate key khi cùng một role (ví dụ `@admin`) xuất hiện ở cả `targetRoleTypes` và `targetStaffRoles`.
- FE phân quyền `accountant_expense`: mở các trang chi tiết role của nhân sự khác trên staff shell (`/staff/customer-care-detail/[staffId]`, `/staff/lesson-plan-detail/[staffId]`, `/staff/*-detail?staffId=...`) và render admin-like detail thay vì self-service khi có `staffId`.
- FE trang chi tiết học sinh/nhân sự: gỡ nút header **Nghỉ học / Mở lại** và **Ngừng hoạt động / Mở lại**; đổi trạng thái chỉ qua popup chỉnh sửa (confirm khi inactive, field lý do tùy chọn, invalidate query lớp khi đổi status học sinh). Nút **Nghỉ học** trên trang chi tiết lớp vẫn giữ nguyên.


- BE/FE staff pay-all & Công việc khác: `payment-preview` và `pay-all` giờ lấy **mọi khoản pending/unpaid mọi role và mọi tháng** (trừ cọc), không còn giới hạn tháng query cho thưởng/trợ cấp/CSKH/giáo án/trợ lí; card **Công việc khác** dùng hybrid — **Tổng nhận/Đã nhận** theo tháng MonthNav, **Chưa nhận** full-scope theo role (net, thuế hiện hành). Cập nhật copy popup, helper card, Swagger và docs admin/staff.
- FE/BE key collision & pagination sorting: Sửa lỗi trùng lặp React element keys (`UNIST-...` student IDs) trong các danh sách hiển thị phiên bản mobile và desktop tại trang Danh sách học sinh Admin, Chi tiết lớp học Admin/Staff, và màn hình Chăm sóc khách hàng (CSKH) bằng cách thêm tiền tố unique (`mobile-` và `desktop-`), đồng thời bổ sung tie-breaker `student.id ASC` vào `orderBy` của các câu truy vấn phân trang phía backend để đảm bảo thứ tự sắp xếp deterministic và không bị lặp bản ghi học sinh giữa các trang.
- FE popup nạp ví SePay (`StudentBalancePopup` trên `/student` và chi tiết học sinh admin/staff): đổi từ sao chép nội dung chuyển khoản sang **Sao chép QR** (ảnh/link), gỡ khối hiển thị `transferNote`; tái sử dụng `copyStudentWalletQrWithToast` trong `apps/web/lib/clipboard-qr.ts`.
- BE test: Sửa các unit test lỗi liên quan đến việc giữ lại lịch sử khung giờ (ClassService, StaffService) và name ordering discrepancy trong DeductionSettingsService test, đồng thời cập nhật test rbac-mutation-metadata để tương thích với các decorator RBAC mới.
- FE typecheck: Sửa lỗi kiểu dữ liệu ClassScheduleItem trên frontend (bổ sung thuộc tính optional `createdAt` và `deletedAt`) và ép kiểu result trong EditClassSchedulePopup để pass check tsc.

### Changed

- BE/FE class schedule history & makeup validation: Lưu vết lịch sử thay đổi lịch cố định của lớp học dưới dạng snapshot (thêm trường `createdAt` và `deletedAt` trong JSON `Class.schedule`). Cảnh báo chưa dạy (missed teaching alerts) và các hiển thị calendar tuần chỉ đối chiếu với các slot lịch cố định còn hoạt động tại thời điểm tương ứng trong quá khứ. Đồng thời, bổ sung ràng buộc kiểm tra lịch bù (cả cảnh báo và tạo thủ công) phải có ngày học lớn hơn hoặc bằng ngày tạo lớp học (`Class.createdAt`).

- BE/FE biên lai nạp ví SePay: thêm `student_info.parent_receipt_email_enabled` (mặc định bật); khi tắt, webhook vẫn cộng ví nhưng không gửi email biên lai cho phụ huynh lẫn CSKH. Switch trên `/student` và trang chi tiết học sinh admin/staff. Biên lai email/PDF bỏ trường “Người thanh toán”.

### Added

- FE copy QR: Tự động dùng Canvas để vẽ thêm thông tin học sinh (Tên, Mã học sinh, các Lớp học đang hoạt động) ở phần chân ảnh (footer) của VietQR khi copy vào clipboard từ trang quản lý học sinh admin, ví học sinh, và màn hình chăm sóc khách hàng.
- FE/BE class session permissions: Bổ sung quyền điều chỉnh trường hệ số (multiplier/coefficient) và trạng thái thanh toán (payment status) cho quản lý (Admin/Trợ lý) cùng cả 2 vai trò kế toán (Kế toán thu `accountant_income` và Kế toán chi `accountant_expense`) trong các API `PUT /sessions/:id` và `PATCH /sessions/payment-status/bulk` cũng như UI quản lý buổi học tại trang chi tiết lớp học và chi tiết nhân sự.

- FE/BE session payment status: Bổ sung lại field điều chỉnh trạng thái thanh toán của buổi học (`teacherPaymentStatus`) trong form tạo buổi học (`AddSessionPopup`) cho admin/kế toán và form chỉnh sửa buổi học (`SessionHistoryTable`) cho nhân sự có quyền (admin, trợ lý, kế toán chi), đồng thời khóa tất cả các trường thông tin cơ bản khác (ngày, giờ, gia sư, nhận xét, điểm danh) khi ở chế độ xem chi tiết/kế toán chi để bảo vệ tính toàn vẹn của dữ liệu buổi học.
- BE/FE Đào Tạo role: thêm `StaffRole.training` / nhãn **Đào Tạo**, mở `/staff/calendar` cho lịch toàn bộ lớp đang chạy với redaction học sinh, random-check lớp đang diễn ra có Meet, dashboard Đào Tạo và docs route/schema tương ứng.

- BE/API `regulations`: thêm hard-delete `DELETE /regulations/:id` cho admin và `staff.assistant`, có ghi `action_history`; FE `/admin/notes-subject` và assistant `/staff/notes-subject` có nút xóa quy định kèm xác nhận.

- BE/FE RBAC kế toán: tách role kế toán legacy thành `accountant_income` (kế toán thu) và `accountant_expense` (kế toán chi). Dữ liệu legacy `accountant` được migration sang `accountant_income`; kế toán thu chỉ xem/chỉnh dữ liệu học phí theo lớp ở trang học sinh và xem dashboard thu, còn kế toán chi xử lý nhân sự/thanh toán/chi phí/trợ cấp/lương gia sư/giáo án payment status. Thêm redaction tài chính lớp/buổi học theo role và docs quyền mới.

- BE/FE class compensation: `accountant_expense` được chỉnh thêm `% vận hành` của gia sư theo lớp trong popup trợ cấp gia sư và cột **KH vận hành (%)** ở chi tiết nhân sự; backend lưu nguồn duy nhất tại `class_teachers.tax_rate_percent` (Prisma `operatingDeductionRatePercent`).

- **BREAKING – Short System Entity IDs (Lesson entities):** PK của `lesson_task`, `lesson_resources`, `lesson_outputs`, `staff_lesson_task` chuyển sang mã định danh hệ thống ngắn: `UNILTK-[0-9a-f]{10}`, `UNILRS-[0-9a-f]{10}`, `UNILOT-[0-9a-f]{10}`, `UNISLT-[0-9a-f]{10}`. Existing rows nhận ID mới sinh bằng `pgcrypto.gen_random_bytes(5)`, không cắt từ UUID cũ; old API links không redirect. Migration SQL: `20260524110000_lesson_short_system_entity_ids`. Docs: `docs/Database Schema.md` updated with PK format notes and summary table for all lesson entity IDs.

- **BREAKING – Short System Entity IDs:** PK của `student_info`, `staff_info`, `classes` chuyển sang mã định danh hệ thống ngắn: `UNIST-[0-9a-f]{10}`, `UNISTAFF-[0-9a-f]{10}`, `UNICL-[0-9a-f]{10}`. Existing rows nhận ID mới sinh bằng `pgcrypto.gen_random_bytes(5)`, không cắt từ UUID cũ; old API links không redirect. Migration SQL: `20260523110000_short_system_entity_ids`. Sau deploy: tái phát hành QR tĩnh học sinh và resync/update Google Calendar metadata theo runbook, không delete/recreate calendar events mặc định.

- FE loading state: Thêm các tệp loading suspense boundaries (`loading.tsx`) tại `/admin`, `/staff`, và `/student` hiển thị khung skeleton SaaS cao cấp phẳng siêu mượt khi bấm chuyển trang tức thì.

### Changed

- FE `/admin/notes-subject`: form chỉnh sửa quy định hiển thị ngay bên dưới item đang chọn thay vì ở cuối danh sách.

- FE thanh toán nhân sự: đổi nhãn cột/tổng “Sau thuế” thành “Sau cuối” và cho các dòng lớp trong payment preview bấm chuyển sang chi tiết lớp.

- SePay static QR nạp ví: nội dung QR tĩnh mới chỉ còn `[SEPAY_TRANSFER_NOTE_PREFIX] UNIST-[0-9a-f]{10}` để đồng bộ list/detail học sinh và tránh memo dài; webhook vẫn tương thích QR cũ có `NAPVI`/`NAP VI`, `UNICL-*`, `LOP ...`, đồng thời nhận token đã bị ngân hàng strip dấu như `UNIST<10hex>`/`UNICL<10hex>` khi tài khoản nhận đúng `SEPAY_TRANSFER_ACCOUNT_NUMBER`. Biên lai nạp ví hiển thị nội dung `Học sinh <id học sinh> gia hạn học phí các gói <tên lớp active...>`.

- Staff CCCD profile: bỏ flow upload ảnh CCCD ở admin/self-service, thay bằng field nhập tay `ethnicity`, `gender`, `current_address`; staff workspace gate kiểm tra các field này thay vì ảnh 2 mặt. Prisma migration `20260522100000_replace_staff_cccd_images_with_identity_fields` drop các cột path ảnh CCCD legacy.

- FE `LessonTaskDetailPage` (/admin/lesson-plans/tasks/[taskId] & /staff/lesson-plans/tasks/[taskId]): Đơn giản hoá, thiết kế lại trang chi tiết công việc giáo án theo bố cục 2 cột (Main content + Sidebar) cao cấp và responsive trên desktop. Gộp mô tả thừa, thu gọn danh sách nhân sự thực hiện (avatar tròn nhỏ) và tài nguyên liên quan (DB search mở rộng dạng inline) giúp trang gọn gàng, tăng diện tích thao tác và đạt 0 lỗi/cảnh báo tsc/eslint.

- FE sidebars: Tối ưu hóa tương tác chuyển trang Sidebar (`AdminSidebar.tsx`, `StaffSidebar.tsx`, `StudentSidebar.tsx`) tức thì (<16ms) thông qua trạng thái cục bộ `activeHrefState` và trì hoãn điều hướng thực tế bất đồng bộ `await Promise.resolve()`. Áp dụng pattern **điều chỉnh state tại thời điểm render** (Render-time State Adjustment) thay cho `useEffect` để loại bỏ render trùng lặp và vượt qua kiểm tra tĩnh ESLint `react-hooks/set-state-in-effect` sạch sẽ.

- Auth password flows: forgot/reset/setup pages now show full Unicorns Edu logo lockup; reset-password email uses React Email branded template with CTA/fallback link; reset tokens are bound to the current password hash so old links are invalid after a password change.

- FE nhãn `parent_email`: đổi **Email nhận biên nhận** → **Email phụ huynh** trên `/admin/students/[id]` (cả `/staff/students/[id]`), popup thêm/sửa học sinh, `/student` self-service và `/user-profile`.

- FE `AdminSidebar`: sắp xếp lại menu — Dashboard → Thông báo → User → Nhân sự → Lớp học → Học sinh → Chi phí → Giáo Án → Lịch → (Khấu trừ, Ghi chú môn học, Duyệt nạp ví, Lịch sử).

- BE mail: email xác thực tài khoản (`sendVerificationEmail`) chuyển sang React Email template `email-verification.email.tsx` (header thương hiệu, CTA, fallback link, ghi chú hết hạn 24 giờ); subject `[Unicorns Edu] Xác thực email tài khoản`. Docs: `docs/pages/auth.md`.

- FE `TutorCard` (`/admin/classes/[id]`, `/staff/classes/[id]` qua admin-like detail): **Trợ cấp** + **Vận hành** chỉ hiển thị với `admin`, `assistant`, `accountant`; các role khác giữ layout gia sư như trước (tên + trạng thái).

- FE `/admin/classes/[id]`: nút thêm buổi học chỉ hiện với admin (khớp `POST /sessions`); validate lớp phải có gia sư phụ trách và học sinh `active` trước khi mở popup; sau tạo buổi invalidate lịch sử tháng hiện tại. `AddSessionPopup` gợi ý dropdown gia sư chỉ lấy từ roster lớp.

- FE `SessionHistoryTable` `variant="classDetail"`: layout dòng buổi học 3 cột (thời gian | nhận xét | thông tin + xóa) dùng chung cho `/admin/classes/[id]`, `/admin/staffs/[id]`, `/staff/profile`, `/staff/classes/[id]`; `entityMode="class"` hiển thị tên lớp ở cột phải thay vì gia sư.
- FE `SessionHistoryTable` `variant="classDetail"`: phần **Thông tin** trên trang lớp luôn hiển thị gia sư của từng buổi học, kể cả khi layout cha đang ẩn cột thực thể riêng.
- FE `SessionHistoryTable`: đổi trạng thái thanh toán buổi học không gửi lại `attendance` nếu người dùng không sửa điểm danh; payload điểm danh khi sửa chỉ gồm học sinh thuộc roster hiện tại để giữ lịch sử cũ không làm lỗi chuyển `deposit` → `paid`.

### Added

- BE/FE profile status workflow: thêm endpoint `PATCH /student/:id/status` và `PATCH /staff/:id/status`; học sinh `inactive` hiển thị **Nghỉ học** và tự đóng roster lớp đang active, nhân sự `inactive` hiển thị **Ngừng hoạt động** và bị chặn khỏi staff/admin-through-staff workspace cũng như phân công mới. Danh sách `/admin/students` và `/admin/staffs` có filter trạng thái server-side.
- FE `/staff/customer-care-detail` và `/admin/customer_care_detail/[staffId]`: tab **Học sinh** hiển thị tổng số, dùng infinite scroll tải 10 học sinh/lần, có nút icon QR copy nhanh, cột **Tiền vào** 21 ngày gần nhất; bấm vào con số **Tiền vào** mở popup **Lịch sử tiền vào** chỉ hiển thị giao dịch `topup`. Thêm tab **Thanh Toán** dùng `GET /customer-care/staff/:staffId/topup-history?page=&limit=` để đối soát lịch sử nạp tiền chung của học sinh thuộc CSKH đó, infinite scroll 20 khoản/lần.
- FE `/admin/students`: mỗi dòng học sinh có nút icon QR copy nhanh và cột **Tiền vào** cạnh **Số dư**.
- BE/FE yêu cầu **Nạp thẳng** ví học sinh cho CSKH/kế toán/trợ lí: staff nhập số tiền + lý do, backend gửi React Email tới `ADMIN_EMAIL`; token duyệt lưu hash, hết hạn sau 14 ngày, public page `/wallet-direct-topup-approval` chỉ cộng ví sau khi admin bấm xác nhận. Thiếu `ADMIN_EMAIL`, dùng placeholder như `admin@example.com`, production `FRONTEND_URL` không phải public HTTPS, hoặc lỗi SMTP thì không giữ request pending; lỗi gửi email duyệt có warning log theo `requestId`, `studentId`, domain admin email và error summary.
- FE/BE `/admin/wallet-direct-topup-requests`: thêm hàng chờ admin-only để xem `pending/approved/expired/all` yêu cầu **Nạp thẳng** và duyệt trực tiếp trong admin shell; mobile render request dạng card, desktop dùng bảng. Endpoint queue dùng cùng transaction cộng ví với link email, idempotent và chỉ tạo wallet transaction một lần. Khi CSKH/kế toán/trợ lí gửi yêu cầu, backend phát thêm notification published tới admin. Admin click toast/tray notification nạp thẳng sẽ mở popup duyệt trực tiếp theo request id.
- API production entrypoint: `postbuild` tạo `dist/main.js` tương thích với host/PM2 chạy `node dist/main`; `prod` script và Docker CMD dùng entrypoint này.
- Docs + mẫu Nginx native: [`nginx/dev-local-8080.example.conf`](../nginx/dev-local-8080.example.conf) và mục **Nginx reverse proxy local** trong [`docs/Cách làm việc.md`](./Cách%20làm%20việc.md) (cùng origin `http://localhost:8080`, BE `/api/`, biến env `FRONTEND_URL` / `NEXT_PUBLIC_BACKEND_URL` / OAuth callback).
- BE `POST /users/me/student-wallet-sepay-topup-order`: tạo yêu cầu nạp ví SePay kèm QR; `StudentService.getTuitionExtensionTransferNoteForSelf`; module `sepay/`. FE `/student`: nạp ví luôn tạo QR SePay, không còn cờ `NEXT_PUBLIC_STUDENT_WALLET_SEPAY_TOPUP`. Docs: `docs/pages/auth.md`, `docs/pages/student.md`, `docs/Cách làm việc.md`, `apps/api/.env.example`, `apps/web/.env.example`.
- BE mail: thêm biên nhận nạp ví SePay gửi tới email phụ huynh, nội dung text/html an toàn và giữ mapping lỗi SMTP `503`.
- FE admin student forms: thêm field email phụ huynh nhận biên nhận (`parent_email`) khi tạo/sửa học sinh.
- **Parent email self-service & hiển thị toàn hệ thống:** Thêm `parent_email` vào `UpdateMyStudentProfileDto` (backend `apps/api/src/dtos/profile.dto.ts` + `UserService.updateMyStudentProfile`) để học sinh tự cập nhật email phụ huynh qua `PATCH /users/me/student` (truyền `null`/chuỗi rỗng để xoá). FE: `ProfileStudentInfoDto`/`UpdateMyStudentProfileDto` (`apps/web/dtos/profile.dto.ts`) bổ sung `parentEmail`/`parent_email`; `/admin/students/[id]` (cũng dùng cho `/staff/students/[id]`) hiển thị dòng **Email nhận biên nhận** trong thẻ "Liên hệ phụ huynh"; `/student` self-service thêm input + dòng đọc cho email phụ huynh và tính `isStudentProfileDirty` theo field mới; `/user-profile` section Học viên thêm `TextField`/`DetailRows` `parent_email` và đưa field vào `studentCompletion`/`allProfileValues`. Docs: `docs/pages/auth.md`, `docs/pages/student.md`.

### Fixed

- FE tạo buổi học (`AddSessionPopup`): gỡ giới hạn 2000 ký tự cho nhận xét buổi học, vẫn giữ bắt buộc nhập nhận xét và giới hạn ghi chú điểm danh.

- BE/FE tạo lớp: `POST /class` trả detail đầy đủ gồm học sinh vừa gán để trang `/admin/classes/:id` hiển thị danh sách học sinh ngay sau redirect, không cần reload.

- BE SePay QR tĩnh nạp ví học sinh: nội dung chuyển khoản mới chỉ giữ prefix cấu hình + `<student_info.id>`; webhook vẫn reconcile được QR cũ có class id/hậu tố lớp.

- FE `/admin/students`: nút QR copy nhanh trên danh sách học sinh dùng nguyên QR URL backend trả về để đồng bộ với QR trong trang chi tiết học sinh.

- BE `GET /staff/:id/income-summary` — `classMonthlySummaries` (card **Lớp phụ trách**) trả `total` / `paid` / `unpaid` đều là gross allowance trước CPVH và trước thuế; tổng hợp thu nhập chung vẫn giữ net theo contract hiện tại. Docs: `docs/README.md`, `docs/pages/staff.md`; DTO comment `StaffIncomeClassSummary`.

- BE Google Meet link cố định cho staff: sau khi admin OAuth tạo Meet setup event, backend gọi Google Meet API `v2/spaces` để set `config.accessType=OPEN` cho link mới, rồi gọi `v2beta/spaces/{space}/members` để cấp role `COHOST` cho email staff; bỏ field `role: "CO_HOST"` khỏi Calendar attendees vì Calendar API không hỗ trợ field này. Nếu set `OPEN` hoặc cấp `COHOST` lỗi, link vẫn được lưu vào `staff_info.google_meet_link`; regenerate/auto-create backfill link vào `Class.schedule` và `makeup_schedule_events` do staff phụ trách, còn calendar feed ưu tiên link cố định của staff thay vì link cũ theo từng buổi. Docs/env cập nhật scope `meetings.space.settings`.

- CD deploy (`scripts/gha-deploy-remote.sh`): `wait_for_http` không còn bắt buộc mọi container có `node`; API/web vẫn dùng `node`, còn nginx image `nginx:1.27-alpine` dùng fallback `wget`/`curl`, tránh lỗi `exec: "node": executable file not found in $PATH` làm job timeout sau khi nginx đã start.
- CD deploy (`scripts/gha-deploy-remote.sh`): **deploy dừng âm thầm sau migration** — script được nạp qua `cat script | ssh ... bash -s` (đường Tailscale) nên `bash` đọc script từ stdin; `docker compose run` (migration) ở chế độ interactive nuốt hết phần stdin còn lại làm `bash` hết input và kết thúc ngay sau `prisma migrate deploy`, `api`/`web`/`nginx` không bao giờ được recreate → vẫn chạy image cũ. Fix: thêm `-T` + `</dev/null` cho lệnh `compose run` migration và `</dev/null` cho các lệnh `compose exec` (`wait_for_http`, `nginx -t`, `nginx -s reload`).
- CD deploy (`scripts/gha-deploy-remote.sh`): bỏ cờ `-a` ở các bước prune (`docker system prune -af` → `docker container/image/builder prune -f`) để prune không xoá nhầm image `:latest` vừa pull nhưng chưa có container; thêm `--no-deps` cho mọi lệnh `compose up` (đặc biệt `nginx`) để không force-recreate lại `api`/`web` đã chạy; nâng timeout `wait_for_http` lên `90 × 5s` (~7.5 phút/service, override qua `WAIT_HTTP_RETRIES`) để VPS thiếu disk boot chậm không bị abort giữa chừng làm `web`/`nginx` kẹt ở image cũ; `command_timeout` deploy SSH 30m → 45m. Docs: `docs/Cách làm việc.md`.

### Changed

- FE card **Lịch dạy bù** (`/admin/classes/[id]`, `/staff/classes/[id]`): danh sách chỉ tải buổi có `date >= hôm nay` (ẩn buổi đã qua); tổng và phân trang khớp filter. Docs: `docs/pages/admin.md`, `docs/pages/staff.md`.
- CI Docker deploy: build API/Web chuyển sang runner ARM64 native `ubuntu-24.04-arm` với `platforms: linux/arm64` và Dockerfile dùng BuildKit cache mount cho pnpm store, tránh `pnpm install --frozen-lockfile` trên ARM64 qua QEMU chạy quá lâu nhưng vẫn có manifest đúng cho VPS ARM64.
- SePay QR tĩnh nạp ví học sinh đổi nội dung chuyển khoản sang `NAPVI <student_info.id> <active_class_id...> LOP <tên lớp...>`; webhook gửi biên lai riêng cho phụ huynh và CSKH, kèm dòng nội dung tiếng Việt trong email để nhận diện học sinh/lớp/số tiền.
- BE `GET /student` và `GET /customer-care/staff/:staffId/students`: trả thêm tổng `topup` 21 ngày gần nhất và cờ đạt ngưỡng `300.000` VND; endpoint CSKH đổi sang response phân trang `{ data, meta }`.
- BE `GET /student/:id/wallet-history`: mở quyền cho `staff.customer_care` xem lịch sử ví của học sinh được phân công, dùng cùng assignment check với chi tiết học sinh.
- SePay nạp ví học sinh: UI `/student` và popup ví admin/staff chuyển từ nhập số tiền + tạo order sang QR tĩnh theo học sinh (`GET /users/me/student-wallet-sepay-static-qr`, `GET /student/:id/wallet-sepay-static-qr`) với nội dung `NAPVI <student_info.id> <active_class_id...> LOP <tên lớp...>`; webhook cộng ví theo số tiền thực nhận và tạo ledger completed để chống cộng trùng. Docs: `docs/pages/auth.md`, `docs/pages/student.md`, `docs/pages/admin.md`, `docs/pages/staff.md`, `docs/pages/README.md`, `docs/Cách làm việc.md`.
- Deploy/Nginx: production chuyển sang Cloudflare Tunnel; NGINX chỉ bind `127.0.0.1:80`, bỏ vhost HTTPS/certbot/domain cũ, preserve `X-Forwarded-Proto`, deploy smoke test qua loopback local thay vì `VPS_PUBLIC_HOST`. Docs `docs/Cách làm việc.md`.
- CI: job **`mirror-nginx`** copy manifest `docker.io/library/nginx:1.27-alpine` → **`ghcr.io/unicorns-prj-dev/nginx:1.27-alpine`** (`buildx imagetools create`); `docker-compose.prod.yml` trỏ `nginx` sang GHCR; `deploy` chờ `mirror-nginx`. VPS không còn phụ thuộc pull trực tiếp Docker Hub cho nginx. Docs `docs/Cách làm việc.md`.
- Deploy VPS script [`scripts/gha-deploy-remote.sh`](../scripts/gha-deploy-remote.sh): **retry** `docker compose pull` (mặc định 5 lần, backoff) cho lỗi mạng/ghcr tạm thời. Docs `docs/Cách làm việc.md`.
- CI build/push Docker: thêm **multi-arch** `linux/amd64,linux/arm64` (`docker/setup-qemu-action` + `platforms` trên `docker/build-push-action`) để VPS **ARM64** kéo được image từ GHCR (tránh `no matching manifest for linux/arm64`). Lần build đầu có thể chậm hơn do QEMU. Docs `docs/Cách làm việc.md`.
- CI deploy Tailscale: input `ping` mặc định **`vars.VPS_TAILSCALE_PING || secrets.VPS_HOST`** để đợi tailnet propagate trước SSH (giảm `ssh: handshake failed: EOF`). Docs `docs/Cách làm việc.md`.
- `docs/Cách làm việc.md`: Tailscale SSH — `action: check` **không** cho `src` là **tag**; rule từ `tag:cicd` dùng **`action: accept`**; numbering troubleshooting ACL.
- CI deploy: khi `TAILSCALE_ENABLED=true`, SSH deploy qua **`ProxyCommand` + `tailscale nc`** (userspace tailnet); script tách [`scripts/gha-deploy-remote.sh`](../scripts/gha-deploy-remote.sh); job `deploy` thêm checkout shallow; không Tailscale vẫn `appleboy/ssh-action` + `script_path`. Docs `docs/Cách làm việc.md`.
- CI deploy Tailscale: mặc định `tags` từ `tag:ci` → **`tag:cicd`** (khớp OAuth client / ACL tailnet); vẫn override được bằng variable `TAILSCALE_TAGS`. Docs `docs/Cách làm việc.md`.
- `docs/Cách làm việc.md`: mục Tailscale bổ sung hướng dẫn **Custom scopes** (Keys/Devices, không bật General) khi tạo OAuth credential cho GitHub Actions.
- FE `/staff/profile`: bỏ nút bút chì chỉnh sửa thông tin nhân sự ở header; `StaffSelfEditPopup` vẫn mở qua chỉnh sửa QR trong mục Hồ sơ nhân sự; toast `profile_required=1` cập nhật copy tương ứng. Docs: `docs/pages/staff.md`, `docs/README.md`, `docs/CHANGELOG.md`.
- FE `/user-profile`: khối **Nhân sự** lại **chỉnh sửa được** (form `updateMyStaffProfile`, upload CCCD). Proxy staff: hồ sơ chưa đủ → redirect `/user-profile?profile_required=1&from=...`. Bỏ toast `profile_required` riêng trên `/staff/profile`. Docs: `docs/README.md`, `docs/pages/auth.md`, `docs/pages/staff.md`.
- FE `/staff/staffs/[id]` khi mở **đúng hồ sơ nhân sự của chính user** (sidebar **Cá nhân**): ẩn chỉnh sửa kiểu admin (**Chỉnh sửa thông tin nhân sự**, popup `EditStaffPopup`, chỉnh QR thanh toán); tự cập nhật hồ sơ qua `/staff/profile`. Docs: `docs/pages/staff.md`.
- FE `/user-profile` — khối **Nhân sự**: thêm field **Minh chứng thành tích** (`personal_achievement_link`, `PATCH /users/me/staff`), đồng bộ với popup self-edit `/staff/profile`. Docs: `docs/pages/auth.md`, `docs/README.md`.
- **Email/PDF biên lai (`TuitionReceiptEmail`):** Hai logo căn giữa bằng bảng presentation (tránh client chia `Row`/`Column` đẩy logo ra hai mép); chú thích “Đối chiếu sao kê…” góc trái dưới và con dấu (ảnh CID) góc phải dưới cùng một hàng; viền khối biên lai mỏng `1px` khớp mẫu in.
- **Email biên lai nạp ví (phụ huynh, sau webhook SePay):** HTML render bằng **React Email** (`TuitionReceiptEmail`), logo/con dấu qua `ReceiptAssetsService` (`src/mail/assets/*_sm.png`). Đính kèm **PDF** cùng HTML khi `ReceiptPdfService` (Puppeteer + `CHROMIUM_PATH`) sinh PDF thành công; image Docker API cài Chromium và `CHROMIUM_PATH=/usr/bin/chromium`. Tuỳ chọn `RECEIPT_*` ghi đè tiêu đề/người nhận/STK; `sendReceiptAfterCommit` vẫn truyền `parentName`, `transferNote`, `balanceAfter`; lỗi SMTP không fail webhook. Docs: `apps/api/.env.example`, `docs/Cách làm việc.md`, `docs/pages/auth.md`, `docs/pages/student.md`.
- FE/BE auth gates: đồng bộ admin shell access để `staff.admin` được xem là admin đầy đủ, admin không bị khóa bởi email verification, và login/proxy/client gate dùng cùng policy route admin shell. Docs: `docs/pages/admin.md`, `docs/pages/auth.md`, `docs/pages/auth-login.md`, `docs/README.md`.
- FE `/user-profile`: bộ đếm section `Nhân sự` chỉ tính 12 field staff người dùng tự hoàn thiện, không tính `status`/`roles`; `personal_achievement_link` tiếp tục là tùy chọn và không kích hoạt redirect hoàn thiện hồ sơ. Docs: `docs/pages/auth.md`, `docs/pages/staff.md`, `docs/README.md`.
- FE `StudentBalancePopup`: chế độ **Nạp tiền** dùng số dương; QR SePay là mặc định, admin mới có tab **Nạp thẳng** và phải nhập lý do khi chỉnh số dư trực tiếp. `/student` chỉ còn QR SePay, không còn nhập số âm/rút self-service. Docs: `docs/pages/student.md`, `docs/pages/admin.md`, `docs/README.md`, `docs/pages/auth.md`.
- FE `/user-profile`: tắt `forceEmailUnverifiedForTest` mặc định để hiển thị đúng `emailVerified` từ API; nhãn chữ **Đã xác minh** / **Chưa xác minh**; gửi lại link qua `POST /auth/resend-verification` thay vì mock; email học viên khác email tài khoản hiển thị ghi chú không áp dụng xác minh đăng nhập. Docs: `docs/pages/auth.md`.
- FE SePay top-up UX/docs: chặn tạo QR khi số tiền dương dưới `1.000` VND, cập nhật copy sang webhook tự động cộng ví sau xác nhận ngân hàng, và ghi rõ backend chặn self-service nạp dương qua `PATCH` khi API đã cấu hình SePay.
- BE SePay top-up: thêm `SEPAY_TOPUP_MODE=bank_transfer` để tạo QR chuyển khoản thường/VietQR và reconcile bằng webhook cho ngân hàng không hỗ trợ VA orders như MBBank; giữ `va_order` cho BIDV/Sacombank.
- BE SePay webhook: hỗ trợ xác thực HMAC `X-SePay-Signature` + `X-SePay-Timestamp` trên chuỗi `{timestamp}.{raw_body}` đúng byte SePay gửi, thêm replay-window `SEPAY_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS`, và chỉ nhận fallback `X-Secret-Key` cũ khi bật `SEPAY_WEBHOOK_ALLOW_LEGACY_SECRET_KEY`.
- BE SePay webhook: sau khi validate định dạng header, so khớp digest HMAC bằng `timingSafeEqual` trên 32 byte decode từ hex (chặt hơn ví dụ `!==` trên toàn chuỗi).
- BE SePay webhook: `401` khi `X-SePay-Timestamp` ngoài cửa sổ drift dùng message riêng (không còn trùng với sai HMAC), kèm gợi ý cấu hình / ký lại; docs checklist gỡ lỗi curl replay.
- BE SePay webhook: ACK thành công đổi sang `{ "success": true }` để khớp yêu cầu response body của SePay Webhooks.
- BE SePay webhook: log `[SePayWebhookAuth]` khi invalidate chỉ còn reason, fingerprint/length của expected secret, received legacy `X-Secret-Key`, received `X-SePay-Signature`, và `expectedSignature` khi HMAC mismatch; không log payload metadata.
- BE SePay webhook: verify HMAC bằng raw body theo tài liệu HMAC hiện tại của SePay; nếu thiếu raw body khi có header HMAC thì fail closed để tránh ký sai payload.
- Quyền nạp ví học sinh: thêm `POST /student/:id/wallet-sepay-topup-order` cho admin/assistant/accountant/CSKH được phân quyền; staff chỉ tạo QR SePay và không được chỉnh thẳng số dư. Admin popup nạp ví có 2 tab **Tạo QR SePay** / **Nạp thẳng**; mọi chỉnh số dư trực tiếp của admin phải nhập lý do và ghi vào lịch sử ví. Self-service student chỉ QR SePay, không còn rút/chỉnh ví trực tiếp.
- DB `student_wallet_sepay_orders`: lưu metadata người tạo QR (`created_by_user_id`, email, role type, staff roles) để audit các đơn SePay do admin/staff/student tạo.

### Changed

- FE **Thành tích chuyên môn** (`specialization`): render trực tiếp chuỗi từ DB bằng Markdown (`react-markdown` + `remark-gfm`, `skipHtml`) qua `StaffSpecializationMarkdown`; bỏ nhánh rich text HTML sanitize, bỏ helper tự chèn xuống dòng trước bullet, copy popup chỉ hướng dẫn nhập Markdown, và `/user-profile` dùng textarea nhiều dòng để lưu newline thật vào DB. Docs: `docs/pages/staff.md`, `docs/pages/admin.md`, `docs/pages/auth.md`.

### Fixed

- CD VPS: deploy script prune Docker unused data trước khi pull, pull/recreate từng service và prune giữa các service để tránh `no space left on device` khi containerd giải nén image mới trên VPS nhỏ.
- CD VPS: `scripts/gha-deploy-remote.sh` chạy Prisma `migrate deploy` từ API image sau khi pull GHCR và trước khi recreate services, tránh deploy code mới khi schema production chưa có migration mới.
- BE/FE `GET /staff/:id/income-summary` — `snapshotUnpaidTotal` / `snapshotUnpaidNetTotal` giờ tính **toàn bộ** khoản pending/unpaid hiện tại từ mọi nguồn, không giới hạn tháng hoặc `days` và không gồm cọc; net giáo viên = gross - vận hành hiện hành - thuế trên phần sau vận hành, role khác = gross - thuế. Card **Tổng nhận** dùng `incomeStatsTotalNet` = `monthlyIncomeTotals.total` (net tháng đang chọn), trong đó buổi dạy `unpaid`/`pending` của tháng cũng được tính theo NET hiện hành; **Đã nhận** dùng `monthlyIncomeTotals.paid`, card **Tổng năm** dùng `yearIncomeTotal`, còn mini stat **Chưa nhận** trên `/staff` dùng `snapshotUnpaidNetTotal`. Docs: `docs/pages/admin.md`, `docs/pages/staff.md`, `docs/Database Schema.md`; DTO comments.
- BE `GET /staff/:id/income-summary` — `monthlyIncomeTotals` và `bonusMonthlyTotals`: thưởng (bonus) được tính **net sau thuế** theo mức khấu trừ hiện hành của role ưu tiên trên hồ sơ (không khấu trừ vận hành trên thưởng); `monthlyTaxTotals` / `yearTaxTotal` gồm thuế thưởng; `payment-preview` và `snapshotUnpaidNetTotal` đồng bộ cùng rule. Docs: `docs/pages/admin.md`, `docs/pages/staff.md`, `docs/Database Schema.md`; DTO `bonusMonthlyTotals`.
- BE `GET /staff/:id/income-summary` — `classMonthlySummaries` (card **Lớp phụ trách**): cột Tổng / Chưa nhận / Đã nhận dùng **thực nhận** sau khấu trừ vận hành theo lớp và thuế (cùng công thức net như tổng hợp buổi dạy), thay vì gross trước thuế. Docs: `docs/pages/admin.md`, `docs/pages/staff.md`; DTO comment `StaffIncomeClassSummaryDto` / `StaffIncomeClassSummary`.
- BE auth/email verification: `POST /auth/resend-verification` chấp nhận session qua `access_token` hoặc `refresh_token` để user chưa verify không bị kẹt; lỗi SMTP giữ đúng `503` thay vì thành `500`; Gmail App Password có khoảng trắng được normalize trước khi gửi qua Nodemailer.
- API local CORS/preflight: bật CORS qua `NestFactory.create(..., { cors })` trong `apps/api/src/main.ts` thay vì `app.enableCors()` sau `create`, để middleware CORS đăng ký trước router Nest và trả `Access-Control-Allow-Origin` cho `OPTIONS` (tránh lỗi preflight khi gọi API cross-origin từ web).

### Added

- **CI deploy — Tailscale (tuỳ chọn):** job `deploy` trong [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) có thể gọi [`tailscale/github-action@v4`](https://github.com/tailscale/github-action) trước `appleboy/ssh-action` khi bật variable `TAILSCALE_ENABLED=true` (OAuth `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET` mặc định, hoặc `TAILSCALE_AUTH_MODE=authkey` + `TAILSCALE_AUTHKEY`). Biến tuỳ chọn `TAILSCALE_TAGS`, `VPS_TAILSCALE_PING`. Hướng dẫn: `docs/Cách làm việc.md`.
- DB migration: `staff_info` thay unique index `staff_info_user_id_key` bằng phiên bản **covering** `INCLUDE ("id", "roles")` để hỗ trợ index-only scan cho truy vấn theo `user_id` (luồng auth/session).
- Prisma `StaffInfo`: doc comment + `@@unique([userId], map: "staff_info_user_id_key")` (thay `@unique` trên field) để tên index khớp DB và ghi chú INCLUDE chỉ trong migration.
- **Nginx HTTPS (prod):** Tách `location` proxy chung vào `nginx/conf.d/snippets/proxy-locations.conf`, `app.conf` phục vụ HTTP (default_server) + `/.well-known/acme-challenge/` cho Certbot webroot; mount `./nginx/certbot/www` trong `docker-compose.prod.yml`; file mẫu `nginx/conf.d/https-vhost.conf.example`; **`nginx/conf.d/https-vhost.conf`** cho TLS + redirect (miền prod hiện tại: `it.unicornsedu.com`). Hướng dẫn & thứ tự Certbot trong `docs/Cách làm việc.md`.
- FE `/admin/staffs/[id]` (shell `/admin`) — card **Lớp phụ trách**: cột **KH vận hành** (%); **admin** chỉnh ô `%` với **Huỷ bỏ** / **Lưu** chỉ hiện khi có thay đổi; không lưu khi blur; **Huỷ bỏ** refetch `GET /staff/:id` và xóa draft; **Lưu** áp tuần tự các lớp đã đổi qua `PATCH /staff/:id/class-teachers/:classId/operating-deduction` và hiện skeleton khi đang lưu. `GET /staff/:id` trả `operatingDeductionRatePercent` trên từng `classTeachers`.
- FE notification tray (staff shell): thêm popup cảnh báo giữa màn hình khi load trang và còn thông báo `unread`, nội dung "Cảnh báo còn thông báo chưa đọc", có nút `X` để tắt popup và nút CTA `Xem thông báo` để mở notification slide bên phải ở tab `Mới`.

### Changed

- **Prod domain (VPS):** `nginx/conf.d/https-vhost.conf`, [.env.production.example](../.env.production.example) và mục Certbot/HTTPS trong `docs/Cách làm việc.md` chuyển sang **`it.unicornsedu.com`** (Let’s Encrypt path `/etc/letsencrypt/live/it.unicornsedu.com/`). Trên VPS: cấp lại cert với `-d it.unicornsedu.com`, đồng bộ `.env` (`FRONTEND_URL`, `BACKEND_URL`, `GOOGLE_CALLBACK_URL`, `VPS_PUBLIC_HOST`) và secret GitHub `NEXT_PUBLIC_BACKEND_URL` = `https://it.unicornsedu.com/api`.
- **CI deploy:** [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) không còn gọi `prisma migrate deploy` sau smoke HTTPS; migration production do vận hành chạy tay trên VPS (hoặc quy trình ngoài Actions). `docs/Cách làm việc.md` cập nhật mô tả pipeline và mục troubleshooting 137.
- BE/FE staff income summary (detail cards): `snapshotUnpaidNetTotal` tính net với **% vận hành và % thuế hiện hành** (cùng luồng preview thanh toán); `incomeStatsTotalNet` = `monthlyIncomeTotals.total`; `totalReceivedNet` = `yearPaidNetTotal + snapshotUnpaidNetTotal`. Card **Tổng nhận** = net tháng đang chọn, bao gồm unpaid/pending buổi dạy sau khấu trừ hiện hành; **Đã nhận** = `monthlyIncomeTotals.paid`; **Tổng năm** = `yearIncomeTotal`.
- **GitHub Actions:** gỡ job CI trên Actions; chỉ giữ [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) (push `main`: build/push GHCR `unicorns-prj-dev`, tag `latest` + `${GITHUB_SHA}`, deploy VPS với `GHCR_USERNAME` / `GHCR_TOKEN`). Lint/typecheck/test chạy local (`pnpm lint`, `pnpm check-types`, …).
- CI deploy workflow: biến `VPS_PUBLIC_HOST` cho curl HTTPS smoke test qua loopback (SNI); sau deploy gọi `certbot renew` khi có trên VPS.
- BE/FE admin dashboard: `GetAdminStudentBalanceDetails` thêm query tùy chọn `month` (01–12) / `year` (YYYY) để drill-down prepaid phù hợp tháng đang xem; FE admin dashboard chỉnh copy KPI và ghi chú nợ học phí / chưa thu / quick view cho khớp semantics tháng hiện tại.
- FE admin/staff/student CRUD save UX: các form save không-destructive cho lớp, nhân sự, học sinh, session, học phí, ví và self-profile nay đóng popup/thoát edit mode ngay sau client validation, hiện `toast.loading`, rồi resolve success/error khi mutation nền hoàn tất; section đang refetch vẫn giữ dữ liệu cũ, dim nhẹ và hiện refresh strip/skeleton mảnh thay vì thay cả vùng bằng loading state.
- Staff **Thanh toán** (payment-preview + pay-all): mọi nguồn trong preview và khi xác nhận pay-all là **toàn bộ khoản pending/unpaid hiện tại** (mọi role, mọi tháng, trừ cọc); `month/year` trong query/body chỉ là context UI. Card **Công việc khác**: **Chưa nhận** theo role là snapshot full-scope; **Tổng nhận/Đã nhận** vẫn theo tháng đang xem.
- BE session create/update: memo hoá `resolveTaxDeductionRate` theo `(staffId, roleType)` với `createMemoizedTaxDeductionResolver` — tránh N lần query trùng khi `Promise.all` trên nhiều dòng điểm danh cùng CSKH / assistant; `studentClass` khi tạo buổi chỉ `select` `student.account_balance` thay vì cả `student_info`.
- CI: `.github/workflows/deploy.yml` tách build Docker **API** và **Web** thành hai job chạy song song (`build-api`, `build-web`); `deploy` chờ cả hai; cache BuildKit `gha` dùng `scope` riêng để tránh xung đột khi push cache đồng thời. Job `deploy`: `VPS_PUBLIC_HOST` từ Secret hoặc Repository variable (`secrets.VPS_PUBLIC_HOST || vars.VPS_PUBLIC_HOST`), truyền SSH qua `envs`; trên VPS nếu trống thì đọc `VPS_PUBLIC_HOST` trong `.env`; chỉ chạy smoke test HTTPS (`curl --resolve`) khi đã có hostname (không có thì skip). `.env.production.example` thêm `VPS_PUBLIC_HOST`.

### Fixed

- BE dashboard `getMonthlyTrend`: sửa lỗi PostgreSQL `function pg_catalog.substring(date, integer, integer) does not exist` (Prisma `P2010`) khi raw SQL bind cận `DATE` dạng parameter — chuyển sang literal `DATE 'YYYY-MM-DD'` đã validate; gộp chi phí bonus theo `bonuses.date`; `cost_extend` lọc nhánh `month` bằng `::text` + `BTRIM` đồng bộ với range aggregate.
- CI deploy (`.github/workflows/deploy.yml`): giảm lỗi race `OCI runtime exec failed ... setns` ở bước `docker compose exec -T nginx ...` bằng cách chờ `nginx` chạy ổn định sau recreate (`wait_for_nginx_running`) và retry `nginx -t` / `nginx -s reload`; khi thất bại sẽ dump `docker compose ps` + `logs nginx` để debug nhanh root cause.
- FE `SessionHistoryTable`: pill trạng thái thanh toán (ví dụ _Chưa thanh toán_) xuống dòng gọn trong ô khi bảng `table-fixed` hẹp / `overflow-x-auto`, cột trạng thái tăng tỷ lệ + `min-w-30`, tiêu đề cột được phép xuống dòng trên màn nhỏ — tránh badge/mask lệch hoặc tràn khi scroll ngang.
- BE admin dashboard aggregate (`GET /dashboard`): chỉnh `getMonthlyTrend` dùng cận ngày `YYYY-MM-DD` theo `month`/`year` + `anchorMonthKey`, và `buildDashboardRange` dùng `Date.UTC` cho biên tháng / `formatMonthKey` theo UTC — tránh lệch múi giờ khiến `generate_series` không khớp CTE doanh thu/chi phí và `resolveSelectedMonthTrend` fallback về 0 (bảng **Báo cáo tài chính** hiển thị sai **Học phí đã học**, chi phí, lợi nhuận).
- BE dashboard `getMonthlyTrend`: lọc `cost_extend.date` ép `::date` vì cột DB là `TEXT` — sửa lỗi PostgreSQL `operator does not exist: text >= date` (Prisma `P2010`).
- BE/FE staff income summary unpaid: thêm `snapshotUnpaidTotal` authoritative cho card `Chưa nhận` trên `/staff/profile` và `/admin/staffs/[id]`; snapshot loại trạng thái cọc, buổi dạy chỉ tính `unpaid` trong `days` gần nhất, các nguồn pending khác tính full, dùng semantics trước thuế. Đồng thời cột `Chưa nhận` theo lớp chuyển sang lấy gross từ cửa sổ unpaid gần nhất.
- BE staff income summary theo lớp: `classMonthlySummaries` chuẩn hóa lại theo rule mới — cột `Tổng` + `Đã nhận` tính theo **tháng đang chọn** với gross trước thuế, còn cột `Chưa nhận` giữ cửa sổ `days` gần nhất (mặc định 14 ngày) với gross trước thuế.
- BE session date-only consistency: chuẩn hóa parse/lọc ngày theo mốc UTC date-only (`YYYY-MM-DD`) cho luồng tạo/sửa session và query tháng để tránh case đổi ngày sang tháng trước nhưng vẫn hiển thị ở tháng hiện tại.
- BE staff unpaid snapshot: mở rộng lọc trạng thái buổi dạy `chưa nhận` cho cửa sổ gần nhất để bao gồm cả dữ liệu legacy `pending` lẫn `unpaid`, tránh hụt cột `Chưa nhận` theo lớp.
- BE session create: tăng `interactive transaction timeout` / `maxWait` cho `SessionCreateService.createSession` (cùng mức 20s như `SessionUpdateService`) để tránh Prisma `P2028` khi tạo buổi có nhiều điểm danh, ghi ví, và audit snapshot.
- BE session update/payroll audit: tăng `interactive transaction timeout` cho `SessionUpdateService` (`updateSession` và `updateSessionPaymentStatuses`) để tránh lỗi Prisma `P2028` khi transaction chứa nhiều thao tác (snapshot + attendance upsert + audit log) vượt ngưỡng mặc định 5s.
- BE payroll (deposit sessions): `buildTeacherSessionAllowanceCte` không còn áp trần `classes.max_allowance_per_session` cho các buổi có `teacher_payment_status` thuộc nhóm cọc (`deposit/deposite/coc/cọc`); các buổi thường vẫn giữ logic cap như cũ.
- BE/FE session allowance (lựa chọn **B**): `sessions.allowance_amount` lưu **gốc trước hệ số** = `(trợ cấp/HS theo gia sư-lớp × số HS điểm danh present/excused) + classes.scale_amount`; các SQL payroll/dashboard/reporting dùng `min(max_allowance_per_session, allowance_amount * coefficient)` và **không** cộng thêm `classes.scale_amount`. Migration `20260502120000_session_allowance_includes_scale_amount` cộng `scale_amount` vào `allowance_amount` cho session cũ để gross không đổi sau deploy.
- FE `AddSessionPopup` + chỉnh sửa buổi trong `SessionHistoryTable`: auto-fill/preview đồng bộ công thức trên; header hiển thị gross ước tính (hệ số + trần); submit gửi đúng gốc lưu buổi. Helper dùng chung `apps/web/lib/session-allowance.helpers.ts`.
- BE/FE extra allowance create flow: `POST /extra-allowance` và `POST /users/me/staff-extra-allowances` không còn yêu cầu FE gửi `id`; backend để Prisma/DB tự sinh UUID, trong khi các flow `PATCH` tương ứng vẫn giữ `id` bắt buộc. Admin detail page và self-service `communication`/`technical` đã bỏ `createClientId()` khi tạo trợ cấp mới.
- BE/FE calendar exam schedules: feed `/admin/calendar/events` và `/calendar/staff/events` không còn làm rơi lịch thi chỉ vì `student_info.status = inactive`; miễn học sinh còn gắn với lớp `running` thì event `exam` vẫn hiển thị trên calendar. Dropdown filter học sinh của calendar cũng đổi sang cùng tiêu chí này.
- FE: `ThemeProvider` không còn đọc `localStorage` trong `useState` initializer — tránh hydration mismatch (logo `BrandLogo` / `next/image` khác `src` và kích thước giữa server và client khi user đã lưu theme tối hoặc pink).
- FE `/auth/login`: toast lỗi hiển thị message từ Nest khi **400** / **401** / **429**; ô mật khẩu có `minLength={6}` + placeholder gợi ý để khớp validation `POST /auth/login` (tránh 400 chỉ vì mật khẩu quá ngắn).
- FE `/staff/calendar` và `/admin/calendar`: thêm switch **Calendar / Schedule**, bộ lọc lớp hỗ trợ **multi-select** (admin giữ thêm lọc gia sư); chế độ Schedule chỉ hiển thị ngày có lịch (ẩn ngày trống); dùng chung `CalendarScheduleList` + palette lớp; card có badge trạng thái `Đã dạy / Đang diễn ra / Sắp tới`.

### Changed

- BE/FE calendar: chuyển sang aggregate feed hợp nhất `fixed` + `makeup` + `exam`, hỗ trợ filter học sinh, toggle **Tuần này / Tuần sau**, popup/list render lịch thi như event all-day kiểu ngày lễ; route admin/staff calendar giữ read-only cho `makeup`.
- FE `/admin/classes/[id]` và `/staff/classes/[id]`: quản lý **Lịch dạy bù** trực tiếp trong trang chi tiết lớp, có phân trang, sắp xếp buổi gần nhất trước, copy tiếng Việt đầy đủ; admin/trợ lí chọn gia sư phụ trách, teacher tạo buổi bù với chính mình là người phụ trách.
- FE `AddSessionPopup` + dialog **Chỉnh sửa buổi học** trong `SessionHistoryTable`: layout một cột (`max-w-3xl`), header có số tiền (success), nhóm thời gian có mũi tên + thời lượng, điểm danh cột **Trạng thái** trước (nút icon Học/Phép/Vắng), tổng điểm danh dạng một dòng màu; module dùng chung `session-form-ui.tsx`. Truyền `classPricing` từ chi tiết lớp để hiển thị ước lượng trợ cấp (gốc lưu buổi = trợ cấp/HS × có mặt + scale; header gross = `min(max_allowance, gốc × hệ_số)`).
- FE `/admin/classes/[id]` và `/staff/classes/[id]`: dòng meta lớp (trạng thái, loại, gói, trợ cấp, sĩ số, …) chỉ hiển thị cho **admin**, **trợ lí**, **kế toán**, **CSKH**; gia sư thuần `teacher` trên staff workspace không thấy dải thông tin đó.
- FE `/admin/staffs/:id` (và mirror staff): **Thống kê thu nhập** thêm lại khối **Trước khấu trừ** (gross/thuế/khấu trừ chi tiết) cho người xem **admin** hoặc **kế toán**, đồng bộ với logic `/staff/profile`.
- FE `/admin/calendar` và `/staff/calendar`: tối giản layout — header/bộ lọc nhỏ hơn (bỏ gradient blob + đoạn hướng dẫn dài; gợi ý ngắn hoặc `title`), Schedule list + vỏ FullCalendar gọn; lưới giờ co trong ngày (không mở dải nửa đêm khi chỉ có lịch ban ngày), ô giờ thấp hơn, sự kiện xếp không overlap trong cột; đồng bộ `FilterBar` / `StaffCalendarFilterBar`.
- FE `/admin/classes/[id]` và `/staff/classes/[id]` (teacher workspace): tối giản UI chi tiết lớp — header/card gọn hơn, meta lớp một hàng có dấu phân cách ·, khung giờ học bỏ khối thời gian quá lớn trên desktop, bảng học sinh và tab lịch sử/khảo sát bớt padding; `SessionHistoryTable` với `variant="classDetail"` có bảng buổi học dày hơn (cột thời gian/ghi chú/thông tin gọn).
- BE/FE payroll summary: giữ nguyên khấu trừ vận hành của gia sư theo lớp, nhưng đổi khấu trừ thuế sang tính trên **tổng thu nhập của từng nguồn trong kỳ** theo snapshot/effective-rate bucket; bonus tiếp tục không chịu thuế.
- BE `GET /staff/:id/income-summary`, `GET /users/me/staff-income-summary`, `GET /staff`: unpaid/tổng hợp net giờ dùng aggregate-tax theo nguồn; các view chi tiết lớp/cọc/unpaid của gia sư chuyển sang semantics **sau vận hành, trước thuế**.
- FE `/admin/deductions`, `/admin/staffs/:id`, `/staff/profile`: cập nhật copy/label để phản ánh tax aggregate theo nguồn, bonus untaxed, và bảng lớp là số trước thuế.
- BE/FE deductions settings: `/admin/deductions` và mirror `/staff/deductions` giờ chỉ quản lý mức thuế mặc định theo role; flow chỉnh/tạo override theo staff được chuyển sang card thuế ở `/admin/staffs/:id` và mirror `/staff/staffs/:id`. API `PATCH` cho role defaults và staff overrides vẫn giữ nguyên.

### Removed

- FE `/staff/classes/[id]`: bỏ đoạn ghi chú dưới header (teacher / admin teacher-workspace / CSKH) về khung giờ, buổi học và trường tài chính bị khóa.
- FE: component `AdminProfilePopup` (modal "Thông tin cá nhân" khi bấm avatar); export barrel `@/components/admin` không còn `AdminProfilePopup`. Thông tin cá nhân chỉ qua trang `/user-profile`.
- BE/FE notifications: gỡ cấu hình người nhận lưu DB và API `GET /notifications/recipient-options`; push/feed không còn filter theo đối tượng. Trên `/admin/notification`, ô **Người nhận** chỉ còn **mock UI (demo)** trên FE (tag + user giả), không gửi lên server.

### Added

- BE/FE student exams + Google Calendar: thêm persistence `student_exam_schedules`, popup/card chỉnh lịch thi học sinh, aggregate calendar event type `exam`, và sync all-day event lên Google Calendar theo `studentId + examScheduleId`.
- BE/FE makeup schedules: thêm bảng `makeup_schedule_events`, API CRUD theo lớp cho admin/staff workspace, render one-off event `makeup` trong aggregate calendar và sync riêng lên Google Calendar.
- BE schema/migration: thêm `class_teachers.tax_rate_percent` (default `0`) và `sessions.teacher_tax_rate_percent` (default `0`) để cấu hình thuế theo từng cặp gia sư-lớp và snapshot mức thuế tại thời điểm tạo/cập nhật buổi học.
- BE/FE class teachers: payload cập nhật gia sư lớp nhận thêm tỷ lệ khấu trừ vận hành; FE dùng key semantic `operating_deduction_rate_percent`, backend vẫn nhận `tax_rate_percent` như alias legacy.
- FE admin/staff: thêm màn `Khấu trừ` tại `/admin/deductions` và mirror `/staff/deductions` để quản lý khấu trừ thuế theo role (effective-date), kèm wire sidebar + access gate cho admin/assistant/accountant theo policy shell; chỉnh riêng từng staff được thực hiện tại trang chi tiết nhân sự.
- FE: `BrandLogoLockup` — khung mark + tách màu **Edu** (`text-primary`), khoảng cách chặt, hover lockup; Navbar / auth / sidebar (`dense` khi thu gọn).
- BE/FE: `notification_reads` (per-user đã đọc) + `GET /notifications/feed` trả `readStatus` + `PATCH /notifications/feed/:id/read`. Feed mở cho `student` (studentInfo active) và `admin` không bắt buộc staff profile. Sidebar `StaffSidebar` / `StudentSidebar`: `SidebarNotificationTray` (TanStack Query), panel phải + popup chi tiết giữa màn hình (Framer), auto mark read khi mở chi tiết; `@heroicons/react` `BellIcon`.
- BE/FE: Trợ cấp trợ lí 3% học phí đã học. Trợ lí (`assistant` role) quản lí các CSKH: `staff_info.customer_care_managed_by_staff_id` FK mới; snapshot `assistant_manager_staff_id` + `assistant_payment_status` trên `attendance` tại thời điểm tạo/cập nhật buổi học. Thu nhập trợ lí aggregate bằng raw SQL `ROUND(tuition_fee * 0.03)` chỉ trên attendance `present`, wire vào `getIncomeSummary`, `getUnpaidTotalsByStaffIds`, và dashboard unpaid CTE. API: `GET /staff/assistant-options`, `PATCH /staff` nhận thêm `customer_care_managed_by_staff_id`; `GET /staff/:id` trả `customerCareManagedBy`. FE: dropdown trợ lí trong popup sửa nhân sự CSKH. Migration: `20260405120000_add_assistant_manager_fields`.

### Fixed

- Auth/API/Web: thêm `GET /auth/session` làm contract auth nhẹ cho SSR/proxy/bootstrap; `GET /auth/profile` delegate cùng resolver; refresh/session auth không còn đối chiếu hash refresh token với DB để hỗ trợ đăng nhập đồng thời nhiều thiết bị cùng một tài khoản; logout clear cookie theo session hiện tại; forgot-password trả generic success để tránh account enumeration; bổ sung route `/verify-email` ở web.
- User self-service/security: đổi email tự phục vụ sẽ reset `emailVerified=false`; self student update không còn nhận `status`; `bank_qr_link` được normalize/validate chỉ cho `http/https`; upload avatar/CCCD được chặn MIME/size ngay từ controller interceptor; `StaffQrCard` không còn `window.open` URL không an toàn.
- FE: popup **Chọn giao diện** (`SidebarThemePicker`) render qua `createPortal` → `document.body` để không bị cắt bởi `overflow-hidden` / `transform` trên sidebar.
- API: `NotificationService` feed + mark-read không còn dùng `include.reads` / `prisma.notificationRead` (tránh lệch type khi Prisma client chưa generate đủ); feed query `notification_reads` bằng `$queryRaw` + `Prisma.join`, mark read bằng `$executeRaw` `ON CONFLICT DO NOTHING`.

### Changed

- BE income summary staff: chuyển sang **net-first** cho khoản dạy học (`monthlyIncomeTotals`, `sessionMonthlyTotals`, `yearIncomeTotal`) và trả thêm breakdown gross/tax (`monthlyGrossTotals`, `monthlyTaxTotals`, `sessionMonthlyGrossTotals`, `sessionMonthlyTaxTotals`, `yearGrossIncomeTotal`, `yearTaxTotal`).
- FE `/admin/staffs/[id]` và `/staff/profile`: card thu nhập tháng hiển thị số net làm chính; block `Trước khấu trừ` render động gross/tax và tự mở rộng thêm `operating/total deductions` nếu backend expose; chỉ hiển thị cho admin hoặc accountant.
- FE class forms (`AddClassPopup`, `EditClassPopup`, `EditClassTeachersPopup`): semantic UI/DTO đổi từ `thuế gia sư-lớp` sang `khấu trừ vận hành`; giữ fallback tương thích key cũ để không vỡ khi backend rollout từng phần.
- Docs: đồng bộ lại `docs/pages/admin.md`, `docs/pages/staff.md`, `docs/Database Schema.md` theo logic deductions mới (thuế không áp dụng bonus, khấu trừ vận hành theo quan hệ gia sư-lớp, route mới `/admin|/staff/deductions`).
- FE: chọn giao diện 3 chế độ (Sáng / Tối / Hoa anh đào) — `data-theme` + `localStorage` (`ue-app-theme`), `ThemeProvider`, logo theo theme (`logo_light` / `logo_dark` / `logo_hana`), nút `SidebarThemePicker` (icon Swatch) cạnh avatar + chuông trên `AdminSidebar` / `StaffSidebar` / `StudentSidebar`; script `beforeInteractive` tránh flash; tinh chỉnh token `[data-theme="pink"]` (tông hồng / rose). Asset `logo_hana.png` đã chạy lại `square-trim-logos`.
- FE `/user-profile`: icon xác minh email; khi chưa xác minh — nút «Xác minh email →→» (mutation + mock `mockResendVerificationEmail`, toast demo); mock `emailVerifiedWhenApiMissing` + `forceEmailUnverifiedForTest` trong `mocks/user-profile-verification.mock.ts`.
- FE `/user-profile`: bố cục hai cột (trái: avatar tròn + đặt lại mật khẩu + file ảnh; phải: bảng nhãn/giá trị căn gutter, `hr` giữa khối); `max-w-5xl`, bỏ Card hero một khối.
- FE: `AdminSidebar` / `StaffSidebar` — bấm avatar (menu mở rộng hoặc thu gọn, mobile drawer) điều hướng tới `/user-profile` thay vì mở `AdminProfilePopup` (đồng bộ với `StudentSidebar`).
- FE: sidebar dùng cùng `BrandLogoLockup` variant **`navbar`** như trang home (flex, gap, cỡ mark, typography); bỏ variant `sidebar` / grid. Thu gọn menu: `dense` (mark ~`h-9`/`sm:h-10`).
- Web: script `square-trim-logos.mjs` (`pnpm square:logos`) xử lý mọi PNG trong `image/logo/`: trim, canvas vuông, margin ~3px; `LOGO_MAX_EDGE` mặc định 1024. Sau đó nên chạy lại `favicon:ico`.
- Web: tối ưu logo/favicon — script `optimize-ui-logo.mjs` nén `image/logo/logo_light.png` (cạnh dài tối đa 1600px); `png-to-favicon-ico.mjs` gọn pipeline Sharp, trần prep (`FAVICON_PREP_MAX`), PNG zlib tối đa, `apple-icon` 180px; thêm `pnpm optimize:assets` / `optimize:logo`. `next.config.ts`: ưu tiên định dạng AVIF/WebP cho `next/image`.
- FE notifications (staff + student): realtime toast từ websocket chuyển sang bản tóm tắt; click toast hoặc action `Mở` sẽ mở trực tiếp popup chi tiết của đúng notification trong `SidebarNotificationTray` (giống click item trong panel), đồng thời mark-read nếu đang unread.
- FE notifications UI: panel chuông cải tiến nhẹ (header có summary số mới, item dạng card với nhấn mạnh unread), modal chi tiết thêm badge trạng thái (`Thông báo mới` / `Điều chỉnh vN`).
- FE `/admin/notification`: chuyển ô nội dung sang rich text editor (TipTap) để admin soạn thông báo có định dạng; validate submit dựa trên text thực (không chấp nhận nội dung rỗng chỉ có tag). Feed admin + modal chi tiết staff/student render HTML đã sanitize.
- FE notification typography: tiêu đề thông báo được nhấn mạnh hơn (input tiêu đề trên `/admin/notification` dùng chữ to + đậm khi nhập; tiêu đề khi hiển thị ở list admin và popup chi tiết cũng tăng size/weight để nổi bật).
- FE `/admin/notification` UI/UX tối giản thêm: lược bỏ note dài, thu gọn tiêu đề/copy, giảm padding và bo góc card, rút gọn trạng thái rỗng, và chuyển metadata item sang inline để màn hình gọn hơn.
- FE `/admin/notification` actions chuyển sang icon-only đồng bộ style hệ thống (tạo nháp, sửa, push, push lại, xóa, làm mới, hủy); giữ `aria-label`/`title` để không mất khả dụng.
- FE admin sidebar: thêm `SidebarNotificationTray` (icon chuông + panel/popup chi tiết) ở cụm action dưới cùng, đồng bộ trải nghiệm với staff/student.
- FE popup chi tiết thông báo: co giãn bề rộng theo độ dài nội dung (max trong viewport) để đọc thông báo dài/ngắn tự nhiên hơn.
- FE staff detail income stats (`/admin/staffs/[id]`, `/staff/profile`): đổi bảng số liệu sang card grid; block `Trước khấu trừ` chỉ hiển thị cho admin hoặc role kế toán.
- FE `/admin/classes/[id]` và `/staff/classes/[id]` (teacher/CSKH/admin workspace): bỏ card **Thông tin cơ bản** và dòng mô tả “Chi tiết lớp học…” (admin); thông tin lớp gọn dưới tiêu đề (chip trạng thái/loại + gói, trợ cấp, sĩ số, …); staff giữ đoạn mô tả workspace **dưới** dòng meta.
- FE: Popup thêm/sửa lớp (`AddClassPopup`, `EditClassPopup`, `EditClassBasicInfoPopup`) — học phí chỉ **Tổng gói** + **Số buổi**, không ô học phí/buổi; submit gửi `student_tuition_per_session` làm tròn; `compactTuitionPerSessionLine` chỉ hiện một dòng `…/buổi` khi nhập hợp lệ (thay cho gợi ý dài). UI tối giản: tiêu đề **Thêm lớp** / **Sửa lớp** / **Thông tin lớp**, section nhỏ (Gia sư, Học sinh, Học phí, Lịch), bỏ ghi chú trợ cấp/định dạng giờ dài.
- FE: `StaffSidebar` bỏ mục menu **Thông báo** (đã có chuông + panel); học sinh vốn không có mục này trong `StudentSidebar`.
- FE: Panel + modal thông báo (`SidebarNotificationTray`) portal vào `document.body` để không bị kẹt trong sidebar (ancestor có `transform`); mobile panel full viewport; z-index tách lớp với modal chi tiết.
- Docker: base image `node:20-alpine` → `node:24-alpine` cho `apps/api` và `apps/web` (build/run trong container).
- CI deploy VPS: `appleboy/ssh-action` thêm `command_timeout: 30m`; script deploy đặt `COMPOSE_PARALLEL_LIMIT=1`, `sleep` sau `up` và `NODE_OPTIONS=--max-old-space-size=384` khi chạy `prisma migrate deploy` để giảm OOM / exit **137** trên VPS nhỏ. `docs/Cách làm việc.md` thêm mục troubleshooting 137 + gợi ý swap/RAM.
- BE deploy: `prisma` CLI chuyển từ `devDependencies` sang `dependencies` của `apps/api` để `pnpm deploy --prod` đưa binary vào image Docker; workflow VPS gọi `npx prisma migrate deploy` thay vì `./node_modules/.bin/prisma` (tránh lỗi `stat: no such file` sau khi prune).
- BE/FE: Học phí buổi học giờ áp dụng cho cả trạng thái **Học** (`present`) và **Phép** (`excused`); chỉ **Vắng** (`absent`) mới không tính học phí. Sửa `resolveChargeableAttendanceTuitionFee`, filter chargeable students trong session create/update, và toàn bộ SQL/Prisma aggregate tính doanh thu học phí + 3% trợ lí trên dashboard/staff service. Trợ cấp gia sư (teacher allowance) vẫn chỉ đếm `present`. FE `isChargeableAttendanceStatus` mở rộng cho `excused` trong `SessionHistoryTable` và `AddSessionPopup`.
- FE: Buổi học đã thanh toán (`paid`) hoặc đã cọc (`deposit`): popup chỉnh sửa điểm danh chỉ hiển thị học sinh theo bản ghi attendance đã lưu (kèm tên từ BE), không merge roster lớp hiện tại. Buổi `unpaid` vẫn merge danh sách học sinh lớp.
- BE: API list session (`GET /sessions/class/:id`, `GET /sessions/staff/:id`) trả thêm `attendance[].student.fullName` để FE hiển thị tên học sinh trong buổi đã khóa.
- FE staff shell `staff.assistant`: sidebar thêm mục **Cá nhân** → `/staff/staffs/:ownStaffId`; **Dashboard** trỏ `/staff` (cùng UI dashboard gọn như nhân sự khác); `/staff/dashboard` chỉ còn redirect về `/staff`. Xóa màn dashboard riêng trợ lí (bảng trợ cấp inline) khỏi `/staff` — dùng `/staff/assistant-detail` hoặc trang chi tiết nhân sự cho nội dung sâu hơn.
- FE `/admin/notes-subject` và mirror `/staff/notes-subject` (assistant): tab **Quy định** dùng bảng danh sách + bấm dòng mở **bảng chỉnh sửa** inline (`RegulationsTabPanel`, `RulePostEditTable`); thêm mới vẫn qua popup.
- FE trang chi tiết nhân sự (`/admin/staffs/[id]`, mirror `/staff/staffs/[id]`, `/staff/profile`): `StaffIdentityOverview` đồng bộ UI với các card section (viền/shadow/tiêu đề giống “Thống kê thu nhập”), QR minimal **cùng hàng tiêu đề bên phải** (flex), khối thành tích nền `bg-bg-secondary/40`, parse `specialization` bỏ ngoặc kép bọc ngoài.

### Added

- BE/FE auth: thêm flow bắt buộc thiết lập mật khẩu cho user đăng nhập Google OAuth nếu account tương ứng chưa có `passwordHash`. Backend thêm `POST /auth/setup-password`, mở rộng `GET /auth/profile` và `GET /auth/me` với cờ `requiresPasswordSetup`, re-issue lại cookie sau khi setup thành công, và ghi audit `setup password`. Frontend thêm route `/auth/setup-password`, root auth gate để chặn mọi route đã đăng nhập khi còn thiếu mật khẩu, và redirect tự động từ Google callback sang flow này.
- BE server cache: thêm Postgres-backed dashboard cache service (`apps/api/src/cache/dashboard-cache.service.ts`) dùng bảng `dashboard_cache` cho các read endpoint nặng của admin dashboard (`GET /dashboard`, `GET /dashboard/topup-history`, `GET /dashboard/student-balance-details`) với key theo query params và TTL ngắn; nếu thao tác cache lỗi thì backend vẫn fallback query dữ liệu tươi từ PostgreSQL.
- BE self-service users: thêm endpoint `PATCH /users/me/staff-bonuses` để staff chỉnh `workType`, `month`, `amount`, `note` của khoản thưởng thuộc chính mình; route kiểm tra ownership bằng truy vấn hẹp `id` + `staffId` và không cho tự đổi `status`.
- BE dashboard: thêm endpoint `GET /dashboard/topup-history?month=&year=&limit=` trả lịch sử nạp (topup) trong tháng kèm tổng nạp tích lũy trước/sau mỗi giao dịch để phục vụ popup tra cứu.
- BE dashboard: thêm endpoint `GET /dashboard/student-balance-details?limit=` trả danh sách chi tiết học sinh - lớp - số dư (`account_balance > 0`) cho popup “Nợ học phí chưa dạy”.
- BE class: 4 endpoint PATCH riêng cho từng form cập nhật lớp — `PATCH /class/:id/basic-info`, `PATCH /class/:id/teachers`, `PATCH /class/:id/schedule`, `PATCH /class/:id/students`. Khi form basic-info gửi `allowance_per_session_per_student`, backend đồng bộ toàn bộ `class_teachers.customAllowance` của lớp về giá trị đó.
- Xóa buổi học: bảng lịch sử buổi học có nút xóa (icon thùng rác) trong cột Thao tác; bấm vào hiện confirm, xác nhận thì gọi `DELETE /sessions/:id`, toast và invalidate sessions.
- Chỉnh sửa buổi học đầy đủ: bảng lịch sử buổi học có cột "Thao tác" (khi có `onSessionUpdated`) với nút "Sửa" mở dialog chỉnh sửa ngày học, gia sư phụ trách, giờ bắt đầu/kết thúc, ghi chú (rich text), trạng thái thanh toán, **điểm danh học sinh** (trạng thái Học/Phép/Vắng + ghi chú từng học sinh). Trang lớp truyền `teachers` và `getClassStudents`; trang gia sư truyền `getTeachersForClass(classId)` và `getClassStudents(classId)`. BE: list session trả thêm `attendance`; `PUT /sessions/:id` hỗ trợ `teacherId`, `teacherPaymentStatus`, `attendance`.
- Session notes rich text: bảng lịch sử buổi học (SessionHistoryTable, entityMode=teacher) hiển thị ghi chú dạng HTML đã sanitize (DOMPurify); dialog chỉnh sửa buổi học dùng RichTextEditor (TipTap) cho ghi chú. Popup thêm buổi học dùng RichTextEditor cho ghi chú thay cho textarea. Shared `RichTextEditor` và `sanitizeHtml` (lib/sanitize.ts) dùng chung với notes-subject.
- Trang Ghi chú môn học (`/admin/notes-subject`): 2 tab Quy định và Tài liệu. Tab Quy định cho phép thêm bài post quy định (tiêu đề, mô tả, nội dung TipTap) dùng mock data trong page; Tab Tài liệu hiển thị list contest của group Codeforces, bấm contest hiện list bài (theo thứ tự gốc), bấm bài mở popup chỉnh sửa tutorial.
- Tab Tài liệu (Ghi chú môn học): 3 dòng tài liệu (Luyện tập, Khảo sát, Thực chiến); bấm vào mới load contest của group tương ứng; hiển thị website link đầu mỗi contest; nút "Mở trên CF" dùng custom domain (unicornsedu.contest.codeforces.com, v.v.) thay vì codeforces.com.
- Khi bấm vào contest: mở rộng hiển thị danh sách bài trong contest (theo thứ tự gốc).
- Khi bấm vào bài: mở popup chỉnh sửa tutorial (rich text).
- API proxy Codeforces: `GET /codeforces/doc-groups`, `GET /codeforces/contests?groupCode=`, `GET /codeforces/contests/:contestId/problems` (yêu cầu CODEFORCES_API_KEY, CODEFORCES_API_SECRET).
- API tutorial bài: `GET /cf-problem-tutorial/:contestId/:problemIndex`, `PATCH /cf-problem-tutorial/:contestId/:problemIndex`.
- Model Prisma `CfProblemTutorial` lưu tutorial theo contestId + problemIndex.
- BE `sessions`: thêm endpoint `DELETE /sessions/:id` để xóa session theo id.
- BE lesson: thêm `GET /lesson-task-options?search=&limit=` cho flow đổi task gốc của output; query giữ bounded search với `limit` nhỏ, select tối thiểu và recent-first khi không search để tránh tải danh sách task rộng xuống FE.

### Security

- BE auth/server hardening: thêm global HTTP rate limiting bằng `@nestjs/throttler` ở `AppModule`, bỏ qua health check `GET /`, và cân theo scale ~200 user với default `300 request / 60s / endpoint / IP`. Các route nhạy cảm dùng limit riêng để giảm false positive khi nhiều người dùng chung NAT/proxy: `POST /auth/login` (20/5 phút), `POST /auth/register` (10/giờ), `POST /auth/forgot-password` (5/giờ), `POST /auth/reset-password` (10/giờ), `POST /auth/change-password` (10/30 phút), `GET /auth/verify` (30/giờ), `POST /auth/refresh` (120/phút). Thêm env `THROTTLE_DEFAULT_*` và `TRUST_PROXY` để cấu hình runtime.

### Changed

- FE `/admin/dashboard`: khối **Báo cáo tài chính** chuyển sang card viền nhạt + tiêu đề trái và bảng 3 cột (Danh mục / Giá trị / Ghi chú), 9 dòng tóm tắt nghiệp vụ; bỏ cột nhóm và cụm 3 card tín hiệu phía trên bảng; giá trị **Tổng nạp** và **Nợ học phí chưa dạy** vẫn là link mở popup lịch sử nạp / số dư học sinh.
- FE `/admin/students`: thêm nút xóa (icon thùng rác) ở cuối mỗi dòng học sinh (desktop) với popup xác nhận; gọi `DELETE /student/:id` và tự refresh danh sách sau khi xóa.
- BE staff/student: chặn xóa cứng khi còn dữ liệu liên kết (staff còn `sessions.teacher_id`, student còn `attendance.student_id`), trả lỗi 400 rõ ràng để FE toast thay vì phát sinh lỗi Prisma foreign key (P2003).
- FE `/staff`: section **Thưởng** giờ cho bấm từng dòng để mở popup **Điều chỉnh thưởng** ngay tại chỗ; popup self-service giữ layout add/edit chung, hiển thị `payment status` ở dạng chỉ đọc và chỉ cho staff sửa nội dung thưởng của chính mình.
- FE `/admin/customer_care_detail/[staffId]` và `/staff/customer-care-detail`: tab **Hoa hồng** giờ hiển thị trạng thái thanh toán CSKH theo từng buổi học bằng badge lấy từ `customerCarePaymentStatus`; danh sách chi tiết buổi được đổi sang layout một hàng/ledger thay vì card, vẫn giữ học phí, hệ số CSKH và tiền commission trên cùng dòng.
- BE customer-care: `GET /customer-care/staff/:staffId/students/:studentId/session-commissions` trả thêm `paymentStatus` (fallback `pending` cho record cũ còn `null`) và co hẹp `select` trên truy vấn attendance để chỉ lấy đúng cột cần cho màn chi tiết CSKH.
- FE tab `Công việc` (`/admin/lesson-plans`): thêm tick chọn nhiều + popup cập nhật `paymentStatus` hàng loạt cho bảng **Bài giáo án đã làm**; thanh bulk action chỉ hiện khi có ít nhất 1 item được chọn và dùng cùng UI checkbox minimal/bulk bar của hệ thống.
- FE bulk selection UI: chuẩn hoá checkbox tick (minimal) và bulk action bar chỉ hiện khi có selection cho các bảng lịch sử buổi học (lớp + nhân sự), đồng bộ UX “tick → hiện thanh hành động”.
- FE bulk selection UI: áp dụng cùng behavior “chỉ hiện thanh bulk khi đã chọn” cho các màn thanh toán hàng loạt (Chi phí, Trợ cấp thêm, Giáo án theo nhân sự) và chuẩn hoá checkbox tick theo style minimal dùng chung.
- FE `/admin/classes/:id`: đồng bộ và cải tiến UI/UX vùng **Lịch sử & Khảo sát** theo backup (tab underline, thanh điều khiển tổng buổi + điều hướng tháng + nút thêm), đồng thời bật chọn nhiều buổi để chuyển nhanh trạng thái thanh toán ngay trong tab Lịch sử.
- FE `/admin/lesson-manage-details`: mở rộng khung hiển thị (max width lớn hơn), bỏ block heading mô tả “Quản lí Giáo Án chi tiết…”, và thêm nút **Quay lại** về trang `lesson-plans`.
- FE tab **Giáo Án**: đồng bộ cụm thao tác cột `Link` theo backup với icon **copy / mở liên kết / xóa** trên từng dòng bài (giữ layout cột `Tag | Tên bài | Link`).
- FE `/admin/lesson-plans`: flow chi tiết `LessonOutput` quay về popup dùng chung trong workspace; tab **Công việc**, tab **Giáo Án**, màn hình phóng to và trang task detail đều mở popup ngay tại chỗ thay vì dựa vào route detail riêng.
- FE tab **Giáo Án**: đồng bộ header popup với tab **Công việc** (kicker `Bài giáo án`, title `Chỉnh sửa thông tin bài`, cùng chiều rộng modal) để UI thống nhất.
- FE tab **Giáo Án** popup bài trong chuyên đề: tối ưu lại để dùng chung trực tiếp `LessonOutputEditorForm` (cùng form với tab **Công việc**), không duy trì form chỉnh sửa riêng.
- FE tab **Giáo Án** popup **Thông tin chi tiết bài**: thêm nút **Chỉnh sửa** ở cuối form chi tiết; bấm vào sẽ mở form chỉnh sửa ngay trong popup và lưu bằng API update output.
- FE tab **Giáo Án** popup **Thông tin chi tiết bài**: bổ sung hiển thị thêm **Ngày tạo** và **Người tạo** để form chi tiết đầy đủ hơn khi bấm vào bài trong chuyên đề.
- FE tab **Giáo Án** (tab bài tập cũ): bấm vào dòng bài hoặc tên bài trong danh sách chuyên đề giờ mở popup **Thông tin chi tiết bài** ngay trong tab, không điều hướng sang trang mới.
- FE `/admin/dashboard`: trong bảng **Báo cáo tài chính**, đổi nhãn dòng cuối từ **Tổng niên** thành **Tổng nhận** để đúng wording nghiệp vụ.
- FE `/admin/dashboard`: khối **Cảnh báo & hành động** đồng bộ lại đúng 4 thẻ theo backup (`Học sinh cần gia hạn`, `Chờ thanh toán trợ cấp`, `Lớp chưa báo cáo lần 4`, `Chưa thu học phí`) cùng tone màu riêng cho từng thẻ và style item trong card.
- FE `/admin/dashboard`: đồng bộ lại UI/UX khối **Cảnh báo & hành động** theo màu từng loại cảnh báo (warning/destructive/info/default), card rõ trọng tâm hơn và mỗi dòng cảnh báo có thể bấm để đi tới trang chi tiết tương ứng.
- BE/FE dashboard alerts: mở rộng payload `actionAlerts` với `targetType` + `targetId`; thêm nhóm cảnh báo lớp (`Lớp cảnh báo`) dựa trên `classPerformance.balanceRisk` để hỗ trợ điều hướng sang `/admin/classes/:id`.
- FE `/admin/dashboard`: bấm vào giá trị dòng **Tổng nạp** trong bảng tài chính sẽ mở popup **Lịch sử nạp** theo backup (ngày giờ, học sinh, số tiền nạp, ghi chú, tổng nạp tích lũy trước/sau) theo tháng đang chọn.
- FE `/admin/dashboard`: bấm vào giá trị dòng **Nợ học phí chưa dạy** sẽ mở popup chi tiết theo backup với bảng 3 cột **Học sinh / Lớp / Số dư**.
- FE `/admin/dashboard`: thay 2 ô lọc tháng/chọn tháng bằng thanh hành vi chuyển tháng (nút trước/sau + nhãn tháng hiện tại) để thao tác nhanh hơn.
- FE `/admin/dashboard`: tinh chỉnh lần 2 để bám sát backup hơn (thêm card `Chưa thu` cùng cụm KPI, highlight 2 dòng tài chính trọng tâm, card cảnh báo dạng cột có header màu + danh sách scroll, bỏ cụm summary cuối trang).
- FE `/admin/dashboard`: đồng bộ UI/UX và bố cục theo backup theo hướng tối giản (lọc thời gian + xuất PDF/Excel, dải KPI card, bảng báo cáo tài chính, card cảnh báo & hành động, quick-view theo phân hệ với tab + chọn năm), giữ dữ liệu thật từ `GET /dashboard`.
- Web dependencies: thêm `recharts` cho `apps/web` để sửa lỗi build `Module not found: Can't resolve 'recharts'` ở trang `/admin/dashboard`.
- FE popup `EditStudentPopup` (`/admin/students/:id`): tối giản bố cục form chỉnh sửa hồ sơ học sinh (bỏ bớt mô tả dài, giảm tầng card/bo góc/spacing, giữ nguyên logic cập nhật dữ liệu và các khối CSKH + lịch thi).
- FE `/admin/lesson_plan_detail/[staffId]`: tối giản trang chi tiết giáo án theo staff, chỉ giữ 3 card tổng hợp (**Tổng số bài**, **Đã thanh toán**, **Chưa thanh toán**) và bảng danh sách bài đã làm theo cấu trúc tab `Công việc` (Tag/Level/Tên bài/Trạng thái/Contest/Link), bỏ hero + metadata nhân sự và detail-row mở rộng.
- FE tab **Công việc**: sau khi tạo bài mới sẽ tự mở popup chi tiết của output vừa tạo để chỉnh tiếp ngay tại workspace, không còn điều hướng qua route riêng.
- FE `/admin/lesson-plans/tasks/[taskId]`: ngoài flow tạo resource mới, trang chi tiết task có thêm panel **Đính kèm từ DB** để tìm trực tiếp trong bảng `LessonResources` và gắn/chuyển resource có sẵn sang task hiện tại.
- FE `/admin/lesson-plans/tasks/[taskId]`: bấm vào resource trong trang detail task giờ mở đúng popup `LessonResource` shared giống `/admin/lesson-plans`, thay vì dùng popup detail riêng hoặc bật link trực tiếp từ list.
- FE/BE `/admin/lesson-plans/tasks/[taskId]` + `GET /lesson-resource-options`: sửa lỗi panel search tài nguyên có thể trả rỗng sai khi resource chưa gắn task; query backend giờ giữ lại standalone resources và FE hiển thị trạng thái lỗi/retry rõ ràng nếu API search thất bại.
- FE/BE `/admin/lesson-plans/tasks/[taskId]`: thêm thao tác **Gỡ khỏi task** ngay trên từng resource card; FE gọi `PATCH /lesson-resources/:id` với `lessonTaskId = null` để trả resource về thư viện chung mà không xóa bản ghi.
- FE `LessonTagPicker`: dropdown tag chuyển sang render bằng portal theo vị trí input, nên có thể tràn ra ngoài popup/modal mà không bị clip; popup tạo/chỉnh sửa lesson resource trong `/admin/lesson-plans` hưởng luôn UX này.
- FE popup **Chỉnh sửa thông tin bài** (tab Công việc) đồng bộ lại theo backup: bố cục 2 cột gọn, field tiếng Việt theo thứ tự nhập liệu thực tế (Tên bài, Link gốc, Tên gốc/Nguồn, Tag/Level, Ngày + Checker/Code + Chi phí, Trạng thái, Contest, Link), giữ UX tag picker và thao tác lưu nhanh tại chỗ.
- FE tab **Công việc**: bấm vào dòng trong bảng “Bài giáo án đã làm” giờ mở popup **Chỉnh sửa thông tin bài** ngay trong trang (load chi tiết theo `lesson-output id`, cập nhật bằng `PATCH /lesson-outputs/:id`), giúp chỉnh sửa nhanh không cần rời tab.
- FE `LessonWorkAddLessonForm` (Thêm bài mới): tối giản bố cục theo hướng compact (giảm tầng card/spacing, rút gọn phần tag nhanh và helper text) để nhập liệu nhanh hơn trong tab Công việc.
- FE tab **Công việc**: bảng “Bài giáo án đã làm” đồng bộ lại theo backup (layout gọn, cột checkbox · Tag · Level · Tên bài · Trạng thái thanh toán · Contest · Link; cụm icon copy/mở/xóa bên phải).
- FE tag filter picker: cho phép chọn liên tục nhiều tag (multi-select chips) như backup; BE `GET /lesson-work` cập nhật filter `tag` hỗ trợ nhiều term phân tách bằng dấu phẩy/chấm phẩy.
- FE **Bộ lọc nhanh** (tab Công việc/Giáo Án): trường Tag chuyển sang picker UI/UX giống form thêm bài (dropdown nhóm level + search + chọn trực tiếp), đồng bộ thao tác với backup.
- FE tag picker (`LessonTagPicker`): nhóm **KHÁC** ở cuối list giờ hiển thị toàn bộ tag mới đã từng được thêm (lưu local), đúng flow backup khi chọn tag cũ/tag mới.
- FE tag UX trong form **Thêm bài mới** (Giáo án): chọn tag cũ qua dropdown nhóm level theo backup, mỗi tag có icon, và thêm tag mới ngay trong form bằng Enter/nút **Thêm** trước khi submit.
- FE lesson forms (`LessonWorkAddLessonForm`, `LessonOutputEditorForm`): UI/UX chọn tag đồng bộ backup bằng dropdown list phân nhóm `LEVEL 0..5` + `KHÁC`, hỗ trợ tìm kiếm và chọn trực tiếp nhiều tag.
- FE `/admin/lesson-plans` tab **Công việc** + tab **Giáo Án**: tối giản UI khối **Bộ lọc nhanh** và **Thêm bài mới** (ẩn mặc định, bấm mới mở), bỏ các đoạn ghi chú/phụ đề dài để form gọn hơn; icon phóng to ở tab **Giáo Án** đổi sang style hiện đại (outline + subtle motion).
- FE `/admin/lesson-plans` tab thứ 3 đổi tiêu đề thành **Giáo Án**; thêm icon phóng to ở góc header để mở `/admin/lesson-manage-details` (bản quản lí chi tiết/phóng to của cùng dataset), và có nút thu gọn quay về tab trong workspace.
- FE `/admin/lesson-plans` tab **Giáo Án** (`LessonExercisesTab`): thay placeholder — sidebar Level 0–5, bộ lọc nhanh (`ex*`), bảng Các bài đã làm (Tag · Tên bài · Link), cùng API `GET /lesson-work`; BE `GET /lesson-work`: thêm query `level` (`0`…`5`); response mỗi output thêm `originalLink` (fallback link).
- FE `/admin/lesson-plans` tab **Công việc**: **Bộ lọc nhanh** + **Thêm bài mới** (`LessonWorkAddLessonForm` — 4 khối card, lưới cặp trường + hàng 3 cột ngày/thanh toán/chi phí, Checker/Code trong “Gắn tag nhanh”; map thanh toán → `cost`; không task/nhân sự trên UI) + bảng “Bài giáo án đã làm”. BE `GET /lesson-work` (lọc tháng/ngày/search/…); `POST /lesson-outputs` với `lessonTaskId`/`staffId` có thể `null`.
- FE `/admin/lesson-plans` tab Tổng quan: bảng **Tài nguyên** tối giản — bỏ mô tả dưới tiêu đề section; bảng chỉ cột Tài nguyên / Link / Tag (+ thao tác), bỏ cột Cập nhật và mô tả trong ô; bảng **Công việc** bỏ mô tả dưới tiêu đề và không hiển thị mô tả dưới tiêu đề từng dòng.
- FE `/admin/lesson-plans`: thanh tab **Tổng quan / Công việc / Bài tập** full width trong khối nội dung, ba nút chia đều (`flex-1`), tăng chiều cao và padding; bỏ `sm:w-fit` + `sm:flex-none` để không còn thanh pill quá hẹp trên desktop.
- Refresh docs cho trạng thái repo hiện tại: cập nhật `README.md`, `apps/web/README.md`, `docs/README.md`, `docs/Cách làm việc.md`, `docs/pages/README.md` và `docs/pages/admin.md` để phản ánh đúng route đang có, command `pnpm --filter ...`, API port/env note, và snapshot review ngày `2026-03-16`.
- FE `/admin/classes/:id`: 4 form chỉnh sửa (thông tin cơ bản, gia sư, khung giờ, học sinh) gọi lần lượt `updateClassBasicInfo`, `updateClassTeachers`, `updateClassSchedule`, `updateClassStudents` thay vì một `updateClass` chung.
- FE `/admin/classes`: thêm phân trang theo `page` query param (Trước/Sau), reset `page=1` khi đổi search/type, đồng bộ lại `page` từ `meta.page` backend và hiển thị phạm vi kết quả hiện tại.
- FE `/admin/classes/:id`: nút `+ Thêm buổi học` ở tab Lịch sử đã mở popup form tạo session (ngày học, gia sư, thời gian, ghi chú, điểm danh học sinh) và submit qua `POST /sessions`.
- FE `/admin/classes/:id`: thay dữ liệu học sinh mock bằng dữ liệu thật `students` từ `GET /class/:id` để hiển thị bảng học sinh và làm nguồn điểm danh trong popup.
- BE `GET /class/:id`: trả thêm `students` (id, fullName, status, remainingSessions) lấy từ `student_classes` + `student_info`.
- FE popup thêm session: siết validation độ dài ghi chú (`notes`, `attendance.notes`) và chuẩn hóa thông báo lỗi theo hướng generic để tránh lộ lỗi nội bộ từ backend.
- Cập nhật `.env.example`: thêm 3 nhóm tài liệu (CODEFORCES_GROUP_LUYEN_TAP, CODEFORCES_GROUP_KHAO_SAT, CODEFORCES_GROUP_THUC_CHIEN) và 3 website (CODEFORCES_WEBSITE_LUYEN_TAP, CODEFORCES_WEBSITE_KHAO_SAT, CODEFORCES_WEBSITE_THUC_CHIEN).
- FE `/admin/notes-subject`: harden phần render bài Quy định bằng sanitize HTML trước khi `dangerouslySetInnerHTML`; popup tutorial xử lý rõ trạng thái lỗi tải dữ liệu và tránh reset form khi React Query refetch trong lúc đang nhập.
- FE `/admin/notes-subject`: redesign layout theo chuẩn các trang admin khác (wrapper có margin, border, surface card); tab Tài liệu cập nhật tương tác tutorial thành 2 mode: view-mode khi bấm vào dòng bài, edit-mode khi bấm nút `Chỉnh sửa`.
- FE `/admin/staff/:id`: bảng "Lớp phụ trách" đã render dữ liệu `classAllowance` từ API (Tổng nhận / Chưa nhận / Đã nhận) theo từng lớp thay cho giá trị hardcode 0.
- FE: thêm API client `session.api.ts` + DTO `session.dto.ts`; tái sử dụng component `SessionHistoryTable` để hiển thị lịch sử session ở cả `/admin/classes/:id` và `/admin/staff/:id`.
- FE `/admin/classes/:id`: tab Lịch sử đã lấy dữ liệu thật từ `GET /sessions/class/:classId?month=&year=` (TanStack Query), lọc theo tháng ở backend và hiển thị trạng thái timeline (Đã hoàn thành/Đã lên lịch).
- FE `/admin/staff/:id`: thêm card riêng "Lịch sử buổi học" dùng `GET /sessions/staff/:staffId?month=&year=` với điều hướng tháng (prev/next).
- FE `/admin/staff/:id`: phần Tổng tháng/Chưa nhận/Đã nhận và Tổng năm đã dùng dữ liệu thật từ session API (tháng hiện chọn + tổng hợp 12 tháng trong năm).
- FE admin detail pages (`/admin/classes/:id`, `/admin/staff/:id`): thay trạng thái loading text bằng skeleton loading cho bảng lịch sử session và phần khung chi tiết.
- FE `SessionHistoryTableSkeleton`: chuẩn hoá conditional rendering theo `entityMode`; bỏ phụ thuộc vào cờ hiển thị riêng để tránh lệch cột/header khi đổi mode.
- BE `CodeforcesService`: thay cơ chế gọi Codeforces API từ `https.get` sang `@nestjs/axios` (`HttpService.axiosRef`) để đồng bộ HTTP client trong backend và đơn giản hoá parsing response JSON.
- BE `sessions`: cập nhật DTO create/update theo shape attendance từ FE (không yêu cầu `sessionId`/`attendance.id` trong payload), parse/validate date-time rõ ràng hơn, và update attendance theo cơ chế sync (upsert + delete bản ghi không còn trong payload) thay vì xóa toàn bộ rồi tạo lại.

### Fixed

- Docker Compose production: pin `api.PORT=4000` và `web.PORT=3000` ngay trong `docker-compose.prod.yml` vì cả hai service cùng dùng chung `.env`; tránh việc `PORT=4000` của backend override Next.js khiến container `web` listen ở `4000` còn Nginx vẫn proxy sang `web:3000` và phát sinh 502.
- Nginx (`nginx/conf.d/app.conf`): thêm exact-match redirect `location = /api { return 301 /api/; }` để `GET /api` không rơi xuống `location /` và trả HTML của Next.js; với proxy đang strip prefix, verify backend bằng `GET /api/` (kỳ vọng `Hello World!`) hoặc mở Swagger tại `/api/api`.
- Nginx (`nginx/conf.d/app.conf`): bỏ khối `upstream` tĩnh, dùng `resolver 127.0.0.11` + `proxy_pass` qua biến (`web`/`api`) để Docker DNS cập nhật IP sau khi recreate container — tránh 502 `connect() failed (111: Connection refused)` tới IP cũ (ví dụ `172.18.0.3:3000`). `server_name` đổi thành `_` để truy cập bằng IP không bị lệch virtual host.
- Docker API: copy `prisma.config.ts` vào image production (cùng `WORKDIR /app`). Prisma 7 lấy `datasource.url` từ file này (`process.env.DATABASE_URL`); thiếu file khiến `prisma migrate deploy` trên VPS báo `The datasource.url property is required in your Prisma config file` dù đã có `--schema`.
- Docker API/Web: sau khi `COPY` vào image, chạy `chown -R appuser:appgroup /app` để tiến trình không-root ghi được dưới `node_modules` (Prisma cần ghi thư mục `@prisma/engines`). Tránh lỗi deploy `Can't write to ... @prisma/engines please make sure you install "prisma" with the right permissions`.
- FE popup xem tutorial Codeforces (`ProblemTutorialPopup`): HTML từ TipTap được chuyển sang chuỗi markdown trước `react-markdown` + KaTeX (`lib/tutorial-markdown.ts`), không còn hiển thị literal thẻ `<p>` / `</p>` khi xem nội dung đã lưu dạng HTML.
- FE `/admin/lesson-plans`: sửa type error của `LessonWorkQuickFilters`/output detail để `pnpm --filter web exec tsc --noEmit` pass lại; form chi tiết output giờ chỉnh sửa được cả output chưa gắn task; title cell ở tab **Công việc** và **Bài tập** trở thành link focus được bằng bàn phím; form **Thêm bài mới** hỗ trợ đủ Level `0`–`5`.
- BE `GET /lesson-work`: gộp summary counts theo `groupBy(status)` thay cho nhiều lần `count` lặp lại; bổ sung index cho `lesson_outputs` theo `date`, `(status, date)`, `(staff_id, date)`, `updated_at`; `PATCH /lesson-outputs/:id` giờ chấp nhận `lessonTaskId: null` để detach output khỏi task.
- BE: xóa `console.log(month, year)` debug trong `SessionController` để tránh log nhiễu ở môi trường runtime.
- BE: đăng ký lại `CodeforcesModule` và `CfProblemTutorialModule` trong `AppModule` để các endpoint Codeforces/tutorial hoạt động ổn định sau merge.
- BE `GET /staff/:id`: sửa truy vấn tổng hợp `classAllowance` dùng đúng `staff id` động thay cho teacher id hardcode; đồng thời trả `404` khi không tìm thấy staff.
- BE `sessions`: controller đã forward đủ `month/year` cho cả endpoint class/staff; service validate `month/year` và sửa date-range theo chuẩn `[startOfMonth, startOfNextMonth)` để không mất dữ liệu ngày cuối tháng.
- BE `sessions`: thêm validate attendance payload để trả lỗi 400 cho dữ liệu không hợp lệ/`studentId` trùng lặp thay vì phát sinh lỗi runtime.
- BE `sessions`: siết validate định dạng `startTime`/`endTime` theo `HH:mm` hoặc `HH:mm:ss` để chặn giá trị giờ/phút/giây ngoài phạm vi hợp lệ.

---

## [0.0.0] – Khởi tạo

- Changelog và rule ghi log trước khi push.
