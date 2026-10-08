# Database Schema – Unicorns Edu (apps/api)

> Đồng bộ Toán 02/10/2026 bổ sung 53 migration từ upstream, chưa áp dụng vào database. Hai migration sửa/xoá học sinh import thành tích có ID riêng Tin phải được kiểm tra trước rollout; xem [hướng dẫn đồng bộ Toán](ops/upstream-sync-math-2026-10-02.md). Enum nguồn khách giữ mã gốc, nhãn UI/API dùng thương hiệu Toán.

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
- `user_devices` (phiên đăng nhập gắn thiết bị; học sinh một máy, staff/admin nhiều máy)
- `login_requests` (yêu cầu đăng nhập tạm, gắn với trình duyệt khởi tạo)

### People

- `staff_info`
- `student_info`

### Learning

- `classes`
- `courses` (Khoá học, tuỳ chỉnh được qua CRUD `/courses`)
- `course_difficulty_levels` (Mức độ khó của khoá học)
- `course_lesson_plan_members` (đội giáo án của khoá học)
- `class_teachers`
- `student_classes`
- `sessions`
- `attendance`
- `cf_problem_tutorials` (tutorial theo bài Codeforces)
- `modules` (chuyên đề — nhóm tiết học bên trong khoá học)
- `lessons` (tiết học — lý thuyết hoặc thực hành; thuộc chuyên đề của khoá — tiết riêng lớp cũ đã lưu trữ)
- `class_modules` (chuyên đề lớp đã thêm — nguồn đồng bộ tiết lý thuyết vào lớp)
- `lesson_quizzes` (liên kết câu hỏi từ ngân hàng vào bài tập ôn nhẹ của tiết lý thuyết)
- `lesson_quiz_answers` (trả lời bài tập ôn nhẹ — không sinh Attempt, không tính điểm)
- `class_theory_lesson_views` (lượt mở trang tiết lý thuyết của học sinh trong phạm vi lớp)
- `attempts` (lượt làm Chuyên đề luyện tập — FK `assignment_id` → `class_content_items.id`)
- `attempt_answers` (câu trả lời của một Attempt; snapshot đề + `points_possible` = 100/N lúc start)

### Finance

- `bonuses`
- `role_tax_deduction_rates`
- `role_fixed_salary_defaults`
- `role_fixed_salary_operating_rate_defaults`
- `staff_fixed_salary_overrides`
- `staff_fixed_salary_operating_rate_overrides`
- `staff_fixed_salary_payables`
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
- `class_survey_student_assessments`
- `survey_round` (Prisma model `Survey` — "Bài khảo sát")
- `survey_excluded_classes`
- `survey_warning_dismissals`
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
- **User → UserDevice**: 1-N qua `user_devices.user_id`, `onDelete: Cascade`. Học sinh runtime chỉ giữ 1 row active; staff/admin được nhiều row.
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
- **ClassSurvey → Survey**: optional FK `survey_id` (nullable cho data cũ trước khi có Bài khảo sát).
- **ClassSurveyStudentAssessment → ClassSurvey / StudentInfo**: required FK, `onDelete: Cascade`; unique `(class_survey_id, student_id)`.
- **SurveyExcludedClass → Survey / Class**: required FK, `onDelete: Cascade`; unique `(survey_id, class_id)`.
- **SurveyWarningDismissal → Survey**: required FK `survey_id`, `onDelete: Cascade`; `user_id`/`staff_id` là plain id (không FK cứng, cùng convention với `action_history.user_id`); unique `(user_id, staff_id, survey_id)`.
- **ActionHistory → User**: optional FK, `onDelete: SetNull`.
- **Notification → User (createdBy)**: optional FK `created_by_user_id`, `onDelete: SetNull`.
- **Regulation → User (createdBy / updatedBy)**: optional FK `created_by_user_id`, `updated_by_user_id`, `onDelete: SetNull`.
- **StaffLessonTask**: bảng giao giữa `staff_info` và `lesson_task`, unique `(staff_id, lesson_task_id)`; đây là nguồn assignment chính thức cho `nhân sự thực hiện giáo án`. Khi đọc data legacy, API có thể gộp thêm `lesson_task.created_by` và `lesson_outputs.staff_id` vào response để hiển thị, nhưng task edit sẽ chuẩn hóa lại về bảng này.
- **LessonTask → LessonResource**: 1-N optional (`lesson_resources.lessonTaskId`, `onDelete: SetNull`).
- **LessonTask → LessonOutput**: 1-N optional (`lesson_outputs.lesson_task_id`, `onDelete: SetNull`).
- **LessonOutput → StaffInfo**: optional FK, `onDelete: SetNull`; staff này là nhân sự nhận thanh toán / đứng tên output, không phải nhóm điều phối task.
- **Module → Course**: N-1 (`modules.course_id` FK, `onDelete: Cascade`).
- **Lesson → Course/Module**: optional FK, `onDelete: Cascade` — tiết cấp khoá khi có `course_id` + `module_id`.
- **ClassModule → Class/Module**: N-1 mỗi phía (`class_modules`, `onDelete: Cascade`); unique `(class_id, module_id)`. Tiết lý thuyết của chuyên đề được materialize thành `class_content_items` của lớp.
- **Lesson → Class**: optional FK, `onDelete: Cascade` — tiết riêng lớp legacy (không tạo mới; đã lưu trữ `archived_at`).
- **Lesson CHECK constraint**: `lessons_owner_check` — tiết thuộc `(course_id+module_id)` OR `class_id`, never both. `lessons_practice_no_media_check` — tiết `practice` không có `video_url`/`content`.
- **Question → Course**: N-1 (`questions.course_id` FK, `onDelete: Cascade`).
- **Question → Module**: N-1 (`questions.module_id` FK, `onDelete: Cascade`).
- **Question → CourseDifficultyLevel**: N-1 (`questions.difficulty_level_id` FK, `onDelete: Restrict`).
- **Question → QuestionLink**: 1-N (`question_links.question_id` FK, `onDelete: Restrict`).
- **QuestionLink → Lesson**: N-1 (`question_links.lesson_id` FK, `onDelete: Cascade`); unique `(lesson_id, question_id)`.

---

## 4) Chi tiết model quan trọng

### 4.1 `users` (Auth core)

- PK: `id` (UUID default)
- Unique: `email`, `account_handle` (hai trường độc lập; login chấp nhận chuỗi tương ứng email hoặc account_handle, ưu tiên account_handle).
- Trường chính: `password_hash`, `role_type`, `status`, `email_verified`, `phone_verified`, `data_processing_consent_accepted_at`, `data_processing_consent_version`, `refresh_token`
- RBAC runtime: `role_type` là role gốc/default của user, không phải nguồn quyền duy nhất. `GET /auth/session` và backend guards resolve quyền hiệu lực bằng union của `users.role_type`, linked `staff_info.user_id`, linked `student_info.user_id`, và `staff_info.roles`; vì vậy một user có thể đồng thời mở admin/staff/student workspace nếu có các linked profile/role tương ứng.
- Trường tên canonical cho actor dạng staff: `first_name`, `last_name` (nullable). FE/BE dùng cặp này làm nguồn chuẩn để hiển thị tên staff trong rollout bỏ `staff_info.full_name`.
- Avatar:
  - `avatar_path` (`TEXT`, nullable): object path avatar sạch trong bucket private `avatars` theo format `users/{userId}/avatar`. DB nullable; bắt buộc cho gate hoàn thiện hồ sơ staff (`staffProfileComplete`) khi user có linked `staff_info` active (admin full bypass).
  - `avatar_watermarked_path` (`TEXT`, nullable): twin watermarked (diagonal tile) trong bucket public `avatars-public`, path ổn định `users/{userId}/avatar.jpg`. Landing/CMS chỉ dùng twin này (public URL). Upload avatar bắt buộc tạo twin; thiếu twin → fail. ADR: `docs/adr/2026-08-11-landing-watermarked-public-images.md`.
- Quan hệ profile không nằm trên `users`; link authoritative được lưu ngược ở `student_info.user_id` và `staff_info.user_id`.
- `DELETE /users/:id` (admin/assistant): soft-delete tài khoản — gỡ `staff_info.user_id` / `student_info.user_id` về `null` (giữ hồ sơ), các FK nullable khác (`action_history.user_id`, `notifications.created_by_user_id`, `regulations.*_by_user_id`, wallet order/request creator, …) theo `ON DELETE SET NULL`, `notification_reads` cascade theo user; sau đó xóa row `users`.
- Không còn field legacy `person_profile_id` trong schema được hỗ trợ.
- Index: `email`, `phone`, `account_handle`, `link_id`, `role_type`, `status`, `created_at`

Bảng `user_devices` và `login_requests` được tạo bởi migration `20260905120000_create_user_devices_and_login_requests` (production chưa có hai bảng này trước khi deploy chuỗi 20260905+). `activate_secret_hash` trên `login_requests` do `20260906000000_add_activate_secret_hash`. Bảng `questions` (ngân hàng, cột `chapter_id` lúc tạo) do `20260912500000_create_questions`; `20260921000000_rename_three_level_content` đổi `chapter_id` → `module_id`.

### 4.1.1 `user_devices` (phiên đăng nhập gắn thiết bị)

- PK: `id` (UUID default). Giá trị này được nhúng vào access/refresh JWT dưới claim `deviceId` (không dùng tên `sessionId` — `Session` là Buổi học).
- FK: `user_id` → `users.id` (ON DELETE CASCADE)
- Fields:
  - `token_hash` (`TEXT`, unique): SHA-256 của refresh JWT hiện tại của thiết bị đó. Refresh cookie cũ sau rotate / logout không còn khớp.
  - `device_info` (`JSONB`, nullable): thông tin trình duyệt/device (user-agent, accept-language)
  - `ip_address` (`TEXT`, nullable): IP address khi đăng nhập
  - `last_active_at` (`TIMESTAMPTZ(6)`): lần hoạt động cuối cùng, dùng để auto-expire sau 60 ngày; backend chỉ ghi lại khi cách lần trước ≥ 1 phút
  - `created_at` (`TIMESTAMPTZ(6)`)
- Luật: mỗi học sinh chỉ có đúng 1 device active tại một thời điểm. Staff/admin được nhiều device (thu hồi từng máy). Xóa row = thu hồi phiên tức thời trên request kế tiếp.
- Auto-expire: device bị xóa sau 60 ngày không hoạt động (lazy cleanup khi tạo login request mới).
- Index: `user_id`, `token_hash`, `last_active_at`

### 4.1.2 `login_requests` (Magic link verification)

- PK: `id` (UUID default)
- FK: `user_id` → `users.id` (ON DELETE CASCADE)
- Fields:
  - `token_hash` (`TEXT`, unique): SHA-256 hash của login token
  - `verified` (`BOOLEAN`, default false): đã bấm link xác minh chưa
  - `device_info` (`JSONB`, nullable): thông tin trình duyệt khởi tạo
  - `ip_address` (`TEXT`, nullable): IP address khi tạo request
  - `expires_at` (`TIMESTAMPTZ(6)`): hết hạn sau 10 phút
  - `created_at` (`TIMESTAMPTZ(6)`)
- Flow: tạo request → gửi magic link email → user bấm link → `verified = true` → frontend poll nhận biết → activate device + cấp JWT tokens.
- Cleanup: xóa bản ghi hết hạn khi tạo login request mới (lazy).

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
- `personal_achievement_link` (`TEXT`, nullable): **deprecated** — link Google Drive/URL thành tích cũ. Không còn nằm trong gate `staffProfileComplete`, không còn hiện trên UI form/overview/danh sách nhân sự. API không nhận ghi nữa: `POST /staff`, `PATCH /staff/:id`, `PATCH /staff/:id/with-fixed-salary-overrides`, `PATCH /users/me/staff` bỏ field khỏi DTO (ValidationPipe `whitelist` lọc bỏ nếu client cũ còn gửi). Cột và dữ liệu cũ giữ đến khi có PR drop riêng. Hệ thống mới dùng `staff_achievements`.
- `specialization` (`TEXT`, nullable): **deprecated** — text chuyên môn từng hiển thị nhầm dưới heading thành tích. Không còn bắt buộc trong gate / UI; API ghi không nhận field này nữa (giống `personal_achievement_link`), chỉ landing `GET /staff/landing-profiles` còn trả để tương thích; migration `20260811100000_add_staff_student_achievements` backfill mỗi giá trị non-empty thành 1 row `staff_achievements` (title only). Drop cột ở PR sau.
- `customer_care_managed_by_staff_id` (nullable FK → `staff_info.id`): trỏ tới trợ lí quản lí CSKH này; trợ lí được hưởng 3% học phí đã học của học sinh thuộc CSKH quản lí. Index: `(customer_care_managed_by_staff_id)`
- `revenue_share_percent` (`DECIMAL(5,2)`, nullable): % hoa hồng trên tổng doanh thu gộp hệ thống, áp dụng cho nhân sự có role `lesson_plan_head` (Trưởng giáo án). Admin đặt riêng từng người qua popup **Sửa nhân sự** (`admin/staffs`). Số tiền thực nhận mỗi tháng = tổng `lesson_plan_head_commission.amount` (paid + pending) của staff trong tháng đó, đọc qua `GET /staff/:id/revenue-share` (xem `lesson_plan_head_commission` mục 4.6b). Số tháng quá khứ vẫn tính theo `revenue_share_percent` **hiện hành** vì `coef_percent` chỉ snapshot tại thời điểm buổi học được tạo/cập nhật, không backfill khi admin đổi %.
- `customer_care_default_profit_percent` (`DECIMAL(2,2)`, NOT NULL, default `0`): **% mặc định CSKH** — phân số 0.00–0.99, cùng đơn vị `customer_care_service.profit_percent` (`0.10` = 10%). CSKH thuần tạo học sinh qua `POST /users/student` thì `customer_care_service` mới nhận giá trị này. Khi `PATCH /student/:id` gán CSKH **mới** (khác CSKH hiện tại) mà không gửi `customer_care_profit_percent`, backend chép giá trị này vào `customer_care_service.profit_percent`; gửi kèm % thì % gửi thắng; giữ nguyên CSKH thì giữ % cũ. Đổi % mặc định không sửa học sinh đã gán; buổi đã tạo giữ `attendance.customer_care_coef` đã chụp. Migration `20261003000000_add_staff_customer_care_default_profit_percent` (backfill 0% cho mọi nhân sự hiện có qua DEFAULT). Sửa qua `PATCH /staff` field `customer_care_default_profit_percent`; `GET /staff/customer-care-options` trả `defaultProfitPercent` để FE prefill.
- Được tham chiếu bởi: `users`, `class_teachers`, `sessions`, `makeup_schedule_events`, `bonuses`, `lesson_outputs`, `customer_care_service`, `wallet_transactions_history` (customer care), `staff_monthly_stats`, `extra_allowances`, `staff_fixed_salary_payables`, `class_surveys`, `staff_lesson_task`, `attendance` (assistant_manager), `staff_achievements`

### 4.2.1 `staff_achievements`

- Thành tích của nhân sự: nhiều row/title. Tạo mới bắt buộc đúng một ảnh minh chứng trong cùng thao tác; ảnh đã có chỉ được thay, không gỡ. `image_path` vẫn nullable cho dòng backfill thiếu minh chứng.
- Trường chính:
  - `staff_id` (FK → `staff_info.id`, `ON DELETE CASCADE`)
  - `title` (`TEXT`, bắt buộc, không giới hạn cứng)
  - `image_path` (`TEXT`, nullable): path ảnh gốc (private) trong bucket `achievements` dạng `staff/{staffId}/{achievementId}.{ext}`
  - `image_watermarked_path` (`TEXT`, nullable): twin watermarked public trong bucket `achievements-public`, path ổn định `staff/{staffId}/{achievementId}.jpg` (JPEG). Landing chỉ expose twin này.
  - `sort_order` (`INT`, mặc định 0): thứ tự kéo-thả; API reorder yêu cầu **full permutation** của mọi id hiện có
  - `created_at`, `updated_at`
- Index: `(staff_id, sort_order)`
- API: `GET/PATCH/DELETE /staff/:staffId/achievements`, `PUT .../reorder`, `POST .../:id/image` (thay ảnh). `POST /staff/:staffId/achievements` nhận multipart `title` + `image` (thiếu ảnh thì 400, và không giữ dòng nếu upload lỗi). `DELETE .../:id/image` của nhân sự trả 400. Self-service cùng rule tại `/users/me/achievements/*`. Không ghi `action_history`.
- Backfill từ `staff_info.specialization`: tách bullet Markdown (`-` / `*` / `•`, kể cả `-Giải` không space; chèn newline trước pattern `.- ` bị dính), bỏ header ngắn kết thúc bằng `:`; nếu không có bullet thì mỗi dòng non-empty là 1 row; cuối cùng fallback cả khối text. Không backfill `personal_achievement_link`.
- Watermark twins: script `apps/api/scripts/backfill-watermarked-images.ts`; ADR landing watermark.
- ADR: `docs/adr/2026-08-11-achievement-separate-owner-tables.md`, `...-single-image-per-row.md`, `...-gate-and-legacy-columns.md`, `...-landing-watermarked-public-images.md`, `docs/adr/2026-10-01-staff-achievement-proof-required.md`

### 4.3 `student_info`

- **PK format:** `UNIST-[0-9a-f]{10}` — ví dụ `UNIST-1a2b3c4d5e`. Đây là **mã định danh hệ thống** ngắn cho học sinh; migration `20260523110000_short_system_entity_ids` dùng `pgcrypto.gen_random_bytes(5)` để sinh ID mới cho dữ liệu hiện có, không cắt từ UUID cũ. Không còn dùng `@default(uuid())` trong Prisma cho PK này.
- Hồ sơ học viên: liên hệ phụ huynh (`parent_name`, `parent_phone`, `parent_email`), trạng thái, giới tính, mục tiêu
- `status` là trạng thái học tập của hồ sơ học sinh: `active` = **Đang học**, `inactive` = **Nghỉ học**. Chỉ học sinh `active` được resolve student workspace và được thêm vào roster/lớp mới. Khi chuyển sang `inactive`, backend chuyển các `student_classes` còn `active` của học sinh đó sang `inactive`; bật lại `active` không tự khôi phục các membership cũ.
- Chuyển học sinh sang `inactive` chỉ là trạng thái hồ sơ học tập; `users.status`, ví, công nợ và lịch sử học tập không bị xóa.
- `drop_out_date` (`DATE`, nullable): ngày học sinh nghỉ học. Backend tự **đóng dấu** ngày này (UTC) khi chuyển `status` → `inactive` mà chưa có giá trị nhập tay, và **xoá** (`null`) khi mở lại `status` → `active`. Đây là nguồn authoritative cho chỉ số **"Học sinh nghỉ tháng này"** trên dashboard CSKH (`StaffDashboardCustomerCareSection.droppedStudentsThisMonth` đếm `drop_out_date` thuộc tháng đang xem). Dashboard CSKH/trợ lí: **Học phí đã học** và **Tiền nạp ví** chỉ tính giao dịch/buổi học trong tháng đang xem; **công nợ** đếm mọi HS được gán CSKH có `account_balance < 0` (không lọc `status` hay lớp `running`). Vẫn cho phép nhập tay `drop_out_date` ở popup sửa học sinh để override ngày mặc định. Migration `20260621150000_backfill_inactive_student_drop_out_dates` backfill các hồ sơ `inactive` thiếu ngày: ưu tiên `action_history` (mô tả *Chuyển học sinh sang nghỉ học* hoặc `after_value.status = inactive`), fallback `updated_at` (UTC).
- `drop_out_reason` (`VARCHAR(500)`, nullable): **lý do nghỉ học**. Từ 10/2026 bắt buộc khi chuyển `status` `active` → `inactive` (qua `PATCH /student/:id/status` field `reason` hoặc `PATCH /student/:id` field `drop_out_reason`), backend trim và từ chối khi trống. **Không xoá** khi học sinh học lại, lần nghỉ sau ghi đè. Học sinh đã nghỉ có thể sửa lý do bằng `drop_out_reason` (không nhận chuỗi trống, không nhận cho học sinh đang học). Tạo hồ sơ mới với `status = inactive` chưa bắt lý do. Migration `20261003020000_add_student_drop_out_reason`; hồ sơ nghỉ trước đó để `NULL`.
- `parent_email` là email nhận biên nhận nạp ví SePay của phụ huynh; không fallback sang email học sinh.
- `parent_receipt_email_enabled` (`BOOLEAN`, mặc định `true`): khi `false`, webhook SePay **không** gửi email biên lai nạp ví cho phụ huynh lẫn CSKH (ví vẫn được cộng bình thường).
- `customer_source` (`StudentCustomerSource`, nullable): **Nguồn khách** trên hồ sơ. Tập đóng `tiktok`, `fanpage_hoc_tin`, `fanpage_luyen_tin`, `referral`, `personal`, `returning_customer` (Khách cũ), `other`. `NULL` là **Chưa gán**, không phải một giá trị enum. Hồ sơ tạo mới phải có giá trị. Migration `20260929220000_backfill_student_customer_source` gán mọi hồ sơ còn `NULL` thành `other` với `customer_source_note = 'Nguồn cũ'`. Migration `20261003010000_add_returning_customer_source` thêm `returning_customer` ngay trước `other`, không đổi dữ liệu nguồn đang có.
- `customer_source_note` (`VARCHAR(200)`, nullable): chú thích nguồn thực tế, chỉ khi `customer_source = other`. Đổi sang nguồn khác thì cột về `NULL`. Thống kê dashboard đọc nguồn hiện tại, không khóa nguồn tại buổi học.
- Được tham chiếu bởi: `users`, `student_classes`, `attendance`, `wallet_transactions_history`, `student_wallet_sepay_orders`, `customer_care_service`, `student_exam_schedules`, `student_achievements`, `student_gallery_items`

### 4.3.0 `student_achievements`

- Thành tích học sinh — **structured** (khác `staff_achievements` chỉ có `title`): FK `student_id` → `student_info.id`.
- Trường:
  - `award` (`TEXT`, bắt buộc) — giải thưởng (vd. "Giải Khuyến khích")
  - `exam` (`TEXT`, bắt buộc) — kỳ thi (vd. "HSG Quốc gia")
  - `year` (`INT`, bắt buộc) — năm đạt giải
  - `level` (`AchievementLevel`, bắt buộc) — `COMMUNE` | `PROVINCE` | `REGIONAL` | `NATIONAL` | `INTERNATIONAL` | `ADMISSION`
  - `course_label` (`TEXT`, nullable) — nhãn khóa học landing (vd. "KHỐI THPT"); trống → landing tự gán theo cấp
  - `image_path` / `image_watermarked_path` / `sort_order` — giống staff (1 ảnh minh chứng / row)
- Path ảnh gốc: `student/{studentId}/{achievementId}.{ext}` trong bucket private `achievements`.
- Path twin watermarked: `student/{studentId}/{achievementId}.jpg` trong bucket public `achievements-public`.
- Index: `(student_id, sort_order)`, `(year, level)`.
- Chỉ admin (và assistant/customer_care trên route admin mirror) quản lý qua `/student/:studentId/achievements/*`. Không có student self-service.
- Landing: `GET /student/landing-profiles` trả `award/exam/year/level/courseLabel` + derived `title = "${award} · ${exam}"` cho compat.

### 4.3.0b `student_gallery_items`

- Gallery landing của học sinh: nhiều ảnh (không nhập nhận xét trên UI); FK `student_id` → `student_info.id`.
- Trường: `caption` (nullable, **unused** — luôn `null` từ product UI), `image_path` (private), `image_watermarked_path` (public twin), `sort_order`, timestamps.
- Path ảnh gốc: `student/{studentId}/{itemId}.{ext}` trong bucket private `student-gallery`.
- Path twin watermarked: `student/{studentId}/{itemId}.jpg` trong bucket public `student-gallery-public`.
- Admin-only CRUD `/student/:studentId/gallery/*` (assistant/customer_care trên admin-mirror). ADR: `docs/adr/2026-08-11-student-gallery-watermarked.md`.
- Avatar học sinh cho landing vẫn lấy từ `users.avatar_*` (tạo HS bắt buộc `user_id`); admin upload qua `POST/DELETE /student/:id/avatar`.

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
  - `course_id` (FK → `courses.id`, `onDelete: Restrict`), `status` (`ClassStatus`). Migration `20260818090000_add_class_category` thay enum cố định `ClassType` (`vip|basic|advance|hardcore`) bằng bảng `courses` để admin tự thêm/sửa/ẩn/xoá khoá học qua CRUD `/courses` (xem mục 4.4.0-cat). Khi tạo lớp không truyền `course_id`, backend fallback về khoá học `isActive=true` có `sort_order` nhỏ nhất (không còn hardcode `code='basic'`).
  - `status`: `running` = lớp đang vận hành; `ended` = lớp đã kết thúc. `POST /class/:id/end` chỉ cho phép khi mọi `sessions` của lớp có `teacher_payment_status = paid` (case-insensitive); nếu còn `unpaid`/`pending`/`deposit` backend trả `400`. Khi kết thúc lớp, backend xóa lịch cố định hiện tại, chuyển membership học sinh đang học và phân công gia sư đang mở sang `inactive`, đồng thời dọn buổi bù tương lai của lớp. Response `GET /class/:id` trả thêm `endClassEligibility` (`canEnd`, `sessionCount`, `unpaidSessionCount`, `blockReason`) để FE disable nút **Kết thúc lớp** và chặn chọn trạng thái **Đã kết thúc** trong popup thông tin lớp khi chưa đủ điều kiện. `PATCH /class/:id/basic-info` **không** được dùng để chuyển `running → ended` (trả `400`; phải dùng `POST /end`). Lịch sử session, attendance, ví và payroll đã phát sinh vẫn giữ nguyên.
  - `max_students`, `allowance_per_session_per_student`, `max_allowance_per_session`, `scale_amount`
  - **Chế độ tính tiền (`pricing_mode`, enum `ClassPricingMode`, NOT NULL, mặc định `per_session`):** `per_session` = theo buổi (hành vi cũ, backfill mọi lớp hiện có); `per_block` = opt-in đơn giá / 30 phút; `one_time` = **Lớp bán một lần** (học phí cả khoá vào buổi có mặt/nghỉ phép đầu tiên của từng học sinh). Migration `20260909100000_class_pricing_mode`, thêm giá trị `one_time` ở `20261002090000_add_one_time_pricing_mode`. `20261002100000_backfill_one_time_course_tuition` gắn `one_time` cho mọi lớp của khoá `THPTQG` và `PREVOI`, dồn `attendance.tuition_fee` present/excused về buổi sớm nhất, đưa các buổi sau về 0, và không sửa ví hay trợ cấp gia sư. `attendance.payroll_basis_tuition_fee` giữ học phí cũ của mọi dòng present/excused để hoa hồng trợ lí 3% và CSKH không bị tính lại (xem 4.6). Buổi mới: học sinh chưa có dòng present/excused mang học phí > 0 ở buổi khác của lớp thì bị trừ cả gói ở buổi này; tạo/sửa buổi khoá advisory lock theo lớp để không thu trùng. **Từ `20261004000000_one_time_course_setting`, `one_time` đi theo cờ `courses.is_one_time` (xem 4.4.0-cat), không theo tên khoá:** lớp của khoá bán một lần luôn `one_time` (`POST /class` bỏ qua `pricing_mode` client gửi); lớp của khoá thường nhận `per_session`/`per_block`, gửi `one_time` trả `400`. Lớp bán một lần phải có `tuition_package_total > 0` khi tạo/sửa (`400` nếu không). Học phí trừ ở buổi đầu = gói riêng `student_classes.custom_tuition_package_total` (0 coi như không có) nếu có, không thì gói lớp; sửa gói sau khi đã trừ không tính lại. Đổi `course_id` chỉ được sang khoá cùng chế độ (`400` nếu khác). Migration này cũng backfill ví cho THPTQG 02 (`UNICL-c1f789b32e`, chuyển từ khoá Basic sang THPTQG) và PREVOI 02 (`UNICL-dc32916487`), chỉ học sinh `student_classes.status = active` (hai học sinh THPTQG 02 đăng ký chung `UNIST-9b344d2867`, `UNIST-c17f8016fe` được đặt gói riêng 1.440.000 trước khi tính): xoá hẳn mọi giao dịch trừ/hoàn học phí của lớp (link qua `attendance.transaction_id` hoặc note `Đóng học phí lớp <lớp> buổi học …` / `Hoàn trả số dư lớp <lớp> buổi học …`), cộng lại số đã trừ ròng vào `student_info.account_balance`, ghi một giao dịch `extend` bằng gói tại ngày buổi present/excused đầu tiên, buổi đó mang gói + link giao dịch mới, các buổi sau về 0 không link, rồi tính lại `sessions.tuition_fee`. Số dư có thể âm; không có bản ghi đối soát giao dịch đã xoá (ADR `docs/adr/2026-10-04-one-time-course-setting.md`). Đổi chế độ có dính `one_time` không chạy tính lại học phí hàng loạt. Cột `*_per_session` sống vĩnh viễn (contract xoá #138 đã huỷ). `PATCH /class/:id/pricing-mode` đổi giữa `per_session`/`per_block`; trả `400` nếu gửi `one_time` hoặc lớp đang `one_time` (đổi trên khoá). Từ chối bật `per_block` nếu không suy được số block chuẩn (thiếu lịch active, hoặc có khung giờ không phải bội số 30 phút — các khung giờ **không** cần dài bằng nhau, số block chuẩn là GCD). Buổi unpaid được tính lại; buổi paid/deposit/cọc không đổi.
  - **Expand (song song):** `allowance_per_block_per_student`, `max_allowance_per_block`, `student_tuition_per_block` — đơn giá mỗi block 30 phút, backfill `ROUND(giá_cũ / số_block_chuẩn)` từ lịch cố định; `null` khi không suy được số block. Dual-write khi ghi cột per-session, trừ `student_tuition_per_block` khi admin gửi số tay trên `POST/PATCH /class` / `PATCH /class/:id/basic-info` (#141): số dương được giữ nguyên; `null`/omit thì vẫn suy từ `student_tuition_per_session`. Đổi lịch cố định dual-write lại trợ cấp per-block, không ghi đè học phí / 30 phút đã nhập tay. **Học phí học sinh không gói:** chỉ khi lớp `pricing_mode = per_block` thì charge buổi đọc `student_tuition_per_block × sessions.snapshot_block_count` (thiếu per-block hoặc số block thì fallback cột per-session). Lớp `per_session` luôn dùng chuỗi theo buổi. **Trợ cấp gia sư (#135):** lớp `per_block` snapshot `allowance_amount` = `đơn_giá_block × sĩ số present/excused × snapshot_block_count + scale_amount`; trần payroll `max_allowance_per_block × snapshot_block_count`. Lớp `per_session` giữ công thức và trần `max_allowance_per_session` cũ. Cột `*_per_session` không xoá. Xem ADR `docs/adr/2026-09-09-expand-block-pricing.md`.
  - `max_allowance_per_session` là nullable:
    - `null` hoặc `0` = không giới hạn trần trợ cấp theo buổi (aggregate SQL dùng `NULLIF(..., 0)`; API lưu `0` thành `null`)
    - số nguyên dương = áp trần đúng theo giá trị
  - `schedule` (JSONB, **@deprecated**): mảng entry lịch học cũ, giữ nguyên giá trị tại thời điểm migrate `class_schedule_entries` (2026-08-20) làm **backup lịch sử/đối chiếu**, không còn được backend đọc hoặc ghi. Nguồn dữ liệu lịch cố định chính thức hiện là bảng `class_schedule_entries` (mục 4.4.0a). Cấu trúc entry cũ (tham khảo):
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
    Lý do chuyển đi: soft-delete cũ dùng `deletedAt = now()` tại thời điểm admin bấm lưu thay vì ngày slot thực sự ngừng hiệu lực → khi backdate đổi giáo viên, 2 entry (cũ + mới) active chồng lấn trên cùng khung giờ, khiến thuật toán **Cảnh báo chưa dạy** sinh cảnh báo giả cho slot cũ (không có Session khớp `teacherId` cũ).
  - Các trường học phí theo session/package
  - **Ảnh bìa lớp:**
    - `cover_image_path` (`TEXT`, nullable): path ảnh bìa trong bucket **private** `class-covers`, dạng `{classId}/cover.{jpg|png|webp}`; null = thẻ lớp hiện mascot kỳ lân theo ID lớp. API trả signed URL (TTL 1 giờ), không trả path. Upload/gỡ qua `POST`/`DELETE /class/:id/cover-image`: admin, trợ lí với mọi lớp; Gia sư đứng lớp (`class_teachers.status = 'active'`) và Quản lý lớp (`training_manager_staff_id`) chỉ với lớp của mình. Migration `20261002110000_add_class_cover_image`. **Ops phải tạo bucket private `class-covers` trên Supabase trước khi dùng.**
  - **Quản lý lớp (Đào tạo):**
    - `training_manager_staff_id` (nullable FK → `staff_info.id`): nhân sự ban Đào tạo được gán quản lý lớp; chỉnh qua `PATCH /class/:id/training-manager` (admin/assistant).
    - `training_manager_rate_percent` (`DECIMAL(5,2)`, nullable): % trợ cấp quản lý lớp trên tổng học phí buổi (attendance `present`/`excused`); `0` hoặc chưa gán QLL = không phát sinh khoản phải trả.
  - **Không điểm danh (noAttendance):**
    - `no_attendance` (`BOOLEAN`, default `false`): bật=True nghĩa là lớp **không điểm danh**; khi tạo buổi học hệ thống tự tạo `Attendance.present` cho tất cả học sinh active, bỏ qua form điểm danh. Gán/tắt chỉ bởi admin/assistant (`PATCH /class/:id/basic-info`). Session snapshot giá trị này vào `sessions.snapshot_no_attendance` để FE hiển thị đúng cho buổi đã tạo. Đổi cờ lớp **không** hồi tố buổi cũ.
  - **Hạn xem nội dung (contentAccessExpiresAt):**
    - `content_access_expires_at` (`DATE`, nullable): mốc tuyệt đối mà cả lớp cùng mất quyền xem nội dung. Được chốt lúc tạo lớp từ `Course.defaultDurationDays` (null = vô hạn). Sửa `Course.defaultDurationDays` sau đó **không hồi tố** cho lớp đã tạo. Admin có thể sửa tay qua `PATCH /class/:id/basic-info` (`content_access_expires_at`, YYYY-MM-DD hoặc null để xoá hạn).
    - ~~`timeline_custom_order`~~ — đã bỏ ở migration `20261005120000_class_module_order_and_hidden_reason`: timeline lớp không sắp tay nữa, luôn **mới nhất trên** (xem `class_timeline_items`).
    - Học sinh quá hạn: bị chặn toàn bộ trang lớp (list + detail + sub-resources); lớp biến khỏi danh sách. Gia sư/admin vẫn xem được.
    - `ClassStatus.ended` và hết hạn là **hai trục độc lập**: lớp `ended` còn hạn vẫn xem được; lớp `running` hết hạn vẫn bị chặn.
- Mối quan hệ: teachers, students, sessions, makeupScheduleEvents, surveys, `trainingManager` (StaffInfo), `lessons` (tiết riêng lớp, via `class_id`)
- Bảng liên kết `class_teachers` (Class ↔ StaffInfo) ngoài `custom_allowance` (nullable; **null** = kế thừa `classes.allowance_per_session_per_student`; số dương = override, không đổi khi chỉ sửa default lớp qua `PATCH /class/:id/basic-info`) còn có:
  - Expand #134: `custom_allowance` **giữ tên**, backfill sang đơn vị mỗi block 30 phút (`ROUND(giá_cũ / số_block_chuẩn)`). API vẫn nhận/trả mức **theo buổi** (chia lúc ghi, nhân lúc đọc) để không đổi số tiền trên UI/payroll.
  - `status` (`TEXT`, nullable): `null` hoặc `active` được hiểu là phân công gia sư đang mở; `inactive` là **nghỉ dạy theo lớp**. Khi gia sư nghỉ dạy ở một lớp, record được giữ để bảo toàn lịch sử trợ cấp/payroll nhưng không còn là phân công hiện tại.
  - Data migration `20260617120000_inactivate_teachers_on_settled_ended_classes` (superseded): ban đầu yêu cầu cả học phí học sinh có `transaction_id`; `20260617130000_inactivate_teachers_on_teacher_paid_ended_classes` sửa lại — chỉ cần mọi `sessions.teacher_payment_status = paid` trên lớp `ended`, rồi inactive gia sư active trên `class_teachers`; không đụng `student_classes`. Runbook: `docs/ops/README.md`.
  - `custom_scale_amount` (`INTEGER`, nullable, Prisma `customScaleAmount`, migration `20261005000000_add_class_teacher_custom_scale_amount`): **scale riêng** của gia sư trên lớp, VNĐ phẳng mỗi buổi (không nhân sĩ số, không nhân block, không đổi đơn vị theo `pricing_mode`). **null** = theo `classes.scale_amount`; **0** = gia sư không có scale; số dương = khoá số đó, không theo các lần sửa scale lớp sau này. Chỉ đọc lúc tạo buổi (`snapshot_scale_amount = custom_scale_amount ?? classes.scale_amount`) và lúc tính lại buổi unpaid đổi gia sư/lớp; sửa giá trị **không** tính lại buổi đã có. Ẩn với `accountant_income` và quản lý đào tạo như `custom_allowance`. Full update lớp (`POST`/`PATCH /class`) xoá-tạo lại `class_teachers` nhưng giữ giá trị khi payload bỏ field.
  - `tax_rate_percent` (`DECIMAL(5,2)`, default `0`, Prisma field `operatingDeductionRatePercent`): % **khấu trừ vận hành** của gia sư theo từng lớp.
  - FE đang dùng semantic `operating_deduction_rate_percent`; backend vẫn map về cột `tax_rate_percent` để tương thích dữ liệu hiện có.
- Ghi chú:
  - `calendarEventId` trong schedule được điền sau khi đồng bộ lên Google Calendar; dùng để cập nhật recurring event ở các lần sync sau.
  - `meetLink` trong schedule được điền cùng lúc với `calendarEventId` sau khi sync; API occurrence của `/admin/calendar/class-schedule` đọc lại field này để popup lịch mở được link lớp ngay sau khi refetch.
  - `teacherId` lưu gia sư chịu trách nhiệm của từng khung giờ. Từ luồng chỉnh lịch lớp, mỗi entry mới/cập nhật phải có `teacherId` và ID này phải thuộc `class_teachers` của chính lớp đó.
  - Khi API `PUT /admin/calendar/classes/:classId/schedule` nhận payload, mỗi entry dùng field `end`; backend sẽ map thành `to` trước khi lưu JSONB.

### 4.4.0a `class_schedule_entries`

- Migration `20260820100000_class_schedule_entry_table`. Thay thế `classes.schedule` JSONB (nay `@deprecated`, giữ làm backup) làm **nguồn dữ liệu chính** cho lịch học cố định hàng tuần.
- Cột:
  - `id` (PK, `TEXT`) — **giữ nguyên id gốc khi backfill** từ JSON cũ (không re-key), vì `makeup_schedule_events.baseline_schedule_entry_id`, `missed_teaching_explanations.baseline_schedule_entry_id` và Google Calendar `extendedProperties.scheduleEntryId` đều tham chiếu id này.
  - `class_id` (FK → `classes.id`, `onDelete: Cascade`)
  - `teacher_id` (nullable FK → `staff_info.id`) — gia sư chịu trách nhiệm slot
  - `day_of_week` (`INT`, 0=Sunday..6=Saturday), `from`, `to` (`TEXT`, `HH:mm`)
  - `meet_link`, `google_calendar_event_id` (nullable `TEXT`)
  - `effective_from` (`DATE`) — ngày slot **thực sự** bắt đầu có hiệu lực
  - `effective_to` (`DATE`, nullable) — `NULL` = slot đang active; có giá trị = slot ngừng hiệu lực từ ngày đó (soft-close)
  - `created_by_staff_id` (nullable FK → `staff_info.id`), `created_at`, `updated_at`
- Index: `(class_id)`, `(teacher_id)`, `(class_id, effective_to)`, `(class_id, day_of_week, effective_to)`.
- **Cơ chế ghi (soft-close, không hard-delete/overwrite):**
  - Đổi giờ/ngày/giáo viên hoặc gỡ slot → `UPDATE class_schedule_entries SET effective_to = :ngày_hiệu_lực WHERE id = :id` trên entry cũ, **không xoá**.
  - Thêm slot mới hoặc thay thế slot đã đổi → `INSERT` bản ghi mới với `effective_from = :ngày_hiệu_lực`.
  - Mọi write đi kèm bump thủ công `classes.updated_at` trong cùng transaction để giữ nguyên optimistic-lock hiện có của `PATCH /class/:id/schedule` (khoá dựa trên `Class.updatedAt`, không tự động theo bảng con).
- **Cảnh báo chưa dạy** (`buildMissedTeachingAlerts`, `session-schedule-rules.service.ts`) đọc active-window từ bảng này (`effective_from ≤ ngày < effective_to`), tolerance khớp Session riêng `MISSED_ALERT_TIME_TOLERANCE_MINUTES = 60` phút (khác `SCHEDULE_TIME_TOLERANCE_MINUTES = 180` phút dùng khi validate nộp nhận xét). Cho phép **dạy thay trong lớp**: bất kỳ `class_teachers` đang active nào của lớp dạy đúng buổi cũng được tính là đã dạy, không bắt buộc đúng `teacher_id` gán cho slot.
- **Validate nộp nhận xét** (`assertSessionMatchesDeclaredSchedule`/`getScheduleCandidates`) cũng áp dụng **dạy thay trong lớp**: nếu giáo viên nộp bài đang là `class_teachers` active của lớp (`status = 'active'` hoặc `null`), hệ thống match theo mọi slot active trong ngày của lớp bất kể `teacher_id` gán cho entry, không chỉ đúng entry của chính họ. Giáo viên đã bị gỡ khỏi lớp (`status = 'inactive'`) chỉ còn match được đúng entry ghi `teacher_id` của họ (thường không còn active sau khi bị gỡ) — tránh lợi dụng slot dạy thay của người khác.
- `dashboard.service.ts` đếm "lớp chưa có lịch"/số slot lịch cố định dựa trên `class_schedule_entries WHERE effective_to IS NULL` thay vì parse JSON.

### 4.4.0-cat `courses` (Khoá học)

- Thay thế enum cố định `ClassType` (`vip|basic|advance|hardcore`) — migration `20260818090000_add_class_category`, đổi tên in-place sang `courses` ở migration `20260906000000_rename_class_category_to_course` (ADR `docs/adr/2026-09-05-class-category-becomes-course.md`). Admin tự quản lý danh sách qua CRUD `/courses` (`CourseController`/`CourseService`).
- Cột: `id` (PK, `@default(uuid())` tự sinh), `name`, `default_duration_days` (INT nullable, `null` = vô hạn — thời hạn mặc định khi tạo lớp từ khoá), `sort_order` (số nguyên, default `0`, dùng để sắp xếp hiển thị), `is_active` (default `true`), `is_one_time` (BOOLEAN NOT NULL default `false`, migration `20261004000000_one_time_course_setting` bật cho khoá `THPTQG` và `PREVOI` — **Khoá bán một lần**: mọi lớp của khoá có `pricing_mode = one_time`), `created_at`, `updated_at`. Migration `20260818130000_drop_class_category_code` bỏ cột `code` — không còn mã phân loại thủ công, chỉ cần điền tên khi tạo.
- Quan hệ: `classes` (1-N, `classes.course_id` FK `onDelete: Restrict`), `course_difficulty_levels` (1-N), `course_lesson_plan_members` (1-N), `modules` (1-N), `lessons` (1-N).
- **Thời hạn mặc định**: `default_duration_days` để trống/null nghĩa là vô hạn; sửa mặc định sau khi lớp đã tạo **không hồi tố** cho lớp cũ (mốc chốt `Class.contentAccessExpiresAt` theo lớp).
- Hành vi API:
  - `GET /courses?includeInactive=` — mặc định chỉ trả `is_active=true`; `includeInactive=true` trả cả bản ghi đã ẩn (dùng cho trang quản trị `/admin/courses`). Mỗi dòng kèm `_count` (`classes`, `lessonPlanMembers`, `difficultyLevels` — chỉ đếm mức khó `is_active=true`). **Lọc theo người gọi (server-side, không nhận cờ từ client):** đội giáo án thuần (role `lesson_plan` và/hoặc `lesson_plan_head`, không kèm `admin` / `assistant`) chỉ nhận khoá mình được gán qua `course_lesson_plan_members`. Mọi role khác — gồm `admin`, `assistant`, `training`, `teacher`, `accountant_income`, `accountant_expense`, `customer_care` — nhận toàn bộ danh sách như trước. Phạm vi này do `CourseAccessService.resolveListableCourseIds` (khác `resolveViewableCourseIds`, hàm kia là phạm vi *quản lý nội dung* và **không** dùng để lọc GET list). Endpoint vẫn yêu cầu auth admin/staff; thiếu staff profile không crash — không thuộc đội giáo án thuần thì vẫn nhận mọi khoá.
  - `POST /courses` — cần `name`; `default_duration_days` (để trống = vô hạn) và `sort_order` tuỳ chọn; `id` tự sinh. Guard: admin đầy đủ, `assistant`, `lesson_plan_head`. `CourseService.create(actor, dto)`: trưởng giáo án (không kèm admin/assistant) tạo khoá thì tự được thêm vào `course_lesson_plan_members` của khoá đó. `is_one_time` tuỳ chọn (default `false`); gửi `true` mà không phải admin/trợ lí trả `403`.
  - `PATCH /courses/:id` — cập nhật `name`/`default_duration_days`/`sort_order`/`is_active` khi field được truyền; truyền `default_duration_days: null` để chuyển về vô hạn. Cùng guard với `POST`; service gọi `assertCanManageCourse` — trưởng giáo án chỉ sửa khoá được gán (`403` nếu không). **`is_one_time`:** đổi giá trị chỉ admin/trợ lí (`403` với trưởng giáo án; gửi lại đúng giá trị cũ thì bỏ qua). Bật: `400` nếu lớp nào của khoá đã có điểm danh present/excused mang `tuition_fee > 0` (cần backfill riêng), hoặc còn lớp có `tuition_package_total` null/≤ 0. Tắt: luôn được. Trong cùng transaction, mọi lớp của khoá chuyển `pricing_mode` sang `one_time` (bật) hoặc `per_session` (tắt), không tính lại buổi nào.
  - `DELETE /courses/:id` — cùng guard với `POST`. `400` nếu còn lớp đang dùng khoá học này (`classes.count > 0`); message: `Không thể xoá: còn N lớp đang dùng khoá học này. Hãy chuyển lớp sang khoá khác hoặc chỉ ẩn (is_active=false) khoá học này.` `CourseService.remove(actor, id)` gọi `assertCanManageCourse` như `PATCH`.
- Guard phân quyền nội dung khoá (reusable `CourseAccessService`, dùng lại cho mọi ticket nội dung khoá về sau): admin đầy đủ / trợ lí quản lý được mọi khoá; đội giáo án (`lesson_plan`, `lesson_plan_head`) chỉ thấy/sửa khoá mình được gán (qua `course_lesson_plan_members`); gia sư đang dạy lớp thuộc khoá X **không** vì thế mà sửa được nội dung cấp khoá của X. Các service resource trong `CourseContentModule` gọi `assertCanManageCourse` (qua `CourseContentSupportService`) trước mọi ghi Module / Lesson nhánh khoá / tiết thực hành cấp khoá và trước GET câu hỏi/quiz trả đáp án cấp khoá; `assertCanWriteCourseQuestions` chỉ áp dụng khi ghi **ngân hàng câu hỏi**.
- Controller cây nội dung khoá (`course-modules`, `course-lessons` CRUD/reorder, chưa gồm quiz): `@AllowStaffRolesOnAdminRoutes(assistant, teacher, lesson_plan_head)`. **Không** mở `lesson_plan` thuần ở tầng controller (họ soạn câu hỏi/tiết thực hành, không soạn cây Chuyên đề). `StaffRole.teacher` vẫn nằm trên decorator; tầng service tiếp tục 403 nếu không thuộc đội giáo án. Chi tiết bảng: `docs/api/courses.md`.
- Seed dữ liệu ban đầu gồm các mã cũ (`vip`, `basic`, `advance`, `hardcore`) cộng 3 mã mới: `thpt_basic` (THPT BASIC), `thpt_advanced` (THPT ADVANCED), `thpt_luyen_de` (THPT Luyện Đề).
- Khi tạo lớp không truyền `course_id`, `ClassService.resolveDefaultCourseId` fallback về khoá học `is_active=true` có `sort_order` nhỏ nhất (tie-break theo `name`) — không còn hardcode `code='basic'` để tránh vỡ khi admin đổi/xoá phân loại mặc định cũ.

### 4.4.0-cat-diff `course_difficulty_levels` (Mức độ khó của khoá học)

- Mỗi `course` có nhiều mức độ khó (vd. "Dễ", "Trung bình", "Khó"), quản lý qua CRUD `/courses/:courseId/difficulty-levels`. Không dùng thang cố định Dễ/TB/Khó toàn hệ thống.
- Cột: `id` (PK, `@default(uuid())` tự sinh), `course_id` (FK → `courses.id`, `onDelete: Cascade`), `name` (TEXT), `sort_order` (INT, default `0`), `is_active` (BOOLEAN, default `true`), `created_at`, `updated_at`.
- Index: `(course_id)`, unique `(course_id, name)`.
- Unique business logic: tên mức khó duy nhất trong cùng một khoá học (enforce ở service layer + unique index).
- Hành vi API:
  - `GET /courses/:courseId/difficulty-levels?includeInactive=` — mặc định chỉ trả `is_active=true`.
  - `POST /courses/:courseId/difficulty-levels` — cần `name` (+ `sort_order` tuỳ chọn).
  - `PATCH /courses/:courseId/difficulty-levels/:id` — cập nhật `name`/`sort_order`/`is_active`; `PATCH .../reorder` đổi thứ tự toàn bộ danh sách (mảng `{id, sort_order}`).
  - `DELETE /courses/:courseId/difficulty-levels/:id` — xoá cứng mức khó (chưa có bảng nội dung tham chiếu ở ticket này; khi ngân hàng câu hỏi ra sau sẽ phải soft-delete).

### 4.4.0-cat-members `course_lesson_plan_members` (đội giáo án của khoá học)

- Bảng quan hệ N-N giữa `courses` và `staff_info`: nhân sự được gán soạn nội dung học thuật + ngân hàng câu hỏi của một khoá. Việc gán do admin, `lesson_plan_head` hoặc `assistant` thực hiện (giới hạn ở controller `CourseController`).
- Cột: `id` (PK, `@default(uuid())` tự sinh), `course_id` (FK → `courses.id`, `onDelete: Cascade`), `staff_id` (FK → `staff_info.id`, `onDelete: Cascade`), `created_at`.
- Index: unique `(course_id, staff_id)`, `(course_id)`, `(staff_id)`. Migration: `20260907000000_add_course_lesson_plan_members`.
- Chỉ gán được nhân sự `staff_info.status = active` có `roles` chứa `lesson_plan` hoặc `lesson_plan_head`.
- Hành vi API (`/courses/:courseId/lesson-plan-members`):
  - `GET` — danh sách member kèm staff `{id, fullName, roles, status}`.
  - `PUT` — body `{ staff_ids: string[] }`, thay thế toàn bộ danh sách hiện tại; `400` nếu có staff không hợp lệ.
  - `GET /courses/lesson-plan-staff?search=&limit=` — nhân sự active có role `lesson_plan`/`lesson_plan_head` để fill picker gán đội giáo án.
- `GET /courses/:id` — chi tiết khoá kèm `difficultyLevels` (mọi trạng thái, theo `sort_order`) + `lessonPlanMembers` + `_count.classes`; route mở cho admin/trợ lí và thành viên đội giáo án (kể cả trưởng giáo án) của đúng khoá.

### 4.4.0 `student_classes` (Class ↔ StudentInfo)

- Bảng N-N: mỗi hàng là một học sinh thuộc một lớp.
- `status` (`StudentClassStatus`, nullable): trạng thái tham gia lớp của học sinh (`active | inactive`).
  - Runtime rule hiện tại: `null` được xử lý như `inactive` trong các luồng vận hành lớp (danh sách học sinh đang học, sĩ số, tạo buổi mới, validate attendance).
  - Khi thêm/tái thêm học sinh vào lớp qua API quản trị, backend luôn ghi `status = active`; khi bỏ khỏi danh sách lớp, backend chuyển `status = inactive` thay vì xóa bản ghi membership.
- Các cột override học phí (nullable int):
  - `custom_student_tuition_per_session`
  - `custom_tuition_per_block` (học phí riêng mỗi block 30 phút; học sinh không gói: charge buổi = cột này × `sessions.snapshot_block_count` nếu có; `null` khi không có override hoặc lớp không có số block chuẩn)
  - `custom_tuition_package_total`
  - `custom_tuition_package_session`
- **Semantics thống nhất với backend:** giá trị `0` trên các cột override được xử lý như **không override** (kế thừa học phí/gói từ `classes`), tương đương `null` trong logic tính `effective*` và trong SQL aggregate dashboard (`NULLIF(..., 0)` trên các cột custom). Khi cập nhật danh sách học sinh lớp hoặc `PATCH /class/:id/student-tuition`, API chuẩn hóa `0` → lưu `null` và **derive** `custom_student_tuition_per_session` từ gói riêng (`custom_tuition_package_total ÷ custom_tuition_package_session`, làm tròn) khi có gói hợp lệ.
- Index read path:
  - `student_id`
  - `class_id`
  - composite `(class_id, student_id)` (hot path cho validate roster/session update)
  - composite `(class_id, status, created_at)` (hot path cho danh sách roster theo lớp/trạng thái)
  - composite `(student_id, class_id)` (hot path cho membership lookups theo học sinh)

### 4.4.0b `class_content_items` (Nội dung lớp học)

- Bảng liên kết lớp ↔ nội dung: mỗi hàng là một mục nội dung (hiện tại chỉ `lesson`) trong danh sách nội dung của lớp. Với tiết luyện tập, hàng này chính là **lần giao** (xem `CONTEXT.md`): tiết (`lessons`/`question_links`) dùng chung nhiều lớp; lịch mở bài thuộc lớp. Với tiết lý thuyết, hàng được **materialize** từ `class_modules` (không thêm lẻ): thêm chuyên đề tạo/khôi phục item, gỡ chuyên đề ẩn mềm, tạo tiết lý thuyết trong chuyên đề đồng bộ sang mọi lớp đã thêm, xoá tiết lý thuyết xoá item của nó. ADR `docs/adr/2026-10-02-class-content-by-module.md`.
- `class_id` (FK → `classes.id`, `onDelete: Cascade`)
- `kind` (`ClassContentItemKind`, default `lesson`) — phân loại nội dung. Hiện tại chỉ có `lesson`.
- `lesson_id` (nullable FK → `lessons.id`, `onDelete: Restrict`) — FK đến tiết học. Nullable để hỗ trợ future kinds không cần lesson. Không Cascade/SetNull: xóa Chuyên đề / Tiết học cấp khoá khi còn lần giao **tiết thực hành** (kể cả đã ẩn) bị chặn 409; item tiết lý thuyết được ứng dụng xoá trước trong cùng transaction. ADR `docs/adr/2026-09-07-class-content-soft-hide-restrict-knowledge-tree.md` (sửa bởi ADR 2026-10-02).
- `sort_order` (`INT`, default 0) — thứ tự hiển thị trong danh sách nội dung lớp.
- `open_at` (`TIMESTAMPTZ`, nullable) — thời điểm mở bài của **lần giao**. Chỉ dùng khi lesson `kind = practice`. Không nằm trên `lessons`. Khi `POST /class/:id/content` luyện tập **không** gửi `openAt`, backend ghi thời điểm tạo lần giao (đồng hồ server), không lấy giờ máy client.
- `duration_minutes` (`INT`, nullable) — thời lượng làm bài (phút) của lần giao. 1–720. Chỉ dùng khi lesson `kind = practice`. Không nằm trên `lessons`.
- `hidden_at` (`TIMESTAMPTZ`, nullable, default null) — thời điểm ẩn mềm khỏi học sinh. Null = đang hiện.
- `hidden_by_staff_id` (nullable FK → `staff_info.id`, `onDelete: SetNull`) — staff đã ẩn.
- `hidden_reason` (`ClassContentHiddenReason`, nullable) — null khi đang hiện. `manual` = gia sư tự ẩn; `module_removed` = ẩn do gỡ chuyên đề (cả tiết lý thuyết lẫn **lần giao tiết thực hành** của chuyên đề; attempt giữ nguyên). Thêm lại chuyên đề chỉ hiện lại item `module_removed`, item `manual` vẫn ẩn. ADR `docs/adr/2026-10-05-class-module-order-and-removal.md`.
- Unique constraint: `(class_id, lesson_id)` — mỗi tiết chỉ xuất hiện tối đa 1 lần trong nội dung của một lớp; cùng một tiết vẫn giao được cho nhiều lớp (mỗi lớp một hàng độc lập). Item đã ẩn vẫn chiếm unique — khôi phục, không thêm lại.
- Migration: `20260910000000_add_class_content_items` — tạo bảng + backfill các topic (cũ) `class_id IS NOT NULL`.
- Migration: `20260912000000_add_class_content_assignment_schedule` — thêm `open_at` + `duration_minutes`.
- Migration: `20260918000000_soft_hide_class_content` — `hidden_at` / `hidden_by_staff_id`; FK Cascade → Restrict; `attempts.assignment_id` Cascade → Restrict.
- Migration: `20260921000000_rename_three_level_content` — `topic_id` → `lesson_id`; enum value `topic` → `lesson`; lớp từng gán một chuyên đề lý thuyết N bài có N hàng (ẩn/người ẩn copy nguyên trạng).
- Migration: `20261002120000_add_class_modules` — lớp có tiết lý thuyết thêm lẻ (đang hiện) được thêm nguyên chuyên đề + tiết lý thuyết còn thiếu (item + dòng timeline); lớp không bật thứ tự timeline tuỳ chỉnh được sắp lại theo thời gian; item + dòng timeline của tiết riêng lớp bị ẩn.
- Migration: `20261005120000_class_module_order_and_hidden_reason` — thêm enum `ClassContentHiddenReason` + cột `hidden_reason`; backfill item đang ẩn (lý thuyết của chuyên đề lớp không còn = `module_removed`, còn lại `manual`); ẩn (`module_removed`) lần giao thực hành đang hiện thuộc chuyên đề lớp đã gỡ, kèm dòng timeline.

### 4.4.0b-mod `class_modules` (Chuyên đề của lớp)

- Một hàng = lớp đã thêm một Chuyên đề của khoá. Nguồn sự thật để đồng bộ tiết lý thuyết của chuyên đề vào `class_content_items`. Tiết thực hành không tự kéo theo.
- `id` (UUID, PK), `class_id` (FK → `classes.id`, `onDelete: Cascade`), `module_id` (FK → `modules.id`, `onDelete: Cascade`), `sort_order` (`INT`, default 0), `created_at` (`TIMESTAMPTZ`).
- `sort_order` — thứ tự nhóm chuyên đề **của riêng lớp** (nhỏ lên trước); admin/staff kéo-thả trên tab **Chuyên đề** (`PUT /class/:id/modules/order`), học sinh thấy cùng thứ tự. Thêm (hoặc thêm lại) chuyên đề → lên đầu. Không đọc/ghi `modules.sort_order` (thứ tự cấp khoá).
- Gỡ chuyên đề = xoá hàng (coi như chưa từng thêm): tiết lý thuyết + lần giao thực hành của chuyên đề bị ẩn `hidden_reason = module_removed`.
- Unique `(class_id, module_id)`; index `(module_id)` (tra lớp khi tạo tiết lý thuyết mới), `(class_id, sort_order)`.
- Chuyên đề phải thuộc khoá của lớp (guard ứng dụng, 400).
- Migration: `20261002120000_add_class_modules` (test SQL: `apps/api/prisma/tests/20261002120000_add_class_modules.test.sql`).
- Migration: `20261005120000_class_module_order_and_hidden_reason` — thêm `sort_order`, backfill theo `modules.sort_order` trong từng lớp.

### 4.4.0ba `class_theory_lesson_views` (Lượt xem tiết lý thuyết)

- Một hàng ghi nhận một học sinh đã mở trang **Tiết lý thuyết** qua một `class_content_items` cụ thể. Không backfill lịch sử trước khi có tracking.
- `class_content_item_id` (FK → `class_content_items.id`, `onDelete: Cascade`) — phạm vi lớp/tiết được xem.
- `student_id` (FK → `student_info.id`, `onDelete: Cascade`)
- `last_viewed_at` — lần mở gần nhất của học sinh cho tiết lý thuyết đó.
- Unique constraint: `(class_content_item_id, student_id)` (`ctlv_cci_student_id_key`).
- Index: `(class_content_item_id, last_viewed_at)` (`ctlv_cci_last_viewed_at_idx`) cho dialog tiến độ; index `student_id`.
- Migration: `20260910181000_add_class_theory_topic_views` tạo bảng tên cũ; `20260921000000_rename_three_level_content` đổi tên bảng. Backfill: lượt xem cũ gắn vào **tiết đầu tiên** của chuyên đề lý thuyết cũ (content item gốc); các tiết sau bắt đầu chưa xem.

### 4.4.0bb `class_timeline_items` (Timeline lớp)

- Join riêng buổi học / báo cáo khảo sát / lần giao tiết học trên một lớp. Không thay `class_content_items`.
- `class_id` (FK → `classes.id`, `onDelete: Cascade`)
- `kind` (`ClassTimelineItemKind`): `session` | `class_survey` | `content_item`
- XOR FK (CHECK + unique từng cột): `session_id`, `class_survey_id`, `class_content_item_id` — cascade khi xóa entity gốc.
- `hidden_at` / `hidden_by_staff_id` — cùng nghĩa ẩn mềm với `class_content_items`. Ẩn lần giao đồng thời ẩn dòng timeline `content_item`. Học sinh `GET .../timeline/student` lọc `hidden_at IS NULL`.
- `sort_order` — luôn **mới nhất trên, cũ nhất dưới** (buổi = ngày+giờ, khảo sát = ngày báo cáo, chuyên đề = `open_at` hoặc `created_at`); tạo/sửa ngày tự xếp lại. Không sắp tay (đã bỏ DnD + `POST .../timeline/reorder` + `classes.timeline_custom_order`, migration `20261005120000_class_module_order_and_hidden_reason`). Học sinh đọc cùng thứ tự (cursor = id dòng trước, lọc `sort_order >`). Lịch sử: `20260916000000_timeline_sort_by_time` (ASC) rồi `20260917000000_timeline_newest_first` (DESC).
- Index: `(class_id, sort_order)`.
- Migration: `20260915000000_add_class_timeline_items` — bảng + CHECK + backfill ban đầu. `20260921000000_rename_three_level_content` chèn thêm dòng timeline khi một lần giao lý thuyết nở thành N tiết.

### 4.4.0c `attempts` / `attempt_answers` (Bài làm)

- Mỗi `attempts` là **một lượt** học sinh làm một lần giao luyện tập. FK `assignment_id` → `class_content_items.id` (không có `topic_id`) — cùng một đề giao nhiều lớp cho ra bảng điểm độc lập (ADR live-link). `onDelete: Restrict` — không xoá lịch sử khi ẩn/cố xoá lần giao.
- `student_id` (FK → `student_info.id`, `onDelete: Cascade`)
- `started_at` — mốc đồng hồ **của học sinh này** (lúc bấm bắt đầu), không phải `open_at` của lớp.
- `duration_minutes` — snapshot thời lượng lần giao lúc bắt đầu; sửa lịch lớp sau đó không đổi đồng hồ lượt đang chạy.
- `status` (`AttemptStatus`): `in_progress` | `submitted` | `timed_out`. Hết giờ → `timed_out`, chốt câu đã trả lời và chấm MCQ, **không huỷ**. `endsAt` là trường tính (`started_at + duration_minutes`), không lưu cột. Cron `@nestjs/schedule` `EVERY_MINUTE` (`AttemptExpiryJob` → `AttemptService.finalizeExpiredInProgress`) quét `in_progress` đã quá `endsAt` và gọi cùng `gradeAndClose` với GET/nộp — học sinh đóng tab không làm lượt kẹt. Claim bằng `updateMany` `WHERE id AND status = in_progress` trong transaction: trùng nút Nộp không double-grade. Job log số lượt đã chốt; 0 bản ghi không nổ. `ScheduleModule.forRoot` tắt cron khi `NODE_ENV=test`.
- Unique partial: tối đa một `in_progress` trên `(assignment_id, student_id)`. Làm lại = tạo lượt mới; lượt cũ giữ nguyên.
- `attempt_answers`: một hàng / câu. Lúc `start` snapshot toàn bộ đề: `type`, `content`, `options`, `correct_index`, `explanation`, `answer_guide`, `difficulty_label`, thứ tự, và `points_possible`. `points_possible` = chia 100 đều N câu (Hamilton: phần dư +1 từ câu đầu); **không** lấy `question_links.points`. Chấm MCQ/tự luận chỉ đọc snapshot, không join `questions` live. `onDelete: Restrict` với `questions`. Không cascade theo `question_links`.
- Chấm tự động chỉ `single_choice` (so `choice_index` với snapshot `correct_index`). Tự luận để `points_awarded`/`is_correct` null (`has_ungraded_essay`).
- `attempt_answers.feedback` (`TEXT`, nullable) — nhận xét của gia sư cho câu tự luận đó; chỉ có sau khi chấm. Ticket #63.
- `attempt_answers.marked_for_review` (`BOOLEAN`, default `false`) — học sinh đánh dấu quay lại xem trước nộp trong lượt `in_progress`; autosave qua `PATCH .../answers`; không ảnh hưởng chấm điểm.
- Chấm tự luận (#63): gia sư chấm từng câu qua `points_awarded` (0..`points_possible` snapshot 100/N, không đụng `auto_graded_score`/`auto_graded_max` vốn chỉ của MCQ) + `feedback`. `is_correct` giữ `null` cho tự luận (chấm theo thang điểm, không phải đúng/sai). Khi không còn câu tự luận `points_awarded IS NULL` trong lượt → set `has_ungraded_essay = false`. Hàng đợi chấm chỉ gồm câu tự luận chưa chấm của **lượt mới nhất** mỗi học sinh (`DISTINCT ON (student_id) ORDER BY started_at DESC`); lượt cũ tra cứu được nhưng không vào hàng đợi và bị từ chối chấm (404). N = 0 → `start` không tạo Attempt.
- Migration: `20260913000000_add_attempts`, `20260914000000_add_attempt_answer_feedback` (thêm cột `feedback`), `20260918000000_attempt_answer_exam_snapshot` (snapshot đề + thang 100), `20260920000000_attempt_answer_marked_for_review` (cột `marked_for_review`). ADR `docs/adr/2026-09-07-attempt-exam-snapshot.md`.

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
- Trường chính: ngày học, start/end time, `coefficient` (hệ số buổi học 0.0–1.0), `allowance_amount`, `teacher_payment_status`, `tuition_fee`, `lesson_content`, `homework`, `tutorial`, `recording_url`
- `start_time`, `end_time` (`TIME`, nullable trên DB cho dữ liệu cũ): **bắt buộc** khi tạo buổi (`POST /sessions`, `POST /staff-ops/classes/:classId/sessions`). Giờ kết thúc phải sau giờ bắt đầu. Khi sửa, nếu payload gửi giờ thì cả hai phải có và kết thúc phải sau bắt đầu. Buổi `paid`/`deposit` **không cho đổi giờ** (cùng lý do khóa card Trợ cấp buổi: giờ sẽ là căn cứ tính tiền). Script chỉ-đọc `pnpm --filter api sessions:list-missing-time` liệt kê buổi đang thiếu giờ (id, tên lớp, ngày).
- `recording_url` (`TEXT`, nullable): link video YouTube ghi lại buổi học để học sinh xem lại bài giảng.
- `allowance_amount`: snapshot **trước hệ số**. Lớp theo buổi: `(snapshot_per_student_allowance × sĩ số present/excused) + snapshot_scale_amount`. Lớp theo block: cùng phép cộng vì `snapshot_per_student_allowance` đã là `đơn_giá_block × snapshot_block_count` (tương đương cả buổi); `scale_amount` không nhân block. Payroll **không** cộng thêm `classes.scale_amount`.
- `snapshot_per_student_allowance` (`INTEGER`, nullable): trợ cấp mỗi học sinh đã resolve tại lúc **tạo**/recalc unpaid. Lớp theo buổi: `custom_allowance` reconstruct per-session ?? default lớp. Lớp theo block: `đơn_giá_block × snapshot_block_count` (session-equivalent).
- `snapshot_scale_amount` (`INTEGER`, nullable): scale hiệu lực của gia sư dạy buổi tại thời điểm **tạo** buổi học — `class_teachers.custom_scale_amount ?? classes.scale_amount` (0 giữ là 0); không ghi đè sau đó (trừ tính lại buổi unpaid khi đổi gia sư/lớp).
- `snapshot_block_count` (`INTEGER`, nullable): số block 30 phút của buổi tại thời điểm **tạo** (từ `start_time`/`end_time`, fallback số block chuẩn của lớp), **chỉ khi** lớp `pricing_mode = per_block`. Payroll lịch sử không được suy lại từ giờ buổi. Trần trợ cấp lớp theo block = `max_allowance_per_block × snapshot_block_count`.
- Khi sửa điểm danh buổi chưa thanh toán (`teacher_payment_status = unpaid`), API tự tính lại `allowance_amount` từ snapshot per-student + scale (không nhân lại block). Buổi cũ không có snapshot (null) fallback đọc live từ `classes` / `class_teachers`.
- Trần trợ cấp không snapshot tại `sessions`. Aggregate payroll/report: lớp `per_session` đọc `classes.max_allowance_per_session`; lớp `per_block` có `snapshot_block_count` đọc `max_allowance_per_block × snapshot_block_count`. `0`/`null` = không trần. Buổi frozen thiếu snapshot block vẫn dùng trần theo buổi dù lớp đã đổi sang per_block.
- `lesson_content` (`TEXT`, nullable): nội dung bài học (LEVEL, CONTEST, kiến thức đã dạy); bắt buộc khi tạo/cập nhật buổi qua API.
- `homework` (`TEXT`, nullable): bài tập về nhà; bắt buộc khi tạo/cập nhật buổi qua API.
- `tutorial` (`TEXT`, nullable): **Tutorial các buổi học** (hướng dẫn/tài liệu tham khảo buổi); bắt buộc khi tạo/cập nhật buổi qua API. Khác `cf_problem_tutorials.tutorial` (tutorial bài Codeforces).
- `notes` (`TEXT`, nullable): bản ghi text template Zalo 5 phần (đồng bộ với nút **Copy nhận xét**); FE ghi khi tạo/cập nhật buổi từ `lesson_content`, `homework`, `tutorial` và `attendance.notes`. Dữ liệu cũ có thể là HTML legacy hoặc đã backfill sang `lesson_content`. Form mới không còn ô nhập trực tiếp `notes`.
- Snapshot khấu trừ theo buổi:
  - `teacher_tax_rate_percent` (`DECIMAL(5,2)`, default `0`, Prisma field `teacherOperatingDeductionRatePercent`): snapshot mức **khấu trừ vận hành** effective của cặp gia sư-lớp; trước thanh toán được refresh khi tạo/cập nhật session, khi chuyển sang `paid` được snapshot lại theo thời điểm thanh toán.
    - Buổi mới/cập nhật luôn snapshot theo `class_teachers.operatingDeductionRatePercent` hiện hành; FE không còn toggle tắt phí vận hành từng buổi. Field request `includeTeacherOperatingDeduction=false` vẫn tồn tại ở API (legacy) nhưng UI không gửi; buổi cũ đã snapshot `0%` giữ nguyên cho lịch sử thanh toán.
  - `teacher_tax_deduction_rate_percent` (`DECIMAL(5,2)`, default `0`, Prisma field `teacherTaxDeductionRatePercent`): snapshot mức **khấu trừ thuế** áp dụng cho khoản dạy học; trước thanh toán được refresh khi tạo/cập nhật session, khi chuyển sang `paid` được snapshot lại theo thời điểm thanh toán.
  - Semantics hiện tại: khấu trừ vận hành của gia sư vẫn được tính ở mức từng buổi; khấu trừ thuế được aggregate trên **tổng gross theo nguồn + rate bucket trong kỳ**, nên các view chi tiết lớp/buổi của gia sư dùng số **sau vận hành, trước thuế**.
- **Snapshot trợ cấp quản lý lớp (Đào tạo):**
  - `training_manager_staff_id` (nullable FK → `staff_info.id`): snapshot từ `classes.training_manager_staff_id` khi tạo/cập nhật buổi.
  - `training_manager_rate_percent` (`DECIMAL(5,2)`, nullable): snapshot % từ lớp tại thời điểm ghi buổi.
  - `training_manager_allowance_amount` (`INTEGER`, nullable): `ROUND(tổng tuition_fee present/excused × rate / 100)`; `0`/null khi chưa gán QLL hoặc rate = 0.
  - `training_manager_payment_status` (`PaymentStatus`, default `pending`): thanh toán payroll theo buổi (pattern CSKH).
  - `training_manager_tax_deduction_rate_percent` (`DECIMAL(5,2)`, nullable): snapshot thuế khi chuyển `paid`.
- `snapshot_no_attendance` (`BOOLEAN`, default `false`): snapshot từ `classes.noAttendance` tại thời điểm tạo buổi; `true` = buổi này tự tạo `Attendance.present` cho toàn bộ học sinh active (không cần nhập điểm danh). FE ẩn form điểm danh khi snapshot = true. Payload tạo/sửa buổi **không** nhận `noAttendance`. ADR: `docs/adr/2026-09-05-class-without-attendance-still-charges.md`.
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
- `payroll_basis_tuition_fee` (`INTEGER`, nullable): học phí gốc đóng băng làm cơ sở hoa hồng (trợ lí 3% và CSKH `tuition × customer_care_coef`). Có giá trị thì mọi phép tính hoa hồng đọc cột này thay cho `tuition_fee`, bất kể trạng thái thanh toán; null thì đọc `tuition_fee`. Migration `20261002100000_backfill_one_time_course_tuition` đặt cột này cho mọi dòng present/excused của lớp khoá `THPTQG`/`PREVOI` trước khi dồn học phí về buổi đầu, để hoa hồng không đổi theo ngày ghi nhận doanh thu. `20261004000000_one_time_course_setting` làm tương tự (chỉ dòng còn null) cho THPTQG 02 và PREVOI 02 trước khi backfill ví.

### 4.6b `lesson_plan_head_commission`

- Snapshot hoa hồng doanh thu của **Trưởng giáo án** (role `lesson_plan_head`) theo **từng buổi học toàn hệ thống** (pattern giống commission CSKH trên `attendance`, nhưng tách bảng riêng vì có thể có NHIỀU staff giữ role này cùng lúc, mỗi người % khác nhau).
- Mỗi buổi học chargeable (`attendance.tuition_fee > 0`) sinh **1 dòng cho MỖI nhân sự `lesson_plan_head` đang active** có `staff_info.revenue_share_percent` khác null tại thời điểm buổi được tạo/cập nhật; đồng bộ idempotent qua `syncLessonPlanHeadCommissions()` (`apps/api/src/payroll/lesson-plan-head-commission.util.ts`), gọi trong transaction tạo/sửa session.
- Cột:
  - `attendance_id` (FK → `attendance.id`, cascade), `staff_id` (FK → `staff_info.id`, cascade)
  - `coef_percent` (`DECIMAL(5,2)`): snapshot `revenue_share_percent` của staff tại thời điểm sync
  - `amount` (`INTEGER`): `ROUND(attendance.tuition_fee × coef_percent / 100)`
  - `payment_status` (`PaymentStatus`, default `pending`)
  - `created_at`
- Unique: `(attendance_id, staff_id)`. Index: `(staff_id, payment_status)` cho aggregate payroll.
- Sync chỉ cập nhật dòng `pending` (không đụng dòng đã `paid`); buổi chuyển non-chargeable sẽ xóa dòng `pending` tương ứng.
- Nguồn payroll `revenue_share` trong payment-preview (`GET /staff/:id/payment-preview`, `POST /staff/:id/payments/pay-all|pay-selected`) đọc/ghi trực tiếp bảng này; không áp thuế (`taxRatePercent = 0` cố định cho nguồn này).

### 4.6c-b `modules` (Chuyên đề — nhóm tiết học trong khoá học)

- Nhóm các tiết học bên trong một khoá học; mỗi module thuộc đúng 1 course. Không tồn tại ở cấp lớp.
- Cột:
  - `id` (PK, UUID default)
  - `course_id` (FK → `courses.id`, cascade)
  - `title` (`TEXT`): tiêu đề chuyên đề
  - `sort_order` (`INTEGER`, default 0): thứ tự sắp xếp
  - `created_at`, `updated_at` (`TIMESTAMPTZ`)
- Index: `(course_id)`
- Quan hệ: `courses` (1-N), `lessons` (1-N), `questions` (1-N — ngân hàng câu hỏi phân loại theo chuyên đề)
- Đổi tên in-place từ `chapters` (Chủ đề cũ) ở migration `20260921000000_rename_three_level_content`. ADR `docs/adr/2026-09-15-three-level-content-model.md`.

### 4.6c `lessons` (Tiết học — đơn vị nội dung học sinh nhìn thấy)

- Ba cấp: **Khoá học → Chuyên đề → Tiết học**. Khái niệm Bài học (`lectures`) biến mất: mỗi lecture cũ là **một** tiết lý thuyết riêng, không gộp.
- Thuộc một trong hai chế độ (CHECK `lessons_owner_check`, giữ để dữ liệu cũ hợp lệ):
  - **Khoá học — trong Chuyên đề** (`course_id` + `module_id` không null, `class_id` null): nội dung chung cho mọi lớp dùng khoá đó. Mọi tiết mới đều thuộc chế độ này.
  - **Lớp — legacy** (`class_id` không null, `course_id` + `module_id` null): tiết riêng lớp cũ. API không tạo mới nữa (400); migration `20261002120000_add_class_modules` set `archived_at` cho tất cả. ADR `docs/adr/2026-10-02-class-content-by-module.md`.
- `kind` (`LessonKind`): `theory` (lý thuyết — video + nội dung + bài tập ôn nhẹ tuỳ chọn) hoặc `practice` (thực hành — thuần tập câu hỏi). CHECK `lessons_practice_no_media_check`: `practice` thì `video_url` và `content` phải NULL.
- Cột chính:
  - `id` (UUID, PK) — practice / theory-không-lecture giữ id topic cũ; theory có lecture giữ id lecture cũ
  - `kind` (`LessonKind`)
  - `course_id` (FK → `courses.id`, cascade, nullable)
  - `module_id` (FK → `modules.id`, cascade, nullable)
  - `class_id` (FK → `classes.id`, cascade, nullable)
  - `title` (`TEXT`)
  - `video_url` (`TEXT`, nullable) — chỉ tiết lý thuyết
  - `content` (`TEXT`, nullable) — chỉ tiết lý thuyết
  - `order` (`INTEGER`, default 0) — thứ tự trong chuyên đề (hoặc trong lớp, với tiết riêng lớp)
  - `archived_at` (`TIMESTAMPTZ`, nullable) — tiết đã lưu trữ (hiện chỉ tiết riêng lớp cũ). Tiết lưu trữ không đồng bộ theo chuyên đề, không giao/khôi phục vào lớp được.
  - `created_by`, `updated_by` (nullable FK → `users.id`)
  - `created_at`, `updated_at` (`TIMESTAMPTZ`)
- Indexes: `(course_id)`, `(module_id)`, `(class_id)`
- Quan hệ: `courses` (optional), `modules` (optional), `classes` (optional), `lesson_quizzes` (1-N), `question_links` (1-N), `class_content_items` (1-N)
- Migration: `20260921000000_rename_three_level_content` — tạo `lessons`, backfill, DROP `topics` + `lectures`.

### 4.6c-c `lesson_quizzes` / `lesson_quiz_answers` (Bài tập ôn nhẹ)

- `lesson_quizzes`: câu hỏi ngân hàng gắn vào một tiết lý thuyết. Unique `(lesson_id, question_id)`. FK `lesson_id` cascade; `question_id` restrict.
- `lesson_quiz_answers`: trả lời ôn nhẹ theo `(lesson_id, question_id, student_id)`. Không sinh Attempt, không tính điểm.
- Đổi tên in-place từ `lecture_quizzes` / `lecture_quiz_answers` (`lecture_id` → `lesson_id`) ở `20260921000000_rename_three_level_content`.

### 4.6d `questions` (Ngân hàng câu hỏi)

- Ngân hàng câu hỏi, mỗi câu thuộc một Module (chuyên đề) và một DifficultyLevel của course.
- Cột:
  - `id` (PK, UUID default)
  - `course_id` (FK → `courses.id`, cascade)
  - `module_id` (FK → `modules.id`, cascade)
  - `difficulty_level_id` (FK → `course_difficulty_levels.id`, restrict)
  - `type` (`QuestionType`): `single_choice` | `essay`
  - `content` (`TEXT`): nội dung câu hỏi (HTML từ TipTap)
  - `options` (`JSONB`, nullable): mảng phương án (HTML hoặc LaTeX) — chỉ cho `single_choice`
  - `correct_index` (`INT`, nullable): chỉ số 0-based của đáp án đúng — cần cho `single_choice`
  - `explanation` (`TEXT`, nullable): giải thích sau khi trả lời (HTML)
  - `answer_guide` (`TEXT`, nullable): hướng dẫn cho câu tự luận (HTML)
  - `deleted_at` (`TIMESTAMPTZ`, nullable): soft-delete timestamp
  - `created_at`, `updated_at` (`TIMESTAMPTZ`)
- Indexes: `(course_id)`, `(module_id)`, `(difficulty_level_id)`
- Quan hệ: `courses` (1-N), `modules` (1-N), `course_difficulty_levels` (1-N), `question_links` (1-N)
- Table: `questions` (via `@@map`)

### 4.6e `question_links` (Liên kết câu hỏi — tiết luyện tập)

- Liên kết câu hỏi với một tiết `kind = practice`. CRUD qua `GET/POST/PATCH/DELETE /lessons/:lessonId/questions`.
- Cột:
  - `id` (PK, UUID default)
  - `lesson_id` (FK → `lessons.id`, cascade)
  - `question_id` (FK → `questions.id`, restrict)
  - `order` (`INT`, nullable): thứ tự câu trong tiết
  - `points` (`INT`, nullable): trọng số soạn đề (tuỳ chọn). **Không** dùng khi chấm Attempt — thang chấm = 100/N snapshot lúc start.
- Unique: `(lesson_id, question_id)`
- Indexes: `(lesson_id)`, `(question_id)`
- Table: `question_links` (via `@@map`)

### 4.7 Finance models

- `bonuses`: khoản thưởng/phạt theo staff/tháng/trạng thái thanh toán; `amount` có thể dương (thưởng) hoặc âm (phạt/điều chỉnh giảm).
  - API create bonus không còn nhận `id` từ frontend; backend/DB luôn tự sinh UUID authoritative bằng default của bảng.
- `role_tax_deduction_rates`: lịch sử append-only mức khấu trừ thuế mặc định theo role + `effective_from`
- `role_fixed_salary_defaults`: mức **lương cứng** mặc định theo `StaffRole` ăn lương cứng (unique `role_type`). Không gồm `teacher` — giáo viên chỉ nhận trợ cấp buổi học. Chỉ cột `amount` (nullable) — null / không có row = chưa cấu hình, không hiểu là 0đ. Độc lập với bảng % vận hành. Mặc định theo role áp cho mọi nhân sự đang hoạt động mang role đó, trừ khi có đè theo người trên đúng trục lương. Lịch sử chỉnh sửa ghi `action_history` (`entity_type = role_fixed_salary_default`). Migration `20260916100000_remove_teacher_fixed_salary_config` xoá dòng `teacher` (no-op nếu không có); không đụng `staff_fixed_salary_payables`.
- `role_fixed_salary_operating_rate_defaults`: **% khấu trừ vận hành lương cứng** mặc định theo `StaffRole` ăn lương cứng (unique `role_type`; `teacher` không còn cấu hình trên tab Lương cứng). `rate_percent` nullable (0–100) — null / không có row = chưa cấu hình, khác 0%. Chỉ áp cho lương cứng của role đó; không đọc/ghi `class_teachers.tax_rate_percent` và không đổi `sessions.allowance_amount`. Xoá cấu hình lương không xoá row % (và ngược lại). Lịch sử: `action_history` (`entity_type = role_fixed_salary_operating_rate_default`).
- `staff_fixed_salary_overrides`: đè **mức lương cứng** theo cặp `(staff_id, role_type)` (unique). Có row = đang đè, `amount` bắt buộc (0 = cố ý loại khỏi lương cứng của role). Không có row = theo `role_fixed_salary_defaults`. Chỉ được ghi khi nhân sự đang mang role đó **và** role thuộc danh sách lương cứng. FK cascade `staff_info`. Không đụng bảng đè %. Audit: `action_history` (`entity_type = staff_fixed_salary_override`). Cùng migration trên xoá dòng `teacher`.
- `staff_fixed_salary_operating_rate_overrides`: đè **% vận hành lương cứng** theo cặp `(staff_id, role_type)` (unique). Có row = đang đè, `rate_percent` bắt buộc (0% hợp lệ). Không có row = theo mặc định role. Độc lập với đè lương. Audit: `action_history` (`entity_type = staff_fixed_salary_operating_rate_override`).
- `staff_fixed_salary_payables`: **khoản lương cứng phải trả** đã đóng băng khi chốt tháng. Unique `(staff_id, role_type, month)` ở tầng DB — chạy lại không tạo thêm và không sửa khoản cũ. Snapshot `gross_amount`, `operating_rate_percent`, `tax_rate_percent`, `operating_deduction_amount`, `tax_deduction_amount`, `net_amount`; `note` nullable (ghi chú khi kế toán sửa khoản pending); `status` mặc định `pending`. Khoản pending được sửa số gộp/`note` (net tính lại từ % đóng băng); không có API xóa. Khoản paid không sửa được. Chỉ sinh cho nhân sự `active` đang mang role **ăn lương cứng** (`FIXED_SALARY_STAFF_ROLES`, không gồm `teacher`), với mức đã resolve > 0 (0 hoặc chưa cấu hình thì bỏ). Khoản `teacher` đã chốt trước đây **giữ nguyên**. Không chia ngày công. Khấu trừ dùng `calculateDeductionAmounts` (trừ vận hành trên gộp, thuế trên phần còn lại). Không tái dùng `extra_allowances`.
- `staff_tax_deduction_overrides`: lịch sử append-only override khấu trừ thuế theo staff + role + `effective_from`
- `class_teachers.tax_rate_percent`: source of truth duy nhất cho `% khấu trừ vận hành` theo cặp `class-teacher` (Prisma `operatingDeductionRatePercent`); dữ liệu lịch sử cũ đã được backfill vào cột này trước khi bỏ bảng lịch sử vận hành.
- `wallet_transactions_history`: lịch sử ví học viên + thông tin chia lợi nhuận CSKH
- `student_wallet_sepay_orders`: yêu cầu nạp ví SePay đã tạo cho học sinh; lưu `order_code`, trạng thái `pending/completed/expired/failed`, `amount_requested`, `amount_received`, `transfer_note` (QR tĩnh mới chỉ chứa prefix cấu hình + mã ngắn `UNIST-*`; đơn/QR legacy có thể còn `UNICL-*` và `LOP ...`), snapshot `parent_email`, dữ liệu QR/VA từ SePay hoặc QR chuyển khoản thường, metadata người tạo đơn (`created_by_user_id`, `created_by_user_email`, `created_by_role_type`, `created_by_staff_roles`), `sepay_transaction_id`, `sepay_reference_code`, `wallet_transaction_id`, `completed_at`, `receipt_email_sent_at`, và `webhook_payload`.
- `student_wallet_direct_topup_requests`: yêu cầu nạp thẳng do admin/staff tạo trước khi cộng ví; lưu `student_id`, `amount`, `reason`, trạng thái `pending/approved/expired`, `token_hash` duy nhất, `expires_at` (token hiện hết hạn sau 14 ngày), `approved_at`, `wallet_transaction_id`, metadata người yêu cầu (`requested_by_user_id`, email, role type, staff roles). Chỉ khi duyệt thành công mới liên kết sang `wallet_transactions_history`.
- `customer_care_service`: map staff chăm sóc theo học viên + % profit (mặc định chép từ `staff_info.customer_care_default_profit_percent` khi gán CSKH mới)
- `staff_monthly_stats`: số liệu tổng hợp lương/việc theo tháng
- `extra_allowances`: khoản trợ cấp bổ sung theo staff/tháng/role, có `amount`, `status`, `note`, `month`, `role_type`, và snapshot `tax_deduction_rate_percent`
- Index read path mới cho finance:
  - `bonuses`: composite `(staff_id, month, status)` cho payroll preview/listing theo nhân sự-tháng-trạng thái; composite `(status, date, staff_id)` cho batch thanh toán/lọc theo trạng thái-ngày
  - `wallet_transactions_history`: composite `(student_id, created_at)` cho feed lịch sử ví theo học sinh; composite `(type, created_at)` cho phân loại lịch sử theo loại giao dịch
  - `student_wallet_sepay_orders`: unique `order_code`, unique `sepay_transaction_id`, unique `sepay_reference_code`, unique `wallet_transaction_id`; index `(student_id)`, `(status, created_at)`, và `(created_by_user_id)` cho reconcile/webhook và audit người tạo QR.
  - `student_wallet_direct_topup_requests`: unique `token_hash`, unique `wallet_transaction_id`; index `(student_id)`, `(status, expires_at)`, và `(requested_by_user_id)` cho preview/approval token, cleanup hết hạn và audit người yêu cầu.
  - `extra_allowances`: composite `(staff_id, month, status)` cho payroll preview/listing theo nhân sự-tháng-trạng thái; composite `(status, staff_id, month, role_type, tax_deduction_rate_percent)` cho aggregate allowance theo trạng thái/rate bucket
  - `staff_fixed_salary_overrides`: unique `(staff_id, role_type)`; index `staff_id`, `role_type`
  - `staff_fixed_salary_operating_rate_overrides`: unique `(staff_id, role_type)` (`staff_fs_op_rate_ov_staff_role_key`); index `staff_id`, `role_type`
  - `staff_fixed_salary_payables`: unique `(staff_id, role_type, month)`; index `staff_id`, `month`, composite `(status, month)`
  - `dashboard_cache`: index `expires_at` cho dọn cache hết hạn
  - `cost_extend`: index `date`, `month`, và composite `(status, date)` cho lọc chi phí theo kỳ/trạng thái
- Payroll semantics:
  - thuế áp dụng cho mọi staff; **thưởng (bonus)** trong `income-summary` / popup thanh toán áp **khấu trừ thuế** theo mức hiện hành của role ưu tiên trên hồ sơ (không có khấu trừ vận hành trên thưởng)
  - tax base được aggregate theo **từng nguồn thu nhập trong kỳ** và tách bucket theo snapshot rate đang effective
  - khấu trừ vận hành chỉ áp dụng cho gia sư theo `class_teachers.tax_rate_percent`, **và** cho lương cứng theo snapshot trên `staff_fixed_salary_payables`
  - **% khấu trừ vận hành lương cứng** (`role_fixed_salary_operating_rate_defaults.rate_percent` / đè theo người) được snapshot vào `staff_fixed_salary_payables` khi chốt tháng, và **không** tham gia công thức trợ cấp buổi học
  - `snapshotUnpaidTotal` / `snapshotUnpaidNetTotal` trong staff income summary là toàn bộ khoản pending/unpaid hiện tại từ mọi nguồn **gồm lương cứng**, không giới hạn tháng hoặc cửa sổ `days`, và loại trừ session cọc; net của giáo viên trừ vận hành hiện hành theo lớp rồi tính thuế trên phần sau vận hành; lương cứng dùng net đã đóng băng trên khoản; role khác chỉ trừ thuế
- `dashboard_cache`: cache JSON theo key/type + `expires_at`; hiện được backend dùng làm server-side response cache cho các read endpoint nặng của admin dashboard
- `cost_extend`: khoản chi mở rộng theo tháng/danh mục
  - `date`: dùng kiểu `DATE` (Prisma `DateTime? @db.Date`) để đồng bộ với các luồng hiển thị/lọc theo ngày

### 4.8 Content & audit

- `class_surveys`: báo cáo khảo sát của một lớp cho một Bài khảo sát (`survey_id`, nullable — chỉ null cho data lịch sử trước khi có Bài khảo sát). `knowledge_assessment` (text tự do) là đánh giá kiến thức **dùng chung cho cả báo cáo** (không phải theo từng học sinh). Field legacy `test_number`/`content` (lần khảo sát N toàn cục + nội dung rich text tự do) giữ nullable cho dữ liệu cũ, không còn set qua API mới; migration `20260816123000_survey_knowledge_assessment_per_report` đã backfill toàn bộ `content` cũ vào `knowledge_assessment` để không mất dữ liệu khi đổi model. Index `class_id`, `teacher_id`, `(class_id, test_number)`, `(teacher_id, report_date)`, `survey_id`, `(class_id, survey_id)`. Unique effective theo `(class_id, survey_id)` được enforce ở service layer (một báo cáo/lớp/bài khảo sát)
- `class_survey_student_assessments`: nhận xét (`comment`, text tự do) của gia sư cho từng học sinh trong một `class_surveys` row (đánh giá kiến thức không lưu ở bảng này, xem `class_surveys.knowledge_assessment`); unique `(class_survey_id, student_id)`
- `survey_round` (Prisma model `Survey`, "Bài khảo sát"): thay thế cơ chế "lần khảo sát N toàn cục" cũ bằng entity multi-row có `name`, `start_date`/`end_date`, `created_by_user_id`/`updated_by_user_id`, và thông báo kèm **dạng có cấu trúc** (5 field text riêng, không còn 1 rich text field): `notification_title` (mirror giá trị `name` khi tạo/sửa — FE không có input riêng vì trùng tên bài khảo sát), `notification_content` (Nội dung), `notification_instructions` (Hướng dẫn), `notification_notes` (Lưu ý), `notification_teacher_note` (Gia sư) — tất cả nullable, plain text nhiều dòng. Admin + đội giáo án (`lesson_plan`, `lesson_plan_head`) CRUD qua `/surveys` (FE: `/admin/surveys` cho admin, `/staff/surveys` cho đội giáo án — cùng dùng component `SurveysManager`). Lớp `running` được kỳ vọng có `class_surveys.survey_id = <bài đang mở>` trừ khi bị loại trừ qua `survey_excluded_classes`. Row lịch sử `id = 'current'` (field `current_round`) giữ nguyên qua migration, chỉ còn ý nghĩa legacy/không dùng cho luồng mới; `name IS NULL` dùng để phân biệt row legacy khỏi các Bài khảo sát thật khi list
- `survey_excluded_classes`: lớp bị loại trừ khỏi yêu cầu báo cáo cho một Bài khảo sát cụ thể; unique `(survey_id, class_id)`
- `survey_warning_dismissals`: kế toán chi bấm "Đóng và không hiển thị lại" cho cảnh báo một nhân sự (gia sư) chưa báo cáo Bài khảo sát đã quá hạn; unique `(user_id, staff_id, survey_id)`; `permanent` mặc định `false` nhưng flow hiện tại chỉ insert khi permanent (dismiss tạm thời "Đóng" là state phía FE, không persist)
- `action_history`: audit log thay đổi dữ liệu (`before_value`, `after_value`, `changed_fields` là JSON)
- `documents`: metadata tài liệu (`file_url`, `tags` JSON)
- `notifications`: bản ghi thông báo admin push cho feed admin/staff; lưu draft/published, audience target động, version, số lần push và thời điểm push gần nhất (học sinh không nhận thông báo)
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

- Lưu thông báo push từ admin cho admin/staff, dùng chung cho REST feed và NestJS gateway `/notifications`
- PK: `id` (UUID)
- Trường chính:
  - `title` (`VARCHAR(160)`)
  - `message` (`TEXT`)
  - `status` (`NotificationStatus`: `draft | published`)
  - `target_all` (`BOOLEAN`, default `true`) để broadcast cho toàn bộ audience đủ điều kiện
  - `target_role_types` (`UserRole[]`) cho tag role_type như `@admin`, `@staff`
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
  - field chính cho work tab / popup chi tiết output: `lesson_task_id`, `lesson_name`, `contest_uploaded`, `date`, `status`, `payment_status`, `staff_id`, `cost`, `difficulty_band`, `includes_test`, `includes_solution`, `includes_lecture_video`, `link`, `original_link`, `source`, `level`, `tags`
  - `staff_id` là nhân sự nhận thanh toán / đứng tên output
  - `difficulty_band` (nullable enum `LessonOutputDifficultyBand`): bậc độ khó giáo án, nguồn sự thật để backend tự tính `cost`. Dòng legacy `NULL` giữ nguyên `cost` đã lưu.
  - `includes_test` / `includes_solution` / `includes_lecture_video`: cờ hạng mục đã làm, mặc định `false`; cộng vào `cost` theo bảng giá hằng số khi có bậc.
  - `level` vẫn dùng để lọc tab Bài tập (`GET /lesson-work?level=`), không liên quan tới tiền.
  - `cost` không nhận giá trị client; tạo/sửa có bậc thì backend ghi tổng theo bảng giá (tick trống → `0`).
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
- `ClassType`: **đã xoá** (migration `20260818090000_add_class_category`) — thay bằng bảng `courses` tuỳ chỉnh được, xem mục 4.4.0-cat.
- `StudentClassStatus`: `active | inactive`
- `AttendanceStatus`: `present | excused | absent`
- `LessonKind`: `theory | practice` — phân loại tiết học: `theory` (lý thuyết, video + nội dung) hoặc `practice` (thực hành, thuần câu hỏi). Đổi tên enum từ `TopicKind` ở `20260921000000_rename_three_level_content`.
- `ClassContentItemKind`: `lesson` — phân loại nội dung lớp học (đổi value từ `topic` cùng migration)
- `ClassContentHiddenReason`: `manual`, `module_removed` — lý do ẩn mềm `class_content_items` (`20261005120000_class_module_order_and_hidden_reason`)
- `ClassTimelineItemKind`: `session` | `class_survey` | `content_item` — loại mục trên timeline lớp (`class_timeline_items`)
- `QuestionType`: `single_choice | essay` — phân loại câu hỏi trong ngân hàng câu hỏi
- `AttemptStatus`: `in_progress | submitted | timed_out` — trạng thái lượt làm bài

### Finance

- `WalletTransactionType`: `topup | loan | repayment | extend`
- `PaymentStatus`: `paid | pending`

### Lesson

- `LessonTaskStatus`: `pending | in_progress | completed | cancelled`
- `LessonTaskPriority`: `low | medium | high`
- `LessonOutputStatus`: `pending | completed | cancelled`
- `LessonOutputDifficultyBand`: `easy | medium | hard | very_hard | extreme` (nullable trên `lesson_outputs.difficulty_band`)

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

Kết nối runtime qua `DATABASE_URL` trong `apps/api/.env` (`PrismaService` + PgBouncer). `prisma.config.ts` cũng trỏ `DATABASE_URL` (dùng cho `generate` và các lệnh CLI khác). **CD migrate:** `scripts/gha-deploy-instance-remote.sh` tạm swap `DATABASE_URL=$DIRECT_URL` chỉ trong bước `prisma migrate deploy` — app sau deploy vẫn dùng pooler. **Docker (API):** image copy `prisma.config.ts` vào `/app`. Các lệnh local chạy tại **`apps/api`** (`pnpm db:deploy` tự swap `DIRECT_URL` nếu có):

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
