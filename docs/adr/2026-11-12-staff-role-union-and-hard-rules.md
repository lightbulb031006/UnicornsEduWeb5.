# ADR: Hợp quyền role nhân sự + hai luật cứng chỉ Admin được miễn

> **Ghi chú đổi tên (#268):** role `assistant` (Trợ lí) nay là `sale_customer_care_head` — **Trưởng phòng Sale & CSKH**; `RegulationAudience.staff_assistant` → `staff_sale_customer_care_head`. Đổi tên tại chỗ bằng `ALTER TYPE … RENAME VALUE`, quyền không đổi. Nội dung bên dưới giữ nguyên tên cũ như bối cảnh lúc ra quyết định.

## Context

Biên bản họp 12/11/2026 (`docs/meetings/2026-11-12-bien-ban.md`) chốt mô hình role theo công ty: một người có thể kiêm nhiều role (vd Trưởng phòng Sale & CSKH kiêm gia sư). Trước ticket #265:

- Mỗi module tự viết `hasAnyRole` / `hasAnyStaffRole` riêng.
- Trưởng phòng Sale & CSKH (role `assistant`, vào được route admin nhờ `AllowAssistantOnAdminRoutes`) **giao được role Admin/trưởng** cho người khác và **tự thêm role cho chính mình** qua `POST/PATCH /staff`, `POST/PATCH /users`.
- Người có quyền ghi lương/thưởng/trợ cấp/trạng thái thanh toán (trưởng phòng, kế toán chi…) **tự sửa được khoản của chính mình**.

## Decision

Một module chung `apps/api/src/common/staff-role-policy.ts`:

- **Hợp quyền:** `hasAnyStaffRole(roles, allowed)` là predicate chung; người kiêm nhiều role được hợp quyền, mỗi việc áp quyền của role cao nhất liên quan.
- **Luật 1 — không tự sửa lương của mình** (`assertNotEditingOwnCompensation` / `assertActorNotEditingOwnCompensation`): áp ở service, không ở controller, để mọi đường gọi đều bị chặn. Phạm vi: thưởng, trợ cấp thêm (kể cả bulk trạng thái), payable lương cứng, mức đè lương cứng, pay-all / pay-selected / pay-deposit, % khấu trừ vận hành theo lớp, lương/% gia sư của lớp (`PATCH /class/:id/teachers` chỉ chặn khi dòng của chính mình đổi hoặc tự thêm mình; `teacher-compensation`, thêm gia sư), bulk trạng thái thanh toán buổi dạy / output giáo án / hoa hồng CSKH / hoa hồng trợ lí / Trưởng ban Đào tạo, % lợi nhuận CSKH.
- **Luật 2 — role trưởng/Admin chỉ Admin quản lý** (`assertStaffRoleChangeAllowed`, `assertUserRoleTypeChangeAllowed`): không tự thêm role cho mình (tự bỏ bớt role thường vẫn được); thêm **hoặc thu hồi** `PRIVILEGED_STAFF_ROLES` = Admin, Trưởng phòng Sale & CSKH, Trưởng ban Đào tạo, Trưởng ban Giáo án chỉ Admin làm; đổi loại tài khoản sang/khỏi `admin` chỉ Admin làm. Gắn hồ sơ nhân sự sang user khác tính như giao toàn bộ role của hồ sơ.
- **Admin** = `users.role_type = admin` hoặc staff mang role `admin`. Gọi nội bộ không có `userId` (job, script) không bị chặn.
- **Ngoại lệ có chủ đích:** luồng tự khai `/users/me/staff-bonuses` và `/users/me/staff-extra-allowances` (ép trạng thái chờ thanh toán, chỉ sửa khi chưa trả) truyền `allowSelf: true`. Cùng khuôn: **tự khai chi phí giáo án** — người nhận thanh toán output tự chọn bậc độ khó / level / hạng mục khi output chưa thanh toán (chốt trong buổi grill sau #279, thay cho chặn 403 của #279).

## Consequences

- Một nơi quyết định; thêm role trưởng mới chỉ sửa `PRIVILEGED_STAFF_ROLES`.
- Mỗi lệnh ghi lương thêm một truy vấn tra actor (`users` + `staff_info`) — rẻ, chấp nhận.
- Thứ tự ưu tiên access mode ở trang lớp (`resolveClassViewAccessMode`: admin → teacher → customer_care → training_manager) **chưa** là hợp quyền; để #275–#277 xử lý cùng logic sửa buổi.
  - **Cập nhật #275:** quyền thao tác trên lớp nay là hợp quyền. `resolveClassAccess` trả thêm cờ `isAdmin` / `isClassTeacher` / `isClassManager`, `resolveClassWorkAccess` dùng cho mọi đường ghi (buổi, lịch, buổi bù, khảo sát lớp). `mode` giữ thứ tự cũ nhưng chỉ chọn cách redact dữ liệu xem (người kiêm gia sư + Quản lý lớp thấy buổi của gia sư khác theo góc nhìn Quản lý lớp, buổi của mình đủ trường). Luật 1 vẫn áp: `lockedTeacherId` khoá dòng lương gia sư của chính Quản lý lớp, và `PUT /sessions/:id` gọi `assertActorNotEditingOwnCompensation` khi đổi trường lương.
  - **Cập nhật #276:** «lương của chính mình» với Quản lý lớp kiêm gia sư gồm cả mức mặc định của lớp mà dòng của mình đang kế thừa (trợ cấp / HS, scale) và trần trợ cấp — `assertTeacherPayUpdateExcludesOwnPay` chặn ở `PATCH /staff-ops/classes/:id/teacher-pay`. % trợ cấp quản lý lớp chỉ Admin (`class-manager-allowance-policy.ts`).
  - **Cập nhật #277:** thêm access mode `training_head` (cuối thứ tự, chỉ khi không khớp nhánh nào) để Trưởng ban Đào tạo **xem** mọi lớp — mode riêng thay vì dùng lại `training_manager` để chấm bài / in đề (chỉ nhận admin/teacher/training_manager) không tự mở. Cờ `isTrainingHead` hợp với `isClassManager` qua `seesClassAsTrainingManager` cho phần redact. Quyền ghi mở qua predicate: `canManageClassTeachersAndPay` (thêm Trưởng ban, vẫn `lockedTeacherId` = chính mình) và `canAssignClassManager` (Admin + Trưởng ban). `resolveClassWorkAccess` **không** đổi — Trưởng ban chỉ làm việc gia sư trên lớp mình quản lý.
- Service mới ghi lương phải gọi `assertActorNotEditingOwnCompensation`; review code cần kiểm tra.
