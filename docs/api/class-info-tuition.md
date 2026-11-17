# Lớp: Thông tin lớp / Học phí lớp (#272, #274)

Lớp chia thành hai phần sửa riêng:

- **Thông tin lớp**: tên, khoá, trạng thái, sĩ số tối đa, không điểm danh, hạn truy cập nội dung, lương gia sư mặc định của lớp.
- **Học phí lớp**: tổng gói (`tuition_package_total`), số buổi (`tuition_package_session`), học phí / buổi (`student_tuition_per_session`), học phí / 30 phút (`student_tuition_per_block`, lớp theo block).

Hai route API vẫn tách (quyền khác nhau), nhưng **web** (13/11) sửa cả hai trong **một dialog «Thông tin lớp»** (`EditClassBasicInfoPopup`): người được sửa Học phí lớp (Admin, Trưởng phòng Sale & CSKH) thấy thêm mục **Học phí lớp** cuối dialog; lưu gọi `PATCH /class/:id/basic-info` khi Thông tin lớp đổi rồi `PATCH /class/:id/tuition` khi học phí đổi. Trang chi tiết lớp **không còn** card Học phí lớp. Popup riêng `EditClassTuitionPopup` chỉ còn cho luồng bắt buộc điền trước học sinh đầu tiên (#273). Form học phí dùng chung `components/admin/class/ClassTuitionFields.tsx` (`useClassTuitionForm`).

**Trưởng ban Đào tạo sửa trợ cấp mặc định của lớp trong dialog «Thông tin lớp» (13/11):** dialog hiện thêm **Trợ cấp / HV / buổi**, **Trợ cấp tối đa / buổi**, **Scales** (không có Cách thu học phí). `PATCH /class/:id/basic-info` vẫn chỉ nhận tên / khoá / sĩ số với role trưởng, nên web gửi phần tiền sang `PATCH /staff-ops/classes/:id/teacher-pay` — **chỉ ô đã đổi** (vd `{ "allowance_per_session_per_student": 45000 }`), áp dụng cho buổi tạo sau. Ô chạm lương của chính mình (đang dạy lớp: trợ cấp / HS khi không có trợ cấp riêng, scale khi không có scale riêng, trần luôn) bị khoá kèm ghi chú, khớp `findOwnPayFieldsInTeacherPayUpdate` (`lib/class-teacher-own-pay.ts`). Không có thay đổi backend.

## Quyền theo route

| Route | Admin | Trưởng ban Đào tạo | Trưởng phòng Sale & CSKH | Kế toán thu | Kế toán chi |
|---|---|---|---|---|---|
| `GET /class`, `GET /class/:id`, `GET /class/:id/students`, `GET /class/:id/makeup-events` | đọc | đọc (#274) | đọc | đọc | đọc |
| `POST /class` (tạo lớp, #274) | mọi trường | theo phần (xem dưới) | theo phần (xem dưới) | 403 | 403 |
| `PATCH /class/:id/basic-info` (Thông tin lớp) | sửa | tên, khoá, sĩ số (#274) | tên, khoá, sĩ số (#274) | 403 | 403 |
| `PATCH /class` (cập nhật tổng quát) | sửa | 403 | 403 | 403 | 403 |
| `PATCH /class/:id/tuition` (Học phí lớp) | sửa | 403 | sửa | 403 | 403 |
| `PATCH /class/:id/student-tuition` (học phí riêng học sinh) | sửa | 403 | sửa | sửa | 403 |
| `PATCH /class/:id/students` (thêm/bớt học sinh, #273) | sửa | 403 | sửa | 403 | 403 |
| `PATCH /class/:id/pricing-mode`, lịch | sửa | 403 | 403 | 403 | 403 |
| `PATCH /class/:id/teacher-compensation` (lương gia sư theo lớp, follow-up 13/11) | sửa | 403 ở route admin (dùng `PATCH /staff-ops/classes/:id/teacher-pay`) | 403 | 403 | 403 (chỉ xem; kiêm Trưởng ban Đào tạo / Quản lý lớp của lớp → sửa) |
| `POST /class/:id/end` (kết thúc lớp), `DELETE /class/:id` (xoá lớp) | ✓ | 403 | 403 | 403 | 403 |
| `GET /staff/options` (tìm gia sư khi tạo lớp) | ✓ | ✓ (#274) | 403 | 403 | ✓ |

## Tạo lớp và sửa Thông tin lớp theo role (#274)

Policy: `apps/api/src/class/class-write-field-policy.ts` (`assertCreateClassAllowed`, `assertUpdateClassBasicInfoAllowed`), gọi trong `ClassService.createClass` / `updateClassBasicInfo` — áp cả đường staff-ops `POST /staff-ops/classes`.

| Phần form | Trường | Admin | Trưởng ban Đào tạo | Trưởng phòng |
|---|---|---|---|---|
| Thông tin lớp | `name`, `course_id` (môn/loại lớp), `max_students` | ✓ | ✓ | ✓ |
| Gia sư + Quản lý lớp + lương gia sư | `teacher_ids`, `teachers[]` (trợ cấp riêng, scale riêng, % vận hành), `allowance_per_session_per_student`, `max_allowance_per_session`, `scale_amount`, `training_manager_staff_id` | ✓ | ✓ | 403 |
| Học phí + học sinh | `student_tuition_per_session`, `student_tuition_per_block`, `tuition_package_total`, `tuition_package_session`, `student_ids` | ✓ | 403 | ✓ |
| Chỉ Admin | `schedule`, `pricing_mode`, `no_attendance: true`, `status` khác `running` | ✓ | 403 | 403 |

- Người mang cả hai role trưởng được **hợp** hai tập trường.
- Gửi trường ngoài quyền → `403` liệt kê tên tiếng Việt, vd «Bạn không có quyền tạo lớp với các trường: Học phí, Học sinh.». `undefined`, `null`, mảng rỗng và `no_attendance: false` coi như không gửi.
- Role khác (Đào tạo/Quản lý lớp, Kế toán, CSKH, gia sư) → `403` «Chỉ Admin, Trưởng ban Đào tạo hoặc Trưởng phòng Sale & CSKH được tạo lớp.».
- Luật #265: Trưởng ban không tự gán mình làm gia sư (`teacher_ids` / `teachers[].teacher_id`) → `403`. Tự làm Quản lý lớp được (% trợ cấp quản lý lớp vẫn chỉ Admin sửa).
- `training_manager_staff_id` (mới, chỉ `POST /class`): nhân sự Đào tạo/Trưởng ban/gia sư đang hoạt động (`404` không tồn tại, `400` không hợp lệ); gia sư được gán thì tự cấp role `training` như `PATCH /training-manager/classes/:id`.
- `PATCH /class/:id/basic-info` cho role trưởng: chỉ `name`, `course_id`, `max_students`; gửi `status`, `no_attendance`, trợ cấp/scale, `content_access_expires_at` → `403`. Cách thu học phí, lịch, Meet: route riêng, chỉ Admin.
- Response tạo lớp / basic-info lọc theo người xem như các route đọc.
- Hạn chế: Trưởng ban Đào tạo không tạo được lớp thuộc khoá trọn gói (`one_time`) vì khoá đó bắt buộc học phí, mà học phí ngoài quyền.

`basic-info` bỏ qua các trường học phí; `tuition` bỏ qua mọi trường khác học phí (ValidationPipe `whitelist` + lọc ở service). Lịch sử thay đổi ghi riêng: `Cập nhật thông tin cơ bản lớp học` / `Cập nhật học phí lớp`.

## Lọc response (`resolveAdminClassFinanceView`)

Áp cho mọi route trên (cả response của route sửa):

| Người xem | Góc nhìn | Bị ẩn |
|---|---|---|
| Admin | `full` | — |
| Trưởng phòng Sale & CSKH | `income` | lương gia sư: `allowancePerSessionPerStudent`, `allowancePerBlockPerStudent`, `maxAllowancePerSession`, `maxAllowancePerBlock`, `scaleAmount`, `trainingManagerRatePercent`, `teachers[].customAllowance*`, `customScaleAmount`, `operatingDeductionRatePercent`, `taxRatePercent` |
| Kế toán thu | `income` | như trên |
| Kế toán chi | `expense` | học phí lớp + học phí riêng học sinh |
| Trưởng phòng kiêm Kế toán chi | `full` | — (hợp quyền) |
| Trưởng ban Đào tạo (#274) | `expense` | học phí lớp + học phí riêng học sinh + số dư ví học sinh (follow-up 13/11 bỏ quyền xem ví #277) |
| Trưởng ban Đào tạo kiêm Trưởng phòng / Kế toán thu | `full` | — (hợp quyền) |

**Liên hệ / hồ sơ học sinh (quyết định 13/11).** Ngoài bảng trên, Trưởng ban Đào tạo thuần (không kiêm Admin / Trưởng phòng / Kế toán thu/chi — `canSeeClassStudentContactsOnAdminRoutes`) nhận `students[]` chỉ gồm `id`, `fullName`, `status`, `customerCareStaff`, `totalAttendedSession` (whitelist `redactClassStudentContacts`: không email, SĐT, phụ huynh, trường, tỉnh, năm sinh, giới tính, mục tiêu, nguồn khách, lý do nghỉ, `userId`). Áp `GET /class/:id` và response các route ghi `/class`; `GET /class/:id/students` thì `student` lồng chỉ còn `id`, `fullName`, `status`. Route staff-ops áp cùng whitelist cho Trưởng ban Đào tạo, Quản lý lớp, gia sư.

Route staff-ops (gia sư / quản lý lớp) vẫn dùng `resolveAccountantFinanceView`. Riêng `GET /staff-ops/classes/:id` (#276): **Quản lý lớp** của lớp — thuần hoặc kiêm gia sư lớp — không nhận học phí lớp (`studentTuitionPerSession`, `studentTuitionPerBlock`, `tuitionPackageTotal`, `tuitionPackageSession`, `sessionTuitionTotal`) và học phí riêng / số dư của học sinh (`redactClassForTrainingManagerView`). Gia sư thuần, CSKH, Admin, Kế toán giữ nguyên.

#277 — **Trưởng ban Đào tạo** xem **mọi lớp** qua staff-ops: `GET /staff-ops/classes` không lọc (`scope=managed` → lớp mình quản lý), `GET /staff-ops/classes/:id` trả access mode `training_head` ở lớp không dạy / không quản lý (redact như Quản lý lớp: không học phí, không số dư; thấy lương mọi gia sư). `GET /staff-ops/classes/:id/sessions` ở mode này ẩn thêm trợ cấp quản lý lớp từng buổi (`trainingManagerAllowanceAmount`, `trainingManagerPaymentStatus`, `trainingManagerRatePercent`, `trainingManagerTaxDeductionRatePercent`). Kiêm gia sư lớp: buổi của gia sư khác hiện theo góc nhìn trên. Thao tác buổi / lịch / chấm bài vẫn qua `resolveClassWorkAccess` (chỉ lớp mình dạy / quản lý → ngoài ra `403`).

## % trợ cấp quản lý lớp và lương gia sư theo lớp (#276)

| Route | Admin | Quản lý lớp (lớp mình) | Trưởng ban Đào tạo | Trưởng phòng | Kế toán thu/chi |
|---|---|---|---|---|---|
| `PATCH /class/:id/training-manager` — đổi `%` | sửa | 403 | 403 | 403 | 403 |
| `PATCH /class/:id/training-manager` — giao / gỡ Quản lý lớp | sửa | 403 | sửa, **mọi lớp** (#277) | 403 | 403 |
| `PATCH /training-manager/staff/:staffId/sessions/:sessionId/rate` | sửa | 403 | 403 | 403 | 403 |
| `PATCH /staff-ops/classes/:id/teacher-pay`, thêm / cho nghỉ gia sư | sửa | sửa, trừ phần của mình | sửa, **mọi lớp**, trừ phần của mình (#277) | 403 | 403 |

- Gửi lại `%` hiện tại (không đổi) không bị chặn — kiểm theo giá trị thật sự đổi.
- «Phần của mình» với Quản lý lớp kiêm gia sư đang dạy lớp: dòng `teachers[]` của mình; `allowance_per_session_per_student` khi không có trợ cấp riêng; `scale_amount` khi không có scale riêng; `max_allowance_per_session` luôn → `403`.
- #277: `canManageClassTeachersAndPay` (`staff-ops/staff-operations-access.service.ts`) = Admin ∪ Quản lý lớp của lớp ∪ Trưởng ban Đào tạo; `canAssignClassManager` (`training-manager/class-manager-allowance-policy.ts`) = Admin ∪ Trưởng ban Đào tạo. `canEditClassManagerAllowanceRate` giữ chỉ Admin. Trưởng ban được tự nhận làm Quản lý lớp (như khi tạo lớp ở #274) vì % do Admin đặt; tự thêm mình làm gia sư / tự cho mình nghỉ / sửa lương của mình → `403`.
- Thông báo `403`: «Chỉ Admin hoặc Trưởng ban Đào tạo được giao / gỡ Quản lý lớp.», «Chỉ Admin, Trưởng ban Đào tạo hoặc Quản lý lớp (Đào Tạo) mới được chỉnh gia sư và lương gia sư của lớp này.», «Không được tự chỉnh lương của chính mình: …».

## Thêm/bớt học sinh (#273)

Chỉ **Admin** và **Trưởng phòng Sale & CSKH** thêm hoặc bớt học sinh trong lớp (kể cả khi tạo lớp, #274). Quản lý lớp, Trưởng ban Đào tạo, Kế toán thu/chi, CSKH, gia sư: `403` (route admin đóng mặc định, không có route staff-ops nào ghi roster).

| Đường ghi roster | Admin | Trưởng phòng | Role khác |
|---|---|---|---|
| `PATCH /class/:id/students` | ✓ | ✓ | 403 |
| `PATCH /student/:id/classes` | ✓ | ✓ | 403 |
| `POST /class` (`student_ids`, tạo lớp) | ✓ | ✓ (#274) | 403 |
| `PATCH /class` (`student_ids`) | ✓ | 403 | 403 |
| `POST /users/student` (`class_ids`) | ✓ | ✓ | CSKH vào được route nhưng không được xếp lớp (403) |

Kết thúc lớp (`POST /class/:id/end`) và chuyển học sinh sang nghỉ là vòng đời, không phải thao tác roster, không đổi.

### Học phí lớp trước học sinh đầu tiên

Lớp **chưa có học sinh đang học** (`student_classes.status` = `active` hoặc `null`) nhận học sinh đầu tiên khi đã có **Học phí lớp** theo cách thu đang chọn; ngược lại `400`:

> Lớp chưa có học phí. Hãy điền Học phí lớp trước khi thêm học sinh đầu tiên.

(Thêm nhiều lớp cùng lúc qua `PATCH /student/:id/classes` / `POST /users/student`: `Lớp «A», «B» chưa có học phí. …`)

| Cách thu (`pricing_mode`) | Tính là đã có học phí |
|---|---|
| Theo buổi (`per_session`, mặc định) | `student_tuition_per_session` có số, hoặc gói suy ra được học phí / buổi (`tuition_package_total` + `tuition_package_session > 0`, hoặc gói `0đ`) |
| Theo gói buổi | như theo buổi (gói lớp là nguồn của học phí / buổi) |
| Theo 30 phút (`per_block`) | `student_tuition_per_block` có số, hoặc chuỗi theo buổi ở trên (charge fallback) |
| Trọn gói (`one_time`) | `tuition_package_total` có số |

- `0đ` = đã điền (lớp miễn phí); `null`/trống = chưa điền.
- Học phí riêng của học sinh (`custom_*`) **không** thay Học phí lớp — vẫn `400`.
- Lớp đã có học sinh đang học: không áp. Bớt học sinh: không áp.
- Kiểm ở service (`apps/api/src/common/class-first-student-tuition.ts`), áp cho `updateClassStudents`, `updateClass`, `createClass`, `StudentService.updateStudentClasses` (thêm mới + kích hoạt lại), `UserService.createStudentUser`. Với `POST /class` / `PATCH /class`, kiểm **sau** khi ghi dòng lớp trong cùng transaction nên học phí gửi cùng payload được tính.
- Web `/admin/classes/:id`: bấm **Chỉnh sửa** danh sách học sinh khi lớp trống chưa có học phí → toast + mở popup **Học phí lớp** (nút «Lưu và thêm học sinh», lưu khi chưa điền gì → toast lỗi); lưu xong mới mở popup thêm học sinh. Các màn khác (sửa lớp của học sinh, thêm lớp, tạo học sinh) hiện lỗi `400` qua toast Sonner.

## Follow-up grill 13/11 (Nhóm 1)

**Tổng gói lớp bán một lần.** `assertOneTimePackageTotal({ isOneTime, tuitionPackageTotal, hasActiveStudents })`:

| Tình huống | Gói trống | Gói `0đ` / âm | Gói > 0 |
|---|---|---|---|
| Tạo lớp (`POST /class`, `/staff-ops/classes`) không kèm học sinh | được | `400` | được |
| Sửa lớp / Học phí lớp / đổi khoá, lớp chưa có học sinh học | được | `400` | được |
| Sửa lớp / Học phí lớp / đổi khoá, lớp đang có học sinh học | `400` | `400` | được |
| Nhận học sinh đầu tiên (`class-first-student-tuition`) | `400` | `400` | được |
| Bật `is_one_time` cho khoá (`PATCH /courses/:id`) | lớp trống được; lớp có học sinh → `400` | `400` | được |

## Chốt gói lớp bán một lần (16/11)

Bất biến: ở lớp `one_time`, mọi học sinh đang học có `student_classes.custom_tuition_package_total` khác `null`. Gói lớp lúc học sinh vào lớp trở thành gói riêng; sửa **Học phí lớp** về sau (`PATCH /class/:id/tuition`, `PATCH /class/:id`) **không** đổi gói đã chốt — gói mới chỉ áp cho học sinh vào sau.

Helper `apps/api/src/common/one-time-package-lock.ts`:

- `resolveOneTimePackageLock` — đã có gói riêng (kể cả `0đ` miễn phí, hoặc nhập tay cùng request) → giữ; đã bị thu trên lớp → chốt **đúng số đã thu** (dòng `attendance` present/excused `tuition_fee > 0` đầu tiên theo `sessions.date`, `created_at`), số buổi theo gói lớp; chưa thu → gói lớp hiện tại (gói trống / ≤ 0 → bỏ qua). Ghi kèm `custom_student_tuition_per_session` suy ra bằng `resolveDerivedTuitionPerSession` (gói ÷ số buổi, làm tròn; gói `0đ` → `0`; số buổi trống/≤ 0 → `null`), như mọi đường ghi gói riêng khác.
- `lockOneTimeStudentPackages(tx, [{ classId, studentId }])` — chỉ chạm lớp `one_time`, học sinh đang học, gói riêng `null`. Gọi trong cùng transaction sau khi ghi roster ở: `createClass`, `updateClass` (sau khi ghi lớp → dùng gói mới), `updateClassStudents`, `updateClassStudentTuition` (xoá gói riêng → chốt lại theo gói lớp), `StudentService.updateStudentClasses` (thêm + vào lại), `UserService.createStudentUser`.
- `lockOneTimePackagesForActiveStudents(tx, classIds)` — khi khoá bật bán một lần (`docs/api/courses.md`).

Vào lại lớp: các đường vào lại reset `custom_*` về `null` rồi chốt lại → học sinh đã từng bị thu giữ đúng số đã thu (và không bị thu thêm, vì `findOneTimeChargedStudentIds`); chưa thu → giá lớp lúc vào lại.

**Fix kèm:** `PATCH /class/:id` với `student_ids` trước đây reset học phí riêng của cả học sinh **đang học**; giờ chỉ học sinh vào lại (đang `inactive`) bị reset, giống `StudentService`.

Backfill: migration dữ liệu `20261116090000_lock_one_time_student_packages` (gói + số buổi) và `20261116100000_derive_one_time_locked_per_session` (suy ra học phí riêng / buổi cho hàng đã chốt còn thiếu) — xem `docs/Database Schema.md`.

**Lương gia sư theo lớp.** Mọi đường ghi định mức lương gia sư theo lớp (trợ cấp/HS, scale, % vận hành, trần, mức riêng gia sư) chỉ cho Admin, Trưởng ban Đào tạo, Quản lý lớp của lớp: `PATCH /class/:id/teacher-compensation` (`resolveClassTeacherManagerScope`), `PATCH /staff/:id/class-teachers/:classId/operating-deduction` (`assertCanSetClassTeacherPay`), `/staff-ops/classes/:id/teacher-pay`. Kế toán chi giữ trên allowlist route để người kiêm role vào được, nhưng thuần Kế toán chi → `403` «Chỉ Admin, Trưởng ban Đào tạo hoặc Quản lý lớp của lớp này mới được sửa lương gia sư theo lớp. Kế toán chi chỉ xem.». Không tự sửa lương của chính mình (`assertActorNotEditingOwnCompensation`) giữ nguyên.

**Số dư ví học sinh.** Trên route `/class`, `accountBalance` của học sinh (cấp dòng và `student.accountBalance`) chỉ trả cho Admin, Trưởng phòng Sale & CSKH, Kế toán thu, Kế toán chi (hợp quyền). Trưởng ban Đào tạo / Ban Đào tạo không nhận — áp `GET /class/:id`, `GET /class/:id/students` và response của các route ghi lớp. Route staff-ops giữ luật cũ (teacher / training_manager / training_head bỏ ví).

**Giải trình vắng (staff-ops).** Tạo/sửa giải trình dùng `resolveClassWorkAccess` như xếp lịch bù; Quản lý lớp và Admin giải trình cho mọi gia sư của lớp, gia sư chỉ cho buổi của mình; còn lại `403`.
