# Database Schema – Unicorns Edu (apps/api)

Tài liệu này được tổng hợp trực tiếp từ Prisma schema tại `apps/api/prisma/schema/*.prisma`, dùng làm **context chuẩn cho model** khi làm việc với backend.

---

## 1) Công nghệ & nguồn schema

| Thành phần           | Giá trị                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| ORM                  | Prisma                                                                              |
| Database             | PostgreSQL                                                                          |
| Entry schema         | `apps/api/prisma/schema/schema.prisma`                                              |
| Mô hình dữ liệu      | `apps/api/prisma/schema/{user,people,learning,finance,content,lesson,enums}.prisma` |
| Prisma Client output | `apps/api/generated/`                                                               |

> `datasource db` dùng `provider = "postgresql"`.
> Legacy schema như `person_profiles` hoặc `users.person_profile_id` không còn thuộc database shape được hỗ trợ; nếu còn xuất hiện ở một môi trường nào đó thì phải được dọn bằng migration commit trong repo trước khi rollout API.

---

## 2) Danh sách bảng theo domain

### Auth

- `users`

### People

- `staff_info`
- `student_info`

### Learning

- `classes`
- `class_teachers`
- `student_classes`
- `sessions`
- `attendance`
- `cf_problem_tutorials` (tutorial theo bài Codeforces)

### Finance

- `bonuses`
- `role_tax_deduction_rates`
- `staff_tax_deduction_overrides`
- `wallet_transactions_history`
- `student_wallet_sepay_orders`
- `customer_care_service`
- `staff_monthly_stats`
- `extra_allowances`
- `dashboard_cache`
- `cost_extend`

### Content / Audit

- `class_surveys`
- `action_history`
- `documents`
- `notifications`
- `regulations`

### Lesson

- `staff_lesson_task`
- `lesson_task`
- `lesson_resources`
- `lesson_outputs`

---

## 3) Quan hệ chính (high-level)

- **User ↔ StudentInfo / StaffInfo**: quan hệ 1-0/1 qua `student_info.user_id` và `staff_info.user_id` (mỗi hồ sơ học sinh/nhân sự gắn tối đa một user, và mỗi user có tối đa một hồ sơ của từng loại).
- **Class ↔ StaffInfo**: N-N qua `class_teachers`.
- **Class ↔ StudentInfo**: N-N qua `student_classes`.
- **Session → Class**: N-1 (`sessions.class_id`).
- **Session → StaffInfo (teacher)**: N-1 (`sessions.teacher_id`, `onDelete: Restrict`).
- **Attendance**: bảng giao giữa `sessions` và `student_info`, unique `(session_id, student_id)`.
- **Bonus → StaffInfo**: N-1.
- **WalletTransactionsHistory → StudentInfo**: N-1.
- **WalletTransactionsHistory → StaffInfo (CustomerCareStaff)**: N-1 (relation name `CustomerCareStaff`).
- **StudentWalletSepayOrder → User (createdBy)**: optional FK `created_by_user_id`, `onDelete: SetNull`; lưu thêm email/role snapshot để audit khi tạo QR.
- **CustomerCareService**: liên kết `student_info` và `staff_info`.
- **StaffMonthlyStat → StaffInfo**: N-1.
- **ExtraAllowance → StaffInfo**: N-1.
- **ClassSurvey → Class / StaffInfo**: optional FK, `onDelete: SetNull`.
- **ActionHistory → User**: optional FK, `onDelete: SetNull`.
- **Notification → User (createdBy)**: optional FK `created_by_user_id`, `onDelete: SetNull`.
- **Regulation → User (createdBy / updatedBy)**: optional FK `created_by_user_id`, `updated_by_user_id`, `onDelete: SetNull`.
- **StaffLessonTask**: bảng giao giữa `staff_info` và `lesson_task`, unique `(staff_id, lesson_task_id)`; đây là nguồn assignment chính thức cho `nhân sự thực hiện giáo án`. Khi đọc data legacy, API có thể gộp thêm `lesson_task.created_by` và `lesson_outputs.staff_id` vào response để hiển thị, nhưng task edit sẽ chuẩn hóa lại về bảng này.
- **LessonTask → LessonResource**: 1-N optional (`lesson_resources.lessonTaskId`, `onDelete: SetNull`).
- **LessonTask → LessonOutput**: 1-N optional (`lesson_outputs.lesson_task_id`, `onDelete: SetNull`).
- **LessonOutput → StaffInfo**: optional FK, `onDelete: SetNull`; staff này là nhân sự nhận thanh toán / đứng tên output, không phải nhóm điều phối task.

---

## 4) Chi tiết model quan trọng

### 4.1 `users` (Auth core)

- PK: `id` (UUID default)
- Unique: `email`, `account_handle` (hai trường độc lập; login chấp nhận chuỗi tương ứng email hoặc account_handle, ưu tiên account_handle).
- Trường chính: `password_hash`, `role_type`, `status`, `email_verified`, `phone_verified`, `data_processing_consent_accepted_at`, `data_processing_consent_version`, `refresh_token`
- RBAC runtime: `role_type` là role gốc/default của user, không phải nguồn quyền duy nhất. `GET /auth/session` và backend guards resolve quyền hiệu lực bằng union của `users.role_type`, linked `staff_info.user_id`, linked `student_info.user_id`, và `staff_info.roles`; vì vậy một user có thể đồng thời mở admin/staff/student workspace nếu có các linked profile/role tương ứng.
- Trường tên canonical cho actor dạng staff: `first_name`, `last_name` (nullable). FE/BE dùng cặp này làm nguồn chuẩn để hiển thị tên staff trong rollout bỏ `staff_info.full_name`.
- Avatar:
  - `avatar_path` (`TEXT`, nullable): object path avatar trong bucket `avatars` theo format `users/{userId}/avatar`
- Quan hệ profile không nằm trên `users`; link authoritative được lưu ngược ở `student_info.user_id` và `staff_info.user_id`.
- Không còn field legacy `person_profile_id` trong schema được hỗ trợ.
- Index: `email`, `phone`, `account_handle`, `link_id`, `role_type`, `status`, `created_at`

### 4.2 `staff_info`

- **PK format:** `UNISTAFF-[0-9a-f]{10}` — ví dụ `UNISTAFF-1a2b3c4d5e`. Đây là **mã định danh hệ thống** ngắn cho nhân sự; migration `20260523110000_short_system_entity_ids` dùng `pgcrypto.gen_random_bytes(5)` để sinh ID mới cho dữ liệu hiện có, không cắt từ UUID cũ. Không còn dùng `@default(uuid())` trong Prisma cho PK này.
- Thông tin nhân sự: hồ sơ cá nhân, CCCD, ngân hàng, `roles` (`StaffRole[]` dạng Postgres enum array: `admin`, `teacher`, `lesson_plan`, `lesson_plan_head`, `accountant`, `accountant_income`, `accountant_expense`, `communication`, `technical`, `customer_care`, `training`, `assistant`), `status`
- `status` là trạng thái vận hành hồ sơ nhân sự: `active` = **Hoạt động**, `inactive` = **Ngừng hoạt động**. Chỉ staff `active` được resolve staff/admin-through-staff workspace và được chọn cho phân công mới (gia sư lớp, trợ lí quản lí CSKH, giáo án, trợ cấp thêm). Staff `inactive` vẫn giữ trong lịch sử, payroll và các bản ghi đã phát sinh.
- Khi hồ sơ nhân sự chuyển sang `inactive`, backend dừng các assignment vận hành đang mở: phân công gia sư-lớp hiện tại chuyển sang `inactive`, slot lịch cố định và buổi bù tương lai của nhân sự đó được dọn khỏi vận hành, liên kết CSKH đang chăm sóc bị gỡ. `users.status` không đổi.
- Index: unique B-tree `staff_info_user_id_key` trên `user_id` kèm **`INCLUDE ("id", "roles")`** (covering) để tối ưu các đọc theo `user_id` (auth/session, roles guard). Trong Prisma: `@@unique([userId], map: "staff_info_user_id_key")` trên model `StaffInfo` (phần `INCLUDE` chỉ có trong migration SQL, Prisma chưa có DSL tương ứng).
- Index: GIN trên `roles` cho lookup nhân sự theo role array.
- Không còn lưu cột tên riêng trong `staff_info` (đã bỏ `full_name`); tên staff canonical được đọc từ `users.first_name` + `users.last_name`. Một số API vẫn có thể trả `staffInfo.fullName` dưới dạng derived field để tương thích ngược.
- CCCD:
  - `cccd_number` (`TEXT`, nullable, unique): số CCCD 12 chữ số (rule validate ở BE/FE)
  - `ethnicity` (`TEXT`, nullable): dân tộc nhân sự
  - `gender` (`Gender`, nullable): giới tính nhân sự, dùng enum chung `male` / `female`
  - `current_address` (`TEXT`, nullable): địa chỉ hiện tại của nhân sự
  - `cccd_issued_date` (`DATE`, nullable): ngày cấp CCCD
  - `cccd_issued_place` (`TEXT`, nullable): nơi cấp CCCD
  - Không còn lưu `cccd_front_path`, `cccd_back_path`, `cccd_verified_at`; ảnh CCCD legacy trong bucket `id-cards` không được schema hoặc API hiện tại sử dụng.
- `google_meet_link` (`TEXT`, nullable): link Google Meet cố định của gia sư; là nguồn authoritative cho Meet link của tất cả lịch học và buổi bù mà gia sư này phụ trách. Được tạo tự động qua Google Calendar API lần đầu khi gia sư được gán vào lịch nếu chưa có; có thể regenerate thủ công qua `POST /staff/:id/regenerate-meet-link`.
- `personal_achievement_link` (`TEXT`, nullable): link Google Drive hoặc URL lưu trữ thành tích cá nhân của nhân sự. Không bắt buộc; chỉ accept URL hợp lệ dạng `http/https`. Hiển thị ở trang chi tiết nhân sự (admin + staff self-service) và cột bảng danh sách nhân sự.
- `customer_care_managed_by_staff_id` (nullable FK → `staff_info.id`): trỏ tới trợ lí quản lí CSKH này; trợ lí được hưởng 3% học phí đã học của học sinh thuộc CSKH quản lí. Index: `(customer_care_managed_by_staff_id)`
- Được tham chiếu bởi: `users`, `class_teachers`, `sessions`, `makeup_schedule_events`, `bonuses`, `lesson_outputs`, `customer_care_service`, `wallet_transactions_history` (customer care), `staff_monthly_stats`, `extra_allowances`, `class_surveys`, `staff_lesson_task`, `attendance` (assistant_manager)

### 4.3 `student_info`

- **PK format:** `UNIST-[0-9a-f]{10}` — ví dụ `UNIST-1a2b3c4d5e`. Đây là **mã định danh hệ thống** ngắn cho học sinh; migration `20260523110000_short_system_entity_ids` dùng `pgcrypto.gen_random_bytes(5)` để sinh ID mới cho dữ liệu hiện có, không cắt từ UUID cũ. Không còn dùng `@default(uuid())` trong Prisma cho PK này.
- Hồ sơ học viên: liên hệ phụ huynh (`parent_name`, `parent_phone`, `parent_email`), trạng thái, giới tính, mục tiêu
- `status` là trạng thái học tập của hồ sơ học sinh: `active` = **Đang học**, `inactive` = **Nghỉ học**. Chỉ học sinh `active` được resolve student workspace và được thêm vào roster/lớp mới. Khi chuyển sang `inactive`, backend chuyển các `student_classes` còn `active` của học sinh đó sang `inactive`; bật lại `active` không tự khôi phục các membership cũ.
- Chuyển học sinh sang `inactive` chỉ là trạng thái hồ sơ học tập; `users.status`, ví, công nợ và lịch sử học tập không bị xóa.
- `parent_email` là email nhận biên nhận nạp ví SePay của phụ huynh; không fallback sang email học sinh.
- `parent_receipt_email_enabled` (`BOOLEAN`, mặc định `true`): khi `false`, webhook SePay **không** gửi email biên lai nạp ví cho phụ huynh lẫn CSKH (ví vẫn được cộng bình thường).
- Được tham chiếu bởi: `users`, `student_classes`, `attendance`, `wallet_transactions_history`, `student_wallet_sepay_orders`, `customer_care_service`, `student_exam_schedules`

### 4.3.1 `student_exam_schedules`

- Lịch thi của từng học sinh; là nguồn authoritative cho event type `exam` trong aggregate calendar feed.
- Trường chính:
  - `student_id` (FK → `student_info.id`)
  - `exam_date` (`DATE`)
  - `note` (`TEXT`, nullable)
  - `created_at`, `updated_at`
- Index/constraint:
  - index trên `student_id`
  - index trên `exam_date`
- Ghi chú:
  - Mỗi record là 1 event all-day, không có `start/end time`
  - Admin và chính học sinh cập nhật qua các endpoint replace-all exam schedule list
  - Calendar aggregate có thể lọc theo `studentId` và map record này thành `type = exam`

### 4.4 `classes`

- **PK format:** `UNICL-[0-9a-f]{10}` — ví dụ `UNICL-1a2b3c4d5e`. Đây là **mã định danh hệ thống** ngắn cho lớp; migration `20260523110000_short_system_entity_ids` dùng `pgcrypto.gen_random_bytes(5)` để sinh ID mới cho dữ liệu hiện có, không cắt từ UUID cũ. Không còn dùng `@default(uuid())` trong Prisma cho PK này.
- Trường nghiệp vụ chính:
  - `type` (`ClassType`), `status` (`ClassStatus`)
  - `status`: `running` = lớp đang vận hành; `ended` = lớp đã kết thúc. Khi kết thúc lớp, backend xóa lịch cố định hiện tại, chuyển membership học sinh đang học và phân công gia sư đang mở sang `inactive`, đồng thời dọn buổi bù tương lai của lớp. Lịch sử session, attendance, ví và payroll đã phát sinh vẫn giữ nguyên.
  - `max_students`, `allowance_per_session_per_student`, `max_allowance_per_session`, `scale_amount`
  - `max_allowance_per_session` là nullable:
    - `null` hoặc `0` = không giới hạn trần trợ cấp theo buổi (aggregate SQL dùng `NULLIF(..., 0)`; API lưu `0` thành `null`)
    - số nguyên dương = áp trần đúng theo giá trị
  - `schedule` (JSONB): mảng các entry lịch học định kỳ theo tuần. Dữ liệu lưu DB đang giữ backward compatibility với key `to`; ở lớp DTO/API admin, field đầu ra dùng `end` nhưng khi persist vẫn map về `to`. Mỗi entry có cấu trúc lưu trữ:
    ```json
    {
      "id": "string (UUID)",
      "dayOfWeek": "number (0=Sunday, 6=Saturday)",
      "from": "string in HH:mm format (e.g., '19:00')",
      "to": "string in HH:mm format (e.g., '20:30')",
      "teacherId": "string? (UNISTAFF-[0-9a-f]{10} of the responsible tutor for this slot)",
      "calendarEventId": "string? (optional, stores Google Calendar recurring event ID)",
      "meetLink": "string? (optional, stores Google Meet link returned when recurring event is synced)",
      "createdAt": "string? (optional ISO timestamp when this schedule entry was created/activated)",
      "deletedAt": "string? (optional ISO timestamp when this schedule entry was deleted/deactivated)"
    }
    ```
    Mảng này định nghĩa mẫu lịch học lặp lại hàng tuần. Calendar admin có thể expand pattern này thành các occurrence để render lịch trong một khoảng ngày, và có thể đồng bộ từng entry thành recurring event trên Google Calendar.
  - Các trường học phí theo session/package
- Mối quan hệ: teachers, students, sessions, makeupScheduleEvents, surveys
- Bảng liên kết `class_teachers` (Class ↔ StaffInfo) ngoài `custom_allowance` còn có:
  - `status` (`TEXT`, nullable): `null` hoặc `active` được hiểu là phân công gia sư đang mở; `inactive` là **nghỉ dạy theo lớp**. Khi gia sư nghỉ dạy ở một lớp, record được giữ để bảo toàn lịch sử trợ cấp/payroll nhưng không còn là phân công hiện tại.
  - `tax_rate_percent` (`DECIMAL(5,2)`, default `0`, Prisma field `operatingDeductionRatePercent`): % **khấu trừ vận hành** của gia sư theo từng lớp.
  - FE đang dùng semantic `operating_deduction_rate_percent`; backend vẫn map về cột `tax_rate_percent` để tương thích dữ liệu hiện có.
- Ghi chú:
  - `calendarEventId` trong schedule được điền sau khi đồng bộ lên Google Calendar; dùng để cập nhật recurring event ở các lần sync sau.
  - `meetLink` trong schedule được điền cùng lúc với `calendarEventId` sau khi sync; API occurrence của `/admin/calendar/class-schedule` đọc lại field này để popup lịch mở được link lớp ngay sau khi refetch.
  - `teacherId` lưu gia sư chịu trách nhiệm của từng khung giờ. Từ luồng chỉnh lịch lớp, mỗi entry mới/cập nhật phải có `teacherId` và ID này phải thuộc `class_teachers` của chính lớp đó.
  - Khi API `PUT /admin/calendar/classes/:classId/schedule` nhận payload, mỗi entry dùng field `end`; backend sẽ map thành `to` trước khi lưu JSONB.

### 4.4.0 `student_classes` (Class ↔ StudentInfo)

- Bảng N-N: mỗi hàng là một học sinh thuộc một lớp.
- `status` (`StudentClassStatus`, nullable): trạng thái tham gia lớp của học sinh (`active | inactive`).
  - Runtime rule hiện tại: `null` được xử lý như `inactive` trong các luồng vận hành lớp (danh sách học sinh đang học, sĩ số, tạo buổi mới, validate attendance).
  - Khi thêm/tái thêm học sinh vào lớp qua API quản trị, backend luôn ghi `status = active`; khi bỏ khỏi danh sách lớp, backend chuyển `status = inactive` thay vì xóa bản ghi membership.
- Các cột override học phí (nullable int):
  - `custom_student_tuition_per_session`
  - `custom_tuition_package_total`
  - `custom_tuition_package_session`
- **Semantics thống nhất với backend:** giá trị `0` trên các cột override được xử lý như **không override** (kế thừa học phí/gói từ `classes`), tương đương `null` trong logic tính `effective*` và trong SQL aggregate dashboard (`NULLIF(..., 0)` trên các cột custom). Khi cập nhật danh sách học sinh lớp, API chuẩn hóa `0` → lưu `null` để tránh bản ghi “0” legacy chặn fallback.
- Index read path:
  - `student_id`
  - `class_id`
  - composite `(class_id, student_id)` (hot path cho validate roster/session update)
  - composite `(class_id, status, created_at)` (hot path cho danh sách roster theo lớp/trạng thái)
  - composite `(student_id, class_id)` (hot path cho membership lookups theo học sinh)

### 4.4.1 `makeup_schedule_events`

- Buổi dạy bù được tạo thủ công từ trang chi tiết lớp; mỗi record là **một buổi duy nhất**, không lặp lại.
- Trường chính:
  - `class_id` (FK → `classes.id`)
  - `teacher_id` (FK → `staff_info.id`)
  - `linked_session_id` (nullable FK → `sessions.id`) để back-reference nếu về sau có session thực hiện buổi bù
  - `date` (`DATE`)
  - `start_time`, `end_time` (`TIME`)
  - `baseline_schedule_entry_id` (`TEXT`, nullable) để tham chiếu slot cố định trong `Class.schedule` mà buổi bù dựa trên
  - `original_date` (`DATE`, nullable) để lưu ngày xảy ra buổi cố định bị học bù
  - `title` (`TEXT`, nullable)
  - `note` (`TEXT`, nullable)
  - `google_meet_link` (`TEXT`, nullable)
  - `google_calendar_event_id` (`TEXT`, nullable)
  - `calendar_synced_at` (`TIMESTAMPTZ`, nullable)
  - `calendar_sync_error` (`TEXT`, nullable)
- Quan hệ:
  - thuộc `classes`
  - thuộc `staff_info`
  - có thể liên kết ngược tới `sessions`
- Ghi chú:
  - Buổi bù không thay thế recurring slot trong `Class.schedule`; nó chỉ bổ sung thêm vào feed lịch.
  - Khi người dùng nhập **ngày gốc**, frontend có thể gửi chỉ `original_date` hoặc kèm `baseline_schedule_entry_id` nếu khớp cảnh báo chưa dạy. Nếu gửi cả hai, backend validate slot đó còn tồn tại trong `Class.schedule` và `original_date` khớp `dayOfWeek` của slot.
  - Lịch bù (bao gồm cả cảnh báo chưa dạy và lịch bù tạo thủ công) phải có ngày học lớn hơn hoặc bằng ngày tạo lớp học (`Class.createdAt`).
  - FE hiện quản lý CRUD buổi bù theo từng lớp tại `/admin/classes/:id` và `/staff/classes/:id`; calendar chỉ còn hiển thị aggregate event.
  - Backend sync one-off event này lên Google Calendar riêng, độc lập với recurring event của `Class.schedule`.
  - Buổi bù tương lai bị xóa khi lớp kết thúc hoặc khi gia sư phụ trách buổi đó nghỉ dạy/ngừng hoạt động; buổi đã qua vẫn là lịch sử vận hành.
  - Nếu xóa Google Calendar event bên ngoài thất bại, backend giữ lại record và `google_calendar_event_id`, cập nhật `calendar_sync_error`, rồi trả lỗi để có thể retry thay vì mất handle sync.

### 4.4.2 `missed_teaching_explanations`

- Lưu **giải trình vắng** cho buổi thuộc lịch cố định chưa được dạy (cảnh báo chưa dạy); tách khỏi `makeup_schedule_events.note`.
- Trường chính:
  - `class_id` (FK → `classes.id`)
  - `teacher_id` (FK → `staff_info.id`)
  - `baseline_schedule_entry_id` (`TEXT`) — slot cố định trong `Class.schedule`
  - `original_date` (`DATE`) — ngày buổi gốc bị lỡ
  - `reason` (`TEXT`, bắt buộc non-empty sau trim)
  - `explained_by_staff_id`, `explained_by_user_id` (`TEXT`, nullable) — audit người lưu giải trình
- Unique: `(class_id, baseline_schedule_entry_id, original_date)`
- Ghi chú:
  - Bắt buộc có bản ghi giải trình trước khi tạo `makeup_schedule_events` gắn cùng `baseline_schedule_entry_id` + `original_date`.
  - Cho phép sửa `reason` khi chưa có lịch bù tương ứng; khóa sau khi đã xếp bù.
  - Cảnh báo/giải trình chưa bù không còn hiển thị khi lớp `ended` hoặc gia sư nghỉ dạy theo lớp (filter ở API, không xóa record).

### 4.5 `sessions`

- Mỗi buổi học gắn với 1 lớp và 1 giáo viên
- Trường chính: ngày học, start/end time, `coefficient` (hệ số buổi học 0.0–1.0), `allowance_amount`, `teacher_payment_status`, `tuition_fee`
- `allowance_amount`: snapshot **trước hệ số** = tổng `(snapshot_per_student_allowance × số bản ghi điểm danh present/excused) + snapshot_scale_amount` (làm tròn VND theo logic API). Các truy vấn payroll **không** cộng thêm `classes.scale_amount` vào `allowance_amount`.
- `snapshot_per_student_allowance` (`INTEGER`, nullable): trợ cấp mỗi học sinh đã resolve (`class_teachers.custom_allowance` ?? `classes.allowance_per_session_per_student`) tại thời điểm **tạo** buổi học; không ghi đè sau đó.
- `snapshot_scale_amount` (`INTEGER`, nullable): `classes.scale_amount` tại thời điểm **tạo** buổi học; không ghi đè sau đó.
- Khi sửa điểm danh buổi chưa thanh toán (`teacher_payment_status = unpaid`), API tự tính lại `allowance_amount` từ hai snapshot trên. Buổi cũ không có snapshot (null) fallback đọc live từ `classes` / `class_teachers`.
- `max_allowance_per_session` không snapshot tại `sessions`; các aggregate payroll/report đọc động từ `classes.max_allowance_per_session` tại thời điểm query, nên thay đổi cấu hình lớp có thể ảnh hưởng kết quả historical aggregate.
- Snapshot khấu trừ theo buổi:
  - `teacher_tax_rate_percent` (`DECIMAL(5,2)`, default `0`, Prisma field `teacherOperatingDeductionRatePercent`): snapshot mức **khấu trừ vận hành** effective của cặp gia sư-lớp; trước thanh toán được refresh khi tạo/cập nhật session, khi chuyển sang `paid` được snapshot lại theo thời điểm thanh toán.
  - `teacher_tax_deduction_rate_percent` (`DECIMAL(5,2)`, default `0`, Prisma field `teacherTaxDeductionRatePercent`): snapshot mức **khấu trừ thuế** áp dụng cho khoản dạy học; trước thanh toán được refresh khi tạo/cập nhật session, khi chuyển sang `paid` được snapshot lại theo thời điểm thanh toán.
  - Semantics hiện tại: khấu trừ vận hành của gia sư vẫn được tính ở mức từng buổi; khấu trừ thuế được aggregate trên **tổng gross theo nguồn + rate bucket trong kỳ**, nên các view chi tiết lớp/buổi của gia sư dùng số **sau vận hành, trước thuế**.
- Quan hệ con: `attendance`
- Indexes chính:
  - đơn lẻ: `teacher_id`, `class_id`, `date`
  - composite cho read path nóng: `(class_id, date)`, `(class_id, teacher_id, date)`, `(teacher_id, date)`, `(teacher_id, teacher_payment_status, date)`, `(teacher_payment_status, date, teacher_id)`
- Trường Google Calendar/Meet legacy (tùy chọn): `google_meet_link` (TEXT), `google_calendar_event_id` (TEXT), `calendar_synced_at` (TIMESTAMPTZ), `calendar_sync_error` (TEXT)
  - Các field này được giữ để tương thích dữ liệu cũ đã từng sync session lên Google Calendar.
  - Từ `2026-04-14`, workflow `create/update/delete session` không còn auto-populate hay mutate các field này nữa; Google Calendar chỉ còn gắn với recurring entry trong `Class.schedule` và record one-off của `makeup_schedule_events`.
- Index legacy: `sessions_googleCalendarEventId_idx` trên `google_calendar_event_id`

### 4.6 `attendance`

- Điểm danh theo từng session & student
- Unique composite: `(session_id, student_id)`
- Trạng thái dùng enum `AttendanceStatus`
- Index read path:
  - `session_id`, `student_id`
  - `(customer_care_staff_id, customer_care_payment_status)` với tên index thực tế `attendance_customer_care_staff_id_customer_care_payment_sta_idx`
  - `(customer_care_staff_id, customer_care_payment_status, session_id)` cho aggregate CSKH theo trạng thái/buổi
  - `(customer_care_staff_id, student_id, session_id)` cho lookup CSKH theo học sinh/buổi
  - `(assistant_manager_staff_id, assistant_payment_status)` cho aggregate trợ lí quản lí
  - `(assistant_manager_staff_id, assistant_payment_status, session_id)` cho aggregate trợ lí quản lí theo trạng thái/buổi
- `assistant_manager_staff_id` (nullable FK → `staff_info.id`): snapshot trợ lí quản lí tại thời điểm tạo/cập nhật buổi; dùng để tính trợ cấp 3% học phí (chỉ tính khi `status = present`)
- `assistant_payment_status` (`PaymentStatus?`): trạng thái thanh toán trợ cấp trợ lí, mặc định `pending` khi có manager
- Snapshot khấu trừ thuế trên attendance:
  - `customer_care_tax_deduction_rate_percent` (`DECIMAL(5,2)`, default `0`): snapshot thuế cho khoản commission CSKH.
  - `assistant_tax_deduction_rate_percent` (`DECIMAL(5,2)`, default `0`): snapshot thuế cho khoản trợ cấp trợ lí 3%.
  - Các snapshot này được dùng để bucket theo mức thuế effective khi aggregate tax trên tổng commission/trợ cấp của kỳ.
- Index: `(assistant_manager_staff_id, assistant_payment_status)` phục vụ aggregate unpaid

### 4.7 Finance models

- `bonuses`: khoản thưởng/phạt theo staff/tháng/trạng thái thanh toán; `amount` có thể dương (thưởng) hoặc âm (phạt/điều chỉnh giảm).
  - API create bonus không còn nhận `id` từ frontend; backend/DB luôn tự sinh UUID authoritative bằng default của bảng.
- `role_tax_deduction_rates`: lịch sử append-only mức khấu trừ thuế mặc định theo role + `effective_from`
- `staff_tax_deduction_overrides`: lịch sử append-only override khấu trừ thuế theo staff + role + `effective_from`
- `class_teachers.tax_rate_percent`: source of truth duy nhất cho `% khấu trừ vận hành` theo cặp `class-teacher` (Prisma `operatingDeductionRatePercent`); dữ liệu lịch sử cũ đã được backfill vào cột này trước khi bỏ bảng lịch sử vận hành.
- `wallet_transactions_history`: lịch sử ví học viên + thông tin chia lợi nhuận CSKH
- `student_wallet_sepay_orders`: yêu cầu nạp ví SePay đã tạo cho học sinh; lưu `order_code`, trạng thái `pending/completed/expired/failed`, `amount_requested`, `amount_received`, `transfer_note` (QR tĩnh mới chỉ chứa prefix cấu hình + mã ngắn `UNIST-*`; đơn/QR legacy có thể còn `UNICL-*` và `LOP ...`), snapshot `parent_email`, dữ liệu QR/VA từ SePay hoặc QR chuyển khoản thường, metadata người tạo đơn (`created_by_user_id`, `created_by_user_email`, `created_by_role_type`, `created_by_staff_roles`), `sepay_transaction_id`, `sepay_reference_code`, `wallet_transaction_id`, `completed_at`, `receipt_email_sent_at`, và `webhook_payload`.
- `student_wallet_direct_topup_requests`: yêu cầu nạp thẳng do admin/staff tạo trước khi cộng ví; lưu `student_id`, `amount`, `reason`, trạng thái `pending/approved/expired`, `token_hash` duy nhất, `expires_at` (token hiện hết hạn sau 14 ngày), `approved_at`, `wallet_transaction_id`, metadata người yêu cầu (`requested_by_user_id`, email, role type, staff roles). Chỉ khi duyệt thành công mới liên kết sang `wallet_transactions_history`.
- `customer_care_service`: map staff chăm sóc theo học viên + % profit
- `staff_monthly_stats`: số liệu tổng hợp lương/việc theo tháng
- `extra_allowances`: khoản trợ cấp bổ sung theo staff/tháng/role, có `amount`, `status`, `note`, `month`, `role_type`, và snapshot `tax_deduction_rate_percent`
- Index read path mới cho finance:
  - `bonuses`: composite `(staff_id, month, status)` cho payroll preview/listing theo nhân sự-tháng-trạng thái; composite `(status, date, staff_id)` cho batch thanh toán/lọc theo trạng thái-ngày
  - `wallet_transactions_history`: composite `(student_id, created_at)` cho feed lịch sử ví theo học sinh; composite `(type, created_at)` cho phân loại lịch sử theo loại giao dịch
  - `student_wallet_sepay_orders`: unique `order_code`, unique `sepay_transaction_id`, unique `sepay_reference_code`, unique `wallet_transaction_id`; index `(student_id)`, `(status, created_at)`, và `(created_by_user_id)` cho reconcile/webhook và audit người tạo QR.
  - `student_wallet_direct_topup_requests`: unique `token_hash`, unique `wallet_transaction_id`; index `(student_id)`, `(status, expires_at)`, và `(requested_by_user_id)` cho preview/approval token, cleanup hết hạn và audit người yêu cầu.
  - `extra_allowances`: composite `(staff_id, month, status)` cho payroll preview/listing theo nhân sự-tháng-trạng thái; composite `(status, staff_id, month, role_type, tax_deduction_rate_percent)` cho aggregate allowance theo trạng thái/rate bucket
  - `dashboard_cache`: index `expires_at` cho dọn cache hết hạn
  - `cost_extend`: index `date`, `month`, và composite `(status, date)` cho lọc chi phí theo kỳ/trạng thái
- Payroll semantics:
  - thuế áp dụng cho mọi staff; **thưởng (bonus)** trong `income-summary` / popup thanh toán áp **khấu trừ thuế** theo mức hiện hành của role ưu tiên trên hồ sơ (không có khấu trừ vận hành trên thưởng)
  - tax base được aggregate theo **từng nguồn thu nhập trong kỳ** và tách bucket theo snapshot rate đang effective
  - khấu trừ vận hành chỉ áp dụng cho gia sư theo `class_teachers.tax_rate_percent`
  - `snapshotUnpaidTotal` / `snapshotUnpaidNetTotal` trong staff income summary là toàn bộ khoản pending/unpaid hiện tại từ mọi nguồn, không giới hạn tháng hoặc cửa sổ `days`, và loại trừ session cọc; net của giáo viên trừ vận hành hiện hành theo lớp rồi tính thuế trên phần sau vận hành, còn role khác chỉ trừ thuế
- `dashboard_cache`: cache JSON theo key/type + `expires_at`; hiện được backend dùng làm server-side response cache cho các read endpoint nặng của admin dashboard
- `cost_extend`: khoản chi mở rộng theo tháng/danh mục
  - `date`: dùng kiểu `DATE` (Prisma `DateTime? @db.Date`) để đồng bộ với các luồng hiển thị/lọc theo ngày

### 4.8 Content & audit

- `class_surveys`: báo cáo/đánh giá lớp theo mốc test; index `class_id`, `teacher_id`, `(class_id, test_number)`, `(teacher_id, report_date)`
- `action_history`: audit log thay đổi dữ liệu (`before_value`, `after_value`, `changed_fields` là JSON)
- `documents`: metadata tài liệu (`file_url`, `tags` JSON)
- `notifications`: bản ghi thông báo admin push cho feed admin/staff/student; lưu draft/published, audience target động, version, số lần push và thời điểm push gần nhất
- `notification_reads`: đánh dấu đã đọc theo từng user (`user_id` + `notification_id`, unique)
- `regulations`: bài quy định dùng cho tab `Quy định` ở `notes-subject`, có role/audience tag và optional resource link

### 4.8.1 `action_history`

- Dùng để lưu thao tác `create | update | delete` ở backend cho các entity nghiệp vụ.
- Actor: `user_id`, `user_email`
- Phân loại: `entity_type`, `entity_id`, `action_type`
- `entity_id` lưu mã định danh hệ thống hiện hành cho `student`, `class`, `staff`. Migration short-ID backfill cập nhật cả `entity_id` và các snapshot JSON chứa ID cũ.
- Snapshot:
  - `before_value`: toàn bộ dữ liệu trước khi thay đổi
  - `after_value`: toàn bộ dữ liệu sau khi thay đổi
  - `changed_fields`: diff dạng JSON giữa before/after
- Coverage hiện tại:
  - learning / finance / content: `session`, `class`, `cost`, `bonus`, `cf_problem_tutorial`
  - identity / people: `user`, `student`, `staff`
  - auth state của `user`: `register`, `verify email`, `reset password`, `change password`, `setup password` cho user OAuth, Google OAuth create/verify
- Ghi chú bảo mật:
  - snapshot `user` lưu theo dữ liệu thực tế ở DB, nên các field hash như `passwordHash` hoặc `refreshToken` có thể xuất hiện trong `before_value` / `after_value` khi chính các field đó thay đổi
- Indexes phục vụ tra cứu lịch sử:
  - `user_id`
  - `entity_type`
  - `entity_id`
  - `action_type`
  - `created_at`
  - composite `(entity_type, entity_id, created_at)`
  - composite `(entity_type, action_type, created_at)`
  - composite `(user_id, created_at)`

### 4.8.2 `notifications`

- Lưu thông báo push từ admin cho admin/staff/student, dùng chung cho REST feed và NestJS gateway `/notifications`
- PK: `id` (UUID)
- Trường chính:
  - `title` (`VARCHAR(160)`)
  - `message` (`TEXT`)
  - `status` (`NotificationStatus`: `draft | published`)
  - `target_all` (`BOOLEAN`, default `true`) để broadcast cho toàn bộ audience đủ điều kiện
  - `target_role_types` (`UserRole[]`) cho tag role_type như `@admin`, `@staff`, `@student`
  - `target_staff_roles` (`StaffRole[]`) cho tag staff role như `@teacher`, `@assistant`, `@lesson_plan_head`, `@training`
  - `target_user_ids` (`TEXT[]`) cho direct user tag; feed/realtime sẽ match động theo `users.id` hiện tại
  - `version` (bản phát hiện tại; draft bắt đầu từ `0`, lần push đầu = `1`)
  - `push_count` (tổng số lần đã push/re-push)
  - `last_pushed_at` (nullable; chỉ có khi đã published)
  - `created_by_user_id` (optional FK → `users.id`)
  - `created_at`, `updated_at`
- Hành vi audience:
  - notification cũ/mặc định dùng `target_all = true`
  - khi `target_all = false`, audience là **union** của `target_role_types`, `target_staff_roles`, `target_user_ids`
  - audience được resolve **động** lúc load feed / websocket emit, không snapshot recipient tại thời điểm push
- Index read path hiện có:
  - `status`
  - `target_all`
  - `last_pushed_at`
  - `updated_at`
  - `created_by_user_id`
  - GIN: `target_role_types`, `target_staff_roles`, `target_user_ids`

### 4.8.3 `notification_reads`

- Mỗi dòng = một user đã xác nhận đã đọc một thông báo đã published (feed).
- PK: `id` (TEXT / UUID string)
- FK: `user_id` → `users.id` (**ON DELETE CASCADE**), `notification_id` → `notifications.id` (**ON DELETE CASCADE**)
- `read_at` (timestamptz, default now)
- Unique: `(user_id, notification_id)`
- Index: `user_id`, `notification_id`

### 4.8.4 `regulations`

- Lưu bài quy định cho workspace `notes-subject`, thay mock data ở FE.
- PK: `id` (UUID)
- Trường chính:
  - `title` (`VARCHAR(200)`)
  - `description` (`TEXT`, nullable)
  - `content` (`TEXT`, rich text HTML từ editor)
  - `audiences` (`RegulationAudience[]`) để quyết định actor nào được thấy bài
  - `resource_link` (`TEXT`, nullable)
  - `resource_link_label` (`VARCHAR(160)`, nullable)
  - `created_by_user_id`, `updated_by_user_id` (optional FK → `users.id`)
  - `created_at`, `updated_at`
- Index read path hiện có:
  - `updated_at`
  - `created_by_user_id`
  - `updated_by_user_id`
  - GIN: `audiences`

### 4.9 Codeforces tutorial (`cf_problem_tutorials`)

- Lưu nội dung tutorial cho từng bài trong contest Codeforces (group).
- PK: `id` (UUID). Unique: `(contest_id, problem_index)`.
- Trường: `contest_id` (Int), `problem_index` (String, vd. `"01"`, `"A"`), `tutorial` (Text, nullable).
- Dùng cho Tab Tài liệu tại `/admin/notes-subject` khi admin chỉnh sửa tutorial cho bài.

### 4.10 Lesson models

- `lesson_task`: task nội dung (status, priority, due date, created_at, updated_at)
  - **PK format:** `UNILTK-[0-9a-f]{10}` — ví dụ `UNILTK-a1b2c3d4e5`. Đây là **mã định danh hệ thống** ngắn cho task giáo án; migration `20260524110000_lesson_short_system_entity_ids` dùng `pgcrypto.gen_random_bytes(5)` để sinh ID mới cho dữ liệu hiện có, không cắt từ UUID cũ. Không còn dùng `@default(uuid())` trong Prisma cho PK này.
  - quan hệ optional `created_by -> staff_info.id`
  - `created_by` là field legacy; flow mới không ghi field này và task edit sẽ clear về `null`
  - danh sách `nhân sự thực hiện giáo án` đi qua `staff_lesson_task`; response task có thể gộp legacy `created_by` và `lesson_outputs.staff_id` để hiển thị data cũ trước khi edit
  - index read path hiện có cho tab tổng quan giáo án admin: `(status, due_date)`, `updated_at`
- `staff_lesson_task`: junction assignment chính thức giữa task và nhân sự thực hiện giáo án
  - **PK format:** `UNISLT-[0-9a-f]{10}` — ví dụ `UNISLT-a1b2c3d4e5`. Đây là **mã định danh hệ thống** ngắn cho assignment task-nhân sự; migration `20260524110000_lesson_short_system_entity_ids` dùng `pgcrypto.gen_random_bytes(5)` để sinh ID mới cho dữ liệu hiện có, không cắt từ UUID cũ. Không còn dùng `@default(uuid())` trong Prisma cho PK này.
- `lesson_resources`: thư viện tài nguyên học tập
  - **PK format:** `UNILRS-[0-9a-f]{10}` — ví dụ `UNILRS-a1b2c3d4e5`. Đây là **mã định danh hệ thống** ngắn cho tài nguyên giáo án; migration `20260524110000_lesson_short_system_entity_ids` dùng `pgcrypto.gen_random_bytes(5)` để sinh ID mới cho dữ liệu hiện có, không cắt từ UUID cũ. Không còn dùng `@default(uuid())` trong Prisma cho PK này.
  - field chính cho admin lesson overview: `title`, `description`, `resource_link`, `tags`, `updated_at`
  - index read path hiện có: `created_at`, `updated_at`
- `lesson_outputs`: sản phẩm bài học gắn optional với `lesson_task`
  - **PK format:** `UNILOT-[0-9a-f]{10}` — ví dụ `UNILOT-a1b2c3d4e5`. Đây là **mã định danh hệ thống** ngắn cho output bài học; migration `20260524110000_lesson_short_system_entity_ids` dùng `pgcrypto.gen_random_bytes(5)` để sinh ID mới cho dữ liệu hiện có, không cắt từ UUID cũ. Không còn dùng `@default(uuid())` trong Prisma cho PK này.
  - field chính cho work tab / popup chi tiết output: `lesson_task_id`, `lesson_name`, `contest_uploaded`, `date`, `status`, `payment_status`, `staff_id`, `cost`, `link`, `original_link`, `source`, `level`, `tags`
  - `staff_id` là nhân sự nhận thanh toán / đứng tên output
  - relation optional:
    - `lesson_task_id -> lesson_task.id`
    - `staff_id -> staff_info.id`
  - index read path hiện có:
    - `date`
    - `lesson_task_id`
    - `(lesson_task_id, status)`
    - `(lesson_task_id, date)`
    - `(status, date)`
    - `staff_id`
    - `(staff_id, date)`
    - `(staff_id, payment_status, date)`
    - `(payment_status, date, staff_id)`
    - `level`
    - `updated_at`

### 4.11 Contract notes for authoritative ID generation

- `student_info.id`, `classes.id`, `staff_info.id`: dùng mã định danh hệ thống ngắn (`UNIST-*`, `UNICL-*`, `UNISTAFF-*`), không dùng UUID trần và không derive từ UUID cũ.
- `lesson_task.id`, `lesson_resources.id`, `lesson_outputs.id`, `staff_lesson_task.id`: dùng mã định danh hệ thống ngắn (`UNILTK-*`, `UNILRS-*`, `UNILOT-*`, `UNISLT-*`), không dùng UUID trần và không derive từ UUID cũ.
- `classes.schedule` (JSON): slot `id` là optional trong payload create/update; nếu thiếu, backend sẽ tự sinh UUID cho slot lịch trước khi merge để vẫn giữ được `googleCalendarEventId`/`meetLink` của slot cũ.
- `student_exam_schedules`: endpoint replace-all vẫn chấp nhận `id?`; item mới có thể omit `id` để DB tự sinh UUID, item cũ tiếp tục gửi `id` để giữ identity.

#### Summary table: Short system entity ID formats

| Entity | Prefix | Format | Example |
|--------|--------|--------|---------|
| StudentInfo | UNIST- | UNIST-[0-9a-f]{10} | UNIST-1a2b3c4d5e |
| StaffInfo | UNISTAFF- | UNISTAFF-[0-9a-f]{10} | UNISTAFF-1a2b3c4d5e |
| Class | UNICL- | UNICL-[0-9a-f]{10} | UNICL-1a2b3c4d5e |
| LessonTask | UNILTK- | UNILTK-[0-9a-f]{10} | UNILTK-a1b2c3d4e5 |
| LessonResource | UNILRS- | UNILRS-[0-9a-f]{10} | UNILRS-a1b2c3d4e5 |
| LessonOutput | UNILOT- | UNILOT-[0-9a-f]{10} | UNILOT-a1b2c3d4e5 |
| StaffLessonTask | UNISLT- | UNISLT-[0-9a-f]{10} | UNISLT-a1b2c3d4e5 |

---

## 5) Enums hiện có

### User & identity

- `UserRole`: `admin | staff | student | guest`
- `UserStatus`: `active | inactive | pending`
- `StaffRole`: `admin | teacher | assistant | lesson_plan | lesson_plan_head | accountant | accountant_income | accountant_expense | communication | technical | customer_care`
  - `accountant` là legacy value; migration `20260529100000_split_accountant_roles` thêm enum mới, rồi `20260529100001_migrate_accountant_role_data` chuyển dữ liệu hiện hữu sang `accountant_income`.
- `StaffStatus`: `active | inactive`
- `StudentStatus`: `active | inactive`
- `Gender`: `male | female`

### Learning

- `ClassStatus`: `running | ended`
- `ClassType`: `vip | basic | advance | hardcore`
- `StudentClassStatus`: `active | inactive`
- `AttendanceStatus`: `present | excused | absent`

### Finance

- `WalletTransactionType`: `topup | loan | repayment | extend`
- `PaymentStatus`: `paid | pending`

### Lesson

- `LessonTaskStatus`: `pending | in_progress | completed | cancelled`
- `LessonTaskPriority`: `low | medium | high`
- `LessonOutputStatus`: `pending | completed | cancelled`

### Notification

- `NotificationStatus`: `draft | published`

### Regulation

- `RegulationAudience`:
  - `all`
  - `student`
  - `staff_admin`
  - `staff_teacher`
  - `staff_assistant`
  - `staff_lesson_plan`
  - `staff_lesson_plan_head`
  - `staff_accountant`
  - `staff_accountant_income`
  - `staff_accountant_expense`
  - `staff_communication`
  - `staff_technical`
  - `staff_customer_care`

---

## 6) Ghi chú cho model khi thao tác code

1. Tên bảng thực tế dùng `@@map(...)` (snake_case), không luôn trùng tên model.
2. Nhiều cột dùng `@map(...)` nên khi debug SQL cần đối chiếu tên cột DB.
3. Các relation có hành vi xóa khác nhau (`Cascade`, `Restrict`, `SetNull`) — cần giữ đúng khi viết service xử lý delete.
4. Có nhiều trường JSON (`schedule`, `tags`, `before_value`, `after_value`, `changed_fields`, `dashboard_cache.data`) — cần validate ở boundary API.
5. `users.email_verified` và `users.phone_verified` là cờ xác thực quan trọng cho auth flow.
6. Schema hiện không có model/cột `tenant_id` hoặc `workspace_id`; app đang single-tenant. Từ "workspace" trong page docs chỉ nghĩa là scope UI/role, không phải phân vùng dữ liệu.

---

## 7) Nguồn sự thật (source of truth)

- Luôn ưu tiên Prisma schema tại: `apps/api/prisma/schema/*.prisma`.
- Nếu tài liệu này lệch schema, coi schema là chuẩn và cập nhật lại tài liệu.

---

## 8) Tạo lại DB từ schema

Kết nối DB qua `DATABASE_URL` trong `apps/api/.env` (đọc từ `prisma.config.ts`). **Docker (API):** image production copy `prisma.config.ts` vào `/app` cùng thư mục `prisma/` để Prisma CLI chạy được `generate` và các lệnh migration thủ công khi cần. **Lưu ý:** job deploy GitHub Actions ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)) **không** tự chạy `migrate deploy`; remote deploy script chỉ chạy `prisma generate` để kiểm tra schema/client generation. Trên production cần áp migration bằng tay (hoặc quy trình riêng), ví dụ `docker compose -f docker-compose.prod.yml exec -T api npx prisma migrate deploy --schema=./prisma/schema/`. Các lệnh local chạy tại thư mục **`apps/api`**:

| Việc                                          | Lệnh                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Generate Prisma Client                        | `npm run db:generate` hoặc `npx prisma generate --schema=./prisma/schema/`   |
| Áp dụng migration có sẵn (tạo/ cập nhật bảng) | `npx prisma migrate deploy --schema=./prisma/schema/`                        |
| Tạo migration mới + áp dụng (khi đổi schema)  | `npm run db:migrate` hoặc `npx prisma migrate dev --schema=./prisma/schema/` |

**Tạo lại toàn bộ bảng trên DB (PostgreSQL/Supabase):**

```bash
cd apps/api
npx prisma migrate deploy --schema=./prisma/schema/
```

Migration SQL nằm tại: `apps/api/prisma/schema/migrations/`. File `migration_lock.toml` khóa provider `postgresql`.

---

## 9) Seed & migration script

Script **`apps/api/scripts/seed.ts`** dùng để:

- Đọc CSV từ đường dẫn cấu hình trong `mocktest/demo.env` (biến `SEED_CSV_STUDENTS`, `SEED_CSV_CLASSES`, `SEED_CSV_STAFF`).
- Kết nối DB qua `DATABASE_URL` (đọc từ root `.env` hoặc `apps/api/.env`).
- **Mapping:** Tự map header CSV legacy sang schema hiện tại (xem `scripts/csv-loader.ts`, `LEGACY_HEADER_MAP`).
- **User:** Chỉ lưu `password_hash` (bcrypt), không lưu mật khẩu plain-text.
- **Student / last_attendance:** Giá trị “last attendance” từ CSV được chuyển thành FK vào bảng `sessions` thông qua bảng `attendance` (session + student).
- **Tài chính:** `tuition_per_session` → `classes.student_tuition_per_session`; `custom_allowance` → `class_teachers.custom_allowance`; `tax_rate_percent` từ dữ liệu legacy được map sang `class_teachers.tax_rate_percent` (semantic mới: operating deduction); snapshot deductions lưu ở `sessions.teacher_tax_rate_percent`, `sessions.teacher_tax_deduction_rate_percent`, `attendance.customer_care_tax_deduction_rate_percent`, `attendance.assistant_tax_deduction_rate_percent`, `extra_allowances.tax_deduction_rate_percent`; `base_rate` → `bonuses` (workType `"base"`).
- **Anonymization:** PII (tên, email, SĐT, địa chỉ) được thay bằng dữ liệu ngẫu nhiên (Faker).
- **Preview:** Trước khi ghi DB, script tạo file `Data_Migration_Preview.docx` (hoặc đường dẫn trong `SEED_PREVIEW_PATH`) chứa 50 dòng đầu của bảng Student và Class (sau mapping/anonymization).
- **Seeding:** Sau migration từ CSV, script sinh thêm dữ liệu ngẫu nhiên cho các bảng đến khoảng `SEED_TARGET_ROWS` (mặc định 1000) dòng, đảm bảo FK.

**Chạy seed (từ repo root hoặc từ `apps/api`):**

```bash
cd apps/api
npm run db:generate   # nếu chưa generate Prisma Client
npm run seed
```

**Cài dependency cho script (nếu thiếu):**

```bash
cd apps/api
pnpm add csv-parse docx @faker-js/faker
# hoặc: npm install csv-parse docx @faker-js/faker --save
```

**Env:** `DATABASE_URL` bắt buộc (root `.env` hoặc `apps/api/.env`). Các biến trong `mocktest/demo.env`: `SEED_CSV_*`, `SEED_PREVIEW_PATH`, `SEED_TARGET_ROWS`. Để bỏ qua migration từ CSV, để trống các `SEED_CSV_*`.
