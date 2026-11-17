# Training tutors API (Ban Đào Tạo xem hồ sơ gia sư)

Module: `apps/api/src/training-tutor/`. Controller `@Controller('training/tutors')`, `@Roles(UserRole.staff, UserRole.admin)`.

## Quyền

`TrainingTutorService.assertTrainingViewer`:

- `roleType=admin` → qua.
- `roleType=staff` → `staffInfo` theo `userId` phải có role `training` hoặc `training_head` (`hasTrainingAccess`) **và** `status=active`; ngược lại `403`.

"Gia sư" = `staff_info.roles` có `teacher`, mọi trạng thái. Với Ban Đào Tạo thường, staff chỉ có role vận hành (không `teacher`) → `404` ở endpoint chi tiết, không xuất hiện ở danh sách.

**Phạm vi Trưởng ban Đào tạo** (#278, `resolveTrainingViewer` → `canViewAllStaff`): staff có `training_head` (và admin) mở được `GET /training/tutors/:id`, `/sessions`, `/achievements` của **nhân sự ba nhóm** — người mang ít nhất một role `teacher`, `lesson_plan` hoặc `training` (`TRAINING_TEAM_WHERE`) — và dùng `scope=all` ở danh sách. Nhân sự ngoài ba nhóm → `404`. Cùng allowlist field — không thêm thông tin cá nhân hay thu nhập.

**Role trả về:** với người xem không phải admin, `roles` chỉ gồm `teacher` / `lesson_plan` / `training` (`pickTrainingTeamRoles`); role khác của người kiêm nhiệm bị lọc khỏi response. Admin vẫn thấy đủ role.

**Cấp dưới** (`isTrainingHeadSubordinate` trong `staff/training-head-role-policy.ts`): thuộc ba nhóm, không phải chính Trưởng ban, không phải tài khoản `role_type=admin`, không mang `admin` hay role trưởng nào (`PRIVILEGED_STAFF_ROLES`: `sale_customer_care_head`, `training_head`, `lesson_plan_head`). Người ba nhóm kiêm role trưởng vẫn hiện trong danh sách nhưng chỉ đọc.

## Field allowlist

Service dùng `select` tường minh (`TUTOR_SUMMARY_SELECT`), không `include`, nên cột mới thêm vào `staff_info` / `users` không tự lộ ra.

| Trả về | Không bao giờ trả |
| --- | --- |
| `id`, `fullName`, `status`, `roles` (role nhân sự, không phải PII), `avatarUrl` (signed 1h), `university`, `highSchool`, `achievementCount` | `email`, `phone`, CCCD (số/ngày/nơi cấp), `ethnicity`, `gender`, `birthDate`, `currentAddress`, `bankAccount`, `bankQrLink`, `googleMeetLink`, `revenueSharePercent`, mọi field tiền / trạng thái thanh toán |

Ngoại lệ có kiểm soát cho Trưởng ban (#278): chi tiết của **cấp dưới** thêm `management.lastName`, `management.firstName` (để sửa họ tên) và `management.googleMeetLink` (xem + tạo lại). Không cấp dưới → không có các field này.

### `management` (chỉ khi người xem là Trưởng ban Đào tạo)

`buildTrainingHeadManagement` gắn vào mỗi dòng danh sách và chi tiết:

```json
{
  "isSubordinate": true,
  "hasOtherRoles": false,
  "accountLocked": false,
  "permissions": {
    "canEditRoles": true,
    "canEditProfile": true,
    "canChangeStatus": true,
    "canLockAccount": true,
    "canEditAccountHandle": true,
    "canManageMeetLink": true,
    "canViewBonuses": true
  }
}
```

- `hasOtherRoles`: target còn role ngoài ba nhóm (không lộ role đó là gì).
- `accountLocked`: `users.status = inactive`; `null` khi không phải cấp dưới hoặc chưa có tài khoản.
- `canChangeStatus` / `canLockAccount`: chỉ khi target **chỉ** mang role ba nhóm; `canLockAccount` cần thêm có tài khoản.
- `canEditAccountHandle` (16/11): cùng điều kiện `canLockAccount`. Chi tiết (`GET /training/tutors/:id`) trả thêm `management.accountHandle` (`null` nếu không phải cấp dưới).
- Admin hoặc Ban Đào Tạo thường: không có `management`.

Test: `training-tutor.service.spec.ts` mock Prisma trả row có cả field nhạy cảm và khẳng định output + `select` không chứa chúng.

## Endpoints

### `GET /training/tutors`

Query: `search?` (họ tên, tối đa 5 token), `status?` (`active|inactive`), `scope?` (`tutors` mặc định = staff có `teacher`; `all` = nhân sự ba nhóm `teacher`/`lesson_plan`/`training`, chỉ Trưởng ban/admin — Ban Đào Tạo thường `403`), `role?` (`teacher|lesson_plan|training`, chỉ có tác dụng với `scope=all`: thu hẹp về người mang role đó; giá trị khác `400`; bị bỏ qua ở `scope=tutors`), `page?` (mặc định 1), `limit?` (mặc định 20, tối đa 100).

```json
{ "data": [TrainingTutorListItemDto], "meta": { "total": 0, "page": 1, "limit": 20 } }
```

`TrainingTutorListItemDto` = `TrainingTutorSummaryDto` + `currentClasses` (`{ id, name }[]`, Lớp đang dạy — cùng quy tắc với endpoint chi tiết).

Sắp xếp: `status` (active trước), rồi `first_name`.

### `GET /training/tutors/:id`

`TrainingTutorSummaryDto` + `currentClasses`, `pastClasses` (`{ id, name }[]`), `taughtSessionCount`.

- **Đang dạy:** `class_teachers.status` là `null` hoặc `active` **và** `classes.status = running`.
- **Đã nghỉ** (`pastClasses`, UI «Lớp đã nghỉ»): mọi phân công còn lại — lớp từng dạy nay không còn dạy, không phân biệt lý do (gia sư nghỉ lớp hay lớp kết thúc).

Hàm chia dùng chung: `splitTutorClasses` trong `training-tutor.service.ts`.

### `GET /training/tutors/:id/sessions`

Query `page`, `limit`. Mỗi buổi: `id`, `date`, `startTime`, `endTime`, `class { id, name }`. Sắp xếp mới nhất trước. Không select `allowanceAmount`, `teacherPaymentStatus`, `trainingManager*`, `tuitionFee`, `coefficient`, `googleMeetLink`.

### `GET /training/tutors/:id/achievements`

Danh sách thành tích theo thứ tự hồ sơ — thành tích nổi bật (`isHighlight: true`) đứng đầu (reuse `AchievementService.listStaffAchievements`). Web dùng qua `AchievementOwnerRef { kind: "staff", mode: "training", staffId }`.

### Sửa thành tích (Ban Đào Tạo)

ADR `docs/adr/2026-11-11-staff-achievement-star-first.md`. Cùng phạm vi với xem: `training` sửa gia sư (`teacher`), `training_head` / admin sửa nhân sự ba nhóm (#278); ngoài phạm vi → `404`. Target là hồ sơ của chính người gọi → `403` (sửa ở `/users/me/achievements`). Không bị ràng buộc minh chứng (giống admin). Mọi thay đổi trừ reorder ghi `action_history` `entityType=staff_achievement`.

| Method | Path | Body | Ghi chú |
| --- | --- | --- | --- |
| `POST` | `/training/tutors/:id/achievements` | multipart `title`, `image?` | Ảnh tuỳ chọn; không tự gắn sao |
| `PATCH` | `/training/tutors/:id/achievements/:achievementId` | `{ title }` | |
| `DELETE` | `/training/tutors/:id/achievements/:achievementId` | — | Xoá dòng có sao không tự chọn sao mới |
| `PUT` | `/training/tutors/:id/achievements/reorder` | `{ orderedIds }` | Full permutation; dòng có sao ghim đầu |
| `PUT` | `/training/tutors/:id/achievements/:achievementId/highlight` | — | Dòng chưa có ảnh vẫn gắn sao được |
| `POST` | `/training/tutors/:id/achievements/:achievementId/image` | multipart `image` | Tải/thay ảnh |
| `DELETE` | `/training/tutors/:id/achievements/:achievementId/image` | — | Gỡ ảnh, kể cả dòng có sao |

Trả về giống `/staff/:staffId/achievements/*` (`AchievementDto` / danh sách). Web: `StaffAchievementsDialog` `editable` (tắt khi target là chính người xem) → `AchievementListEditor` `mode="training"`.

## Chỉnh role nhân sự (Trưởng ban Đào tạo)

### `PATCH /staff/:id/training-roles`

Module `apps/api/src/staff/` (`StaffController.updateStaffTrainingRoles`), `@Roles(UserRole.staff)`. Body `{ "roles": StaffRole[] }` = **trạng thái đích** của 3 role quản lý được (`teacher`, `lesson_plan`, `training`). Trả `{ id, roles }`.

Policy thuần `planTrainingHeadRoleChange` (`staff/training-head-role-policy.ts`):

| Điều kiện | Kết quả |
| --- | --- |
| Người gọi không phải staff `active` có `training_head` | `403` |
| Target là chính người gọi | `403` |
| Target có `admin`, `sale_customer_care_head`, `training_head` hoặc `lesson_plan_head`, hoặc là tài khoản `users.role_type = admin` | `403` |
| Body chứa role ngoài 3 role trên | `403` |
| Kết quả không còn role nào | `400` |
| Target không tồn tại | `404` |

- Role khác của target (vd `sale`, `customer_care`) giữ nguyên, giữ thứ tự cũ; role bật thêm nối cuối. Target `inactive` vẫn chỉnh được.
- Không đổi gì → trả ngay, không ghi DB.
- Trong 1 transaction: cập nhật `staff_info.roles`, ghi `action_history` (`entityType=staff`, before/after `{ roles }`). Có role bị tắt → `FixedSalarySettingsService.syncStaffRoleOverridesInTx` xoá **mức đè lương cứng** của role đó (ghi lịch sử riêng). Không cascade sang lớp / buổi / phân công.
- Sau commit: invalidate cache auth identity của user target để quyền mới có hiệu lực ngay.

Trả `{ id, roles }` với `roles` chỉ gồm ba role nhóm (#278).

Web: `updateStaffTrainingRoles` trong `lib/apis/training-tutor.api.ts`; nút hiện theo `management.permissions.canEditRoles` từ backend; `lib/training-head-roles.ts` giữ helper khớp policy (`lesson_plan_head` là role được bảo vệ; `hasAnyRoleAfterChange` tính cả `hasOtherRoles`).

### `GET /training/tutors/role-candidates` (follow-up 13/11 mục 2.2)

Ứng viên để Trưởng ban Đào tạo bật role cho nhân sự **ngoài ba nhóm** (vd CSKH thuần). `TrainingTutorController.listRoleCandidates`, khai báo trước `:id`. Query: `page`, `limit`, `search` (tên).

| Điều kiện | Kết quả |
| --- | --- |
| Người gọi không phải staff `active` có `training_head` (kể cả Admin không mang role này) | `403` |
| Còn lại | `200 { data: [{ id, fullName, roles }], meta: { total, page, limit } }` |

- Lọc: `staff_info.status = active`; không mang `teacher` / `lesson_plan` / `training`; không mang `admin` / role trưởng (`sale_customer_care_head`, `training_head`, `lesson_plan_head`); tài khoản không phải `role_type = admin`; không phải chính người gọi. Sắp theo tên.
- Chỉ trả họ tên + **mọi role hiện có** (để Trưởng ban biết người đó đang làm gì); không email, SĐT, ảnh, giấy tờ, thu nhập.
- Bật role vẫn qua `PATCH /staff/:id/training-roles` (policy không yêu cầu đích thuộc ba nhóm).
- Đối xứng: Trưởng phòng Sale & CSKH dùng `GET /sale-cs-team/members?scope=candidates` (#271).

Web: `listTrainingRoleCandidates` (`lib/apis/training-tutor.api.ts`, key `trainingTutorKeys.roleCandidates`), popup `TrainingRoleCandidatePicker`.

## Trưởng ban Đào tạo quản lý cấp dưới (#278)

Chỉ staff `active` có `training_head` (`resolveHead`); admin không mang role này → `403` (dùng route admin). Target không tồn tại → `404`. Mọi route kiểm tra policy trong `staff/training-head-role-policy.ts`; không mở route admin nào.

| Method | Path | Body / Query | Policy | Ghi chú |
| --- | --- | --- | --- | --- |
| `GET` | `/training/tutors/:id/bonuses` | `month?` (`YYYY-MM`) | `assertTrainingHeadSubordinate` | **Chỉ xem**: `{ id, workType, amount, status, note, month, date }[]`, mới nhất trước. Không có route tạo/sửa/xoá thưởng |
| `PATCH` | `/training/tutors/:id/professional-profile` | `{ lastName?, firstName?, university?, highSchool? }` | `assertTrainingHeadSubordinate` | Tên rỗng → `400`; đổi họ tên cần tài khoản (`400`). Ghi `action_history` |
| `POST` | `/training/tutors/:id/avatar` | multipart `avatar` (JPG/PNG/WebP ≤ 5 MB) | `assertTrainingHeadSubordinate` | Thay ảnh đại diện (storage qua helper chung `uploadUserAvatarFiles`) |
| `PATCH` | `/training/tutors/:id/status` | `{ status: "active" \| "inactive", reason? }` | `assertTrainingHeadCanChangeStatus` | Qua `StaffService.updateStaffStatus` (cùng hiệu ứng với admin: gỡ lịch dạy sắp tới khi nghỉ) |
| `PATCH` | `/training/tutors/:id/account-status` | `{ locked: boolean }` | `assertTrainingHeadCanLockAccount` | Đổi `users.status`; chưa có tài khoản → `400`; ghi `action_history`; invalidate cache auth |
| `PATCH` | `/training/tutors/:id/account-handle` | `{ accountHandle }` | `assertTrainingHeadCanChangeAccountHandle` | 16/11: đổi tên đăng nhập (3–50 ký tự, không khoảng trắng / `@`, không trùng); chưa có tài khoản / sai / trùng → `400`; ghi `action_history`; invalidate cache auth; không đăng xuất thiết bị. Trả `{ id, accountHandle }` |

Từ chối (`403`): target là chính mình; target là Admin / tài khoản admin / mang role trưởng; target ngoài ba nhóm. Đổi trạng thái, khoá tài khoản và đổi tên đăng nhập thêm điều kiện target **chỉ** mang role ba nhóm — kiêm `sale`, `customer_care`… → `403`.

Không có route sửa thông tin cá nhân (liên hệ, CCCD, ngân hàng) hay xem thu nhập cá nhân; lịch sử buổi giữ nguyên `GET /training/tutors/:id/sessions` (không tiền). Lớp phụ trách = `currentClasses` / `pastClasses`.

### Tạo nhân sự (14/11)

Trưởng ban Đào tạo (và Trưởng ban Chuyên môn, Trưởng phòng Sale & CSKH) gọi `POST /users/staff` (15/11): tạo **tài khoản mới + hồ sơ** trong một form, không gắn vào user có sẵn (`POST /staff` / `GET /staff/assignable-users` chỉ Admin). Role gán: mọi role trừ Admin / role trưởng; không đặt %. Web: nút **Tạo nhân sự** ở `TrainingStaffList` (chỉ Trưởng ban). Chi tiết: `docs/pages/admin.md`.

### Trợ cấp, Dạy thử, Học thử của buổi (14/11)

`PATCH /staff-ops/sessions/:id/training-head` — Trưởng ban sửa tay trợ cấp, bật/tắt Dạy thử (hệ số `0|1`), tick / bỏ tick Học thử từng học sinh trên buổi **mọi lớp** (trừ buổi mình dạy). Luật + lỗi: xem `docs/pages/staff.md` (mục Data and API). Danh sách buổi qua `GET /staff-ops/classes/:id/sessions` trả lại `allowanceAmount`, `coefficient`, `teacherPaymentStatus` cho Trưởng ban.

### Link Meet

`POST /staff/:id/regenerate-meet-link` (`StaffService.assertCanRegenerateMeetLink`): được gọi bởi admin (`role_type` hoặc staff role `admin`), chính nhân sự đó, hoặc Trưởng ban Đào tạo `active` trên cấp dưới. Còn lại `403` (trước #278 mọi staff gọi được); target không có → `404`. Link hiện tại đọc từ `management.googleMeetLink` của chi tiết.

Web: hồ sơ ở route chung `/staff/staffs/[id]` (`HeadStaffDetailPage`), danh sách ở `/staff/staffs` (`TrainingStaffList`); route cũ `/staff/tutors` và `/staff/tutors/[id]` đã xoá. Bấm avatar / tên mở `TrainingTutorInfoDialog` (hồ sơ chuyên môn + ảnh, role ba nhóm, đã nghỉ, khoá đăng nhập, link Meet; một nút Lưu, có `ConfirmDialog`); card `TrainingTutorClassesCard` (lớp đang dạy / đã nghỉ), `TrainingTutorSessionsCard` (lịch sử buổi), `StaffBonusViewCard` (`source="training"`, thưởng chỉ đọc khi `canViewBonuses`). Mọi phần hiện theo `management.permissions`.
