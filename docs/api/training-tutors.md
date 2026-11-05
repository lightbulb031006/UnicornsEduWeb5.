# Training tutors API (Ban Đào Tạo xem hồ sơ gia sư)

Module: `apps/api/src/training-tutor/`. Controller `@Controller('training/tutors')`, `@Roles(UserRole.staff, UserRole.admin)`.

## Quyền

`TrainingTutorService.assertTrainingViewer`:

- `roleType=admin` → qua.
- `roleType=staff` → `staffInfo` theo `userId` phải có role `training` **và** `status=active`; ngược lại `403`.

"Gia sư" = `staff_info.roles` có `teacher`, mọi trạng thái. Staff chỉ có role vận hành (không `teacher`) → `404` ở endpoint chi tiết, không xuất hiện ở danh sách.

## Field allowlist

Service dùng `select` tường minh (`TUTOR_SUMMARY_SELECT`), không `include`, nên cột mới thêm vào `staff_info` / `users` không tự lộ ra.

| Trả về | Không bao giờ trả |
| --- | --- |
| `id`, `fullName`, `status`, `avatarUrl` (signed 1h), `university`, `highSchool`, `achievementCount` | `email`, `phone`, CCCD (số/ngày/nơi cấp), `ethnicity`, `gender`, `birthDate`, `currentAddress`, `bankAccount`, `bankQrLink`, `googleMeetLink`, `revenueSharePercent`, mọi field tiền / trạng thái thanh toán |

Test: `training-tutor.service.spec.ts` mock Prisma trả row có cả field nhạy cảm và khẳng định output + `select` không chứa chúng.

## Endpoints

### `GET /training/tutors`

Query: `search?` (họ tên, tối đa 5 token), `status?` (`active|inactive`), `page?` (mặc định 1), `limit?` (mặc định 20, tối đa 100).

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
