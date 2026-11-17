# ADR: Trang quản trị mặc định đóng; Trợ lí chỉ còn Học sinh, ví và Thông báo

> **Ghi chú đổi tên (#268):** role `assistant` (Trợ lí) nay là `sale_customer_care_head` — **Trưởng phòng Sale & CSKH**; `RegulationAudience.staff_assistant` → `staff_sale_customer_care_head`. Đổi tên tại chỗ bằng `ALTER TYPE … RENAME VALUE`, quyền không đổi. Nội dung bên dưới giữ nguyên tên cũ như bối cảnh lúc ra quyết định.

> **Ghi chú #271 (Trưởng phòng quản lý đội Sale & CSKH):** quyền quản lý đội đi qua module **staff-side** mới `/sale-cs-team` (`@Roles(UserRole.staff)`, policy `staff/sale-cs-head-role-policy.ts`), **không** mở thêm route admin nào cho Trưởng phòng — allowlist trong `admin-deny-by-default.spec.ts` giữ nguyên. Đồng thời thu hồi quyền đổi trạng thái thanh toán hoa hồng trưởng phòng (`assistant-commission`) của Trưởng phòng: chỉ Admin / Kế toán chi. Xem `docs/api/sale-cs-team.md`.

> **Ghi chú #272 (Thông tin lớp / Học phí lớp):** mở lại cho Trưởng phòng Sale & CSKH các route admin đọc lớp — `GET /class`, `GET /class/:id`, `GET /class/:id/students`, `GET /class/:id/makeup-events` (cùng Kế toán thu/chi) — và route sửa `PATCH /class/:id/tuition` (Học phí lớp, cùng Admin), `PATCH /class/:id/student-tuition` (học phí riêng học sinh, cùng Kế toán thu). Response lọc qua `resolveAdminClassFinanceView`: Trưởng phòng không thấy lương gia sư. Đồng thời vá lỗ `PATCH /class` (trước kế thừa Kế toán thu/chi từ cấp controller) và `basic-info` thành chỉ Admin. Allowlist trong `admin-deny-by-default.spec.ts` cập nhật theo. Xem `docs/api/class-info-tuition.md`.

> **Ghi chú #273 (thêm/bớt học sinh):** mở `PATCH /class/:id/students` cho Trưởng phòng Sale & CSKH (cùng `PATCH /student/:id/classes` đã có). Allowlist thêm `ClassController.updateClassStudents`; test từ chối mọi role khác (Quản lý lớp, Trưởng ban Đào tạo, Kế toán thu/chi, CSKH, gia sư). `POST /class` / `PATCH /class` có `student_ids` vẫn chỉ Admin (#274 mở `POST /class` cho Trưởng phòng, xem ghi chú dưới).

> **Ghi chú #274 (tạo lớp / sửa Thông tin lớp theo role):** mở `POST /class` (`ClassController.createClass`) và `PATCH /class/:id/basic-info` (`updateClassBasicInfo`) cho Trưởng ban Đào tạo và Trưởng phòng Sale & CSKH; mở cho Trưởng ban Đào tạo các route đọc lớp (`getClasses`, `getClassById`, `getStudentsByClassId`, `listMakeupEventsByClassId`, góc nhìn `expense` — không học phí) và `GET /staff/options` (`StaffController.searchStaffOptions`, tìm gia sư). Trường được gửi chặn theo role ở service (`class/class-write-field-policy.ts`, 403 liệt kê trường), không dựa vào guard. `POST /class/:id/end`, `DELETE /class/:id`, `PATCH /class`, cách thu học phí, lịch, gỡ gia sư vẫn chỉ Admin. Spec thêm `TRAINING_HEAD_ADMIN_ROUTE_ALLOWLIST` (quét mọi route admin Trưởng ban vào được; gồm cả `ClassTimelineController.list` và route Thông báo có từ trước) và test 403 kết thúc/xoá lớp cho mọi role trưởng/kế toán. Xem `docs/api/class-info-tuition.md`.

- **Status:** Accepted (#267)
- **Thay thế:** `docs/adr/2026-06-02-explicit-admin-mirror-rbac.md`

## Context

Biên bản họp 12/11/2026 «tái cấu trúc role theo mô hình công ty» (`docs/meetings/2026-11-12-bien-ban.md`) chốt Trợ lí (role `assistant`, Trưởng phòng Sale & CSKH) không còn là người vận hành thay Admin. Trước #267:

- `RolesGuard` cho `staff.assistant` qua mọi route `@Roles(UserRole.admin)` trừ khi route tự từ chối bằng `@AllowAssistantOnAdminRoutes(false)` — tức **mặc định mở**. Route admin mới quên khai báo là Trợ lí vào được.
- Trợ lí làm được gần như mọi việc của Admin: tài khoản, nhân sự, lớp, chi phí, thưởng, trợ cấp thêm, khấu trừ, thuế, lương cứng, quy định, khoá học, ngân hàng câu hỏi, xoá buổi, lịch tổng, lịch sử thao tác.
- Service tầng dưới (`hasSaleCsHeadAccess`, `COURSE_MANAGER_STAFF_ROLES`, guard xoá admin workspace…) cũng coi Trợ lí như Admin.

## Decision

**Route admin mặc định đóng.**

- `RolesGuard`: user `role_type = admin` (tier `full`) hoặc staff mang role `admin` luôn qua. Nếu `@Roles` có `UserRole.staff` thì mọi staff qua guard và service tự quyết. Ngoài ra staff chỉ qua khi role của họ nằm trong `@AllowStaffRolesOnAdminRoutes(...)` của handler (hoặc class); không khai báo = chỉ Admin.
- Decorator `AllowAssistantOnAdminRoutes` bị xoá. Muốn mở route admin cho Trợ lí phải liệt kê `SALE_CS_HEAD_ROLE` tường minh.
- Trợ lí chỉ được liệt kê ở:
  - **Học sinh** (`StudentController`, thành tích / thư viện ảnh học sinh): thêm, sửa, xoá, avatar, lịch thi, trạng thái, ghi danh lớp; chọn lớp (`GET /class`) và CSKH (`GET /staff/customer-care-options`) chỉ để đọc khi ghi danh.
  - **Tài khoản học sinh**: `POST /users/student`, `PATCH /users/:id/password` — service chặn đích không phải học sinh (`403` «Trợ lí chỉ được đặt mật khẩu cho tài khoản học sinh.»). Đăng xuất thiết bị học sinh (`DeviceController.forceLogout`, `getStudentDevices`).
  - **Ví học sinh**: rút/giảm số dư (`amount < 0`), tạo yêu cầu nạp, QR/SePay. Nạp số dương thẳng → `403` «Chỉ Admin được nạp thẳng tiền vào ví học sinh. Trợ lí hãy tạo yêu cầu nạp hoặc dùng QR.» Hàng đợi nạp (xem/duyệt) chỉ Admin.
  - **Thông báo**: tạo, sửa, đẩy, xoá thông báo của chính mình như người gửi thường (kiểm duyệt chỉ Admin theo #269).
- Mọi việc vận hành khác chỉ Admin: tài khoản (trừ tài khoản học sinh), nhân sự, lớp, chi phí, thưởng, trợ cấp thêm, khấu trừ, thuế, lương cứng, quy định (Trợ lí chỉ đọc bài dành cho role mình), khoá học, ngân hàng câu hỏi, nội dung lớp, xoá buổi, lịch tổng, lịch sử thao tác, giáo án, khảo sát, thanh toán hoa hồng CSKH.
- Service tầng dưới bỏ nhánh Trợ lí tương ứng (không chỉ dựa vào guard), để route `@Roles(staff)` cũng không lọt quyền.
- Web (`admin-shell-access`, `AdminSidebar`, `staff-shell-access`, `StaffSidebar`) chỉ hiện cho Trợ lí: **Học sinh** (ví nằm trong chi tiết học sinh), **Thông báo** và self route `/staff/assistant-detail`.
- Test `apps/api/src/auth/admin-deny-by-default.spec.ts` chạy `RolesGuard` thật trên metadata thật của **mọi** controller với Trợ lí và so khớp danh sách route Trợ lí vào được với allowlist cố định. Thêm route vào allowlist phải đi kèm quyết định nghiệp vụ (sửa ADR này).

## Consequences

- Route admin mới an toàn mặc định: quên khai báo thì chỉ Admin vào, không lộ cho Trợ lí.
- Test allowlist fail khi có người mở thêm route admin cho Trợ lí — cố ý, buộc review.
- Trợ lí mất quyền vận hành lớp, nhân sự, lương; các việc này dồn về Admin. Người kiêm role (vd Trợ lí + kế toán) vẫn hợp quyền theo role còn lại.
- Giữ cho Trợ lí: xem CSKH phụ trách học sinh (`/staff/customer-care-detail/:id`, % lợi nhuận) và trang thu nhập Trợ lí của mình; trạng thái thanh toán hoa hồng CSKH chỉ Admin/kế toán.
- Enum `StaffRole.assistant` chưa đổi tên (#268).

## Addendum 14/11 — Trưởng phòng duyệt hàng chờ nạp thẳng

- Mở `StudentController.listStudentWalletDirectTopUpRequests`, `getStudentWalletDirectTopUpRequest`, `approveStudentWalletDirectTopUpRequestFromQueue` cho `staff.sale_customer_care_head` (allowlist trong `admin-deny-by-default.spec.ts`). Thay thế câu «Hàng đợi nạp (xem/duyệt) chỉ Admin» ở trên.
- Trưởng phòng duyệt được **mọi** yêu cầu, kể cả yêu cầu do chính mình tạo (quyết định nghiệp vụ 14/11, chấp nhận bỏ nguyên tắc 2 người). Dấu vết: note giao dịch ví ghi email người duyệt + action history ghi actor.
- Nạp số dương thẳng (`PATCH /student/update-student-account-balance`, `amount > 0`) vẫn chỉ Admin. Web: route `/staff/wallet-direct-topup-requests`; `/admin/wallet-direct-topup-requests` vẫn strict Admin.

## Addendum 15/11 — Role trưởng tạo nhân sự qua `POST /users/staff`

- `UserController.createStaffUser` (`POST /users/staff`) mở cho `sale_customer_care_head`, `training_head`, `lesson_plan_head` (`STAFF_CREATOR_HEAD_ROLES`): tạo **tài khoản mới + hồ sơ**; email / tên đăng nhập đã có (kể cả chưa xác thực) → `400`, nên không chiếm hay ghi đè tài khoản người khác.
- `StaffController.createStaff` (`POST /staff`) và `searchAssignableUsers` (`GET /staff/assignable-users`, trả email) **giữ Admin-only**. Bản 14/11 mở hai route này cho role trưởng (tìm email khớp đúng) đã thu hồi: gắn hồ sơ vào user có sẵn không phải luồng của role trưởng.
