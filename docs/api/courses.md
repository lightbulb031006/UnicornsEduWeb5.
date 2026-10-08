# API khoá học — phân quyền & phạm vi

Nguồn triển khai: `apps/api/src/class/course.controller.ts`, `course.service.ts`, `course-access.service.ts`.

> **Vé 06–08 (API):** HTTP path, DTO, Swagger và Nest module nói **Chuyên đề** (`modules`) và **Tiết học** (`lessons`). Không còn `/chapters`, `/topics`, `/lectures` hay alias tương thích ngược. Schema vật lý: vé 05; nghiệm thu typecheck/test: vé 08.

Nguồn sự thật cho guard controller. Tầng service (`CourseAccessService`) vẫn kiểm từng khoá sau khi request qua được decorator.

`UserRole.admin` (và staff có `staffInfo.roles` chứa `admin`) luôn được coi là admin đầy đủ trên các route dùng `@Roles(UserRole.admin)` + `@AllowStaffRolesOnAdminRoutes(...)`.

## CRUD khoá (`CourseController`)

| Endpoint | admin | `assistant` | `lesson_plan_head` | `lesson_plan` | `teacher` |
| --- | --- | --- | --- | --- | --- |
| `GET /courses` | ✅ (class-level `admin` + `staff`) | ✅ | ✅ chỉ khoá được gán | ✅ chỉ khoá được gán | ✅ |
| `GET /courses/:id` | ✅ | ✅ | ✅ khoá được gán | ✅ khoá được gán (`assertCanManageCourse`) | ❌ |
| `POST /courses` | ✅ | ✅ | ✅ (tự gán người tạo vào đội giáo án) | ❌ | ❌ |
| `PATCH /courses/:id` | ✅ | ✅ | ✅ khoá được gán | ❌ | ❌ |
| `DELETE /courses/:id` | ✅ | ✅ | ✅ khoá được gán | ❌ | ❌ |
| `GET/POST/PATCH/DELETE` difficulty-levels | ✅ | ✅ | ✅ khoá được gán | ✅ khoá được gán | ❌ |
| `GET /courses/:id/lesson-plan-members` | ✅ | ✅ | ✅ khoá được gán | ✅ khoá được gán | ❌ |
| `PUT /courses/:id/lesson-plan-members` | ✅ | ✅ | ✅ khoá được gán | ❌ | ❌ |
| `GET /courses/lesson-plan-staff` | ✅ | ✅ | ✅ | ❌ | ❌ |

`POST` / `PATCH` / `DELETE` khoá: controller resolve actor rồi truyền xuống `CourseService.create/update/remove(actor, …)`. `update` / `remove` gọi `assertCanManageCourse` sau check 404 — trưởng giáo án sửa/xoá khoá không được gán → `403`. `create` do người không phải manager (trưởng giáo án) gọi thì tự thêm người tạo vào `course_lesson_plan_members`, để khoá vừa tạo không biến mất khỏi danh sách của họ. Trưởng giáo án **không** còn trong `COURSE_MANAGER_STAFF_ROLES` (ticket 20); hoa hồng trưởng giáo án không phụ thuộc gán khoá. `PUT .../lesson-plan-members` không chặn trưởng giáo án tự gỡ mình khỏi đội — gỡ xong mất quyền khoá ngay, cần admin/trợ lí hoặc trưởng giáo án khác của khoá gán lại. Lịch sử quyết định: `docs/adr/2026-09-10-course-workspace.md`.

**Bán một lần (`is_one_time`):** `POST`/`PATCH /courses` nhận `is_one_time?: boolean`. Đổi giá trị (hoặc tạo với `true`) chỉ admin/trợ lí; trưởng giáo án → `403`. Bật trả `400` nếu lớp nào của khoá đã có điểm danh present/excused mang học phí > 0, hoặc còn lớp có Tổng gói null/≤ 0. Tắt luôn được. Mọi lớp của khoá đổi `pricing_mode` theo (`one_time` / `per_session`) trong cùng transaction, không tính lại buổi nào. Response khoá có `isOneTime`. Chi tiết: `docs/Database Schema.md` mục 4.4.0-cat và ADR `docs/adr/2026-10-04-one-time-course-setting.md`.

`DELETE /courses/:id` trả `400` khi còn lớp dùng khoá, message:

`Không thể xoá: còn N lớp đang dùng khoá học này. Hãy chuyển lớp sang khoá khác hoặc chỉ ẩn (is_active=false) khoá học này.`

## `GET /courses`

Danh sách khoá học cho dropdown tạo/sửa lớp và trang quản trị khoá. Cookie auth (`access_token`); `@Roles(admin, staff)` — chưa đăng nhập trả 401 như trước.

Query:

- `includeInactive` (optional): `true` thì gồm khoá `is_active=false`.

Mỗi dòng kèm `_count.classes`, `_count.lessonPlanMembers`, `_count.difficultyLevels` (chỉ mức khó đang active).

### Lọc theo người gọi (server-side)

Phạm vi **không** nhận cờ từ client. Controller resolve actor rồi gọi `CourseAccessService.resolveListableCourseIds`.

| Actor | Kết quả list |
| --- | --- |
| Đội giáo án thuần (`lesson_plan` và/hoặc `lesson_plan_head`, không kèm `admin` / `assistant`) | Chỉ khoá được gán trong `course_lesson_plan_members` |
| `admin`, `assistant`, `training`, `accountant_income`, `accountant_expense`, `teacher`, `customer_care` | Tất cả khoá (không đổi so với trước) |
| User đã auth nhưng không có staff profile, và không phải `lesson_plan` thuần | Tất cả khoá; không crash |

`resolveListableCourseIds` trả `null` = mọi khoá, trả mảng = chỉ các id đó. **Không** dùng `resolveViewableCourseIds` cho endpoint này: hàm kia là phạm vi *quản lý nội dung* và sẽ trả mảng rỗng cho training/giáo viên/kế toán (dropdown khoá trống khi tạo lớp).

## Cây nội dung khoá (Chuyên đề / Tiết học)

Controller: `apps/api/src/course-content/` — `course-module.controller.ts`, `course-lesson.controller.ts`, `lesson-quiz.controller.ts`. Module Nest: `CourseContentModule` (không đụng `apps/api/src/lesson/` — đó là giáo án nhân sự).

| Endpoint nhóm | admin | `assistant` | `lesson_plan_head` | `lesson_plan` | `teacher` (decorator) |
| --- | --- | --- | --- | --- | --- |
| Chuyên đề: `GET/POST/PATCH/DELETE /course/:courseId/modules` + `POST .../reorder` | ✅ | ✅ | ✅ khoá được gán | ✅ khoá được gán (`assertCanManageCourse`) | Có trên decorator; service 403 nếu không thuộc đội giáo án |
| Tiết học: `GET/POST/PATCH/DELETE /course/:courseId/modules/:moduleId/lessons` + `POST .../reorder` | ✅ | ✅ | ✅ khoá được gán | ✅ khoá được gán | Cùng quy tắc `teacher` |
| Quiz ôn nhẹ: `GET/POST/DELETE /lessons/:lessonId/quizzes` | ✅ | ✅ | ✅ khoá được gán | ✅ | Có trên decorator; service vẫn `assertCanManageCourse` |
| Câu hỏi tiết thực hành: `GET/POST/PATCH/DELETE /lessons/:lessonId/questions` | ✅ | ✅ | ✅ khoá được gán | ✅ khoá được gán | Cùng quy tắc `teacher` |

Tạo chuyên đề: body `POST /course/:courseId/modules` là `{ "title": "..." }`. `courseId` lấy từ path; gửi thêm trong body cũng được, controller ghi đè bằng param.

Loại tiết: `LessonKind` = `theory` (video/nội dung) hoặc `practice` (chỉ tập câu hỏi). Tạo/sửa tiết thực hành kèm `videoUrl` hoặc `content` → `400` *«Tiết thực hành không được kèm video hoặc nội dung — chỉ gồm tập câu hỏi.»*

Xoá chuyên đề hoặc tiết học khi còn lần giao **tiết thực hành** (`class_content_items`, **kể cả item đang ẩn**) → `409` *«Không thể xoá chuyên đề/tiết học: còn N lớp đang tham chiếu — {tên lớp} (X lần giao đang hiện, Y lần giao đang ẩn).»* Item tiết lý thuyết không chặn: xoá tiết lý thuyết / chuyên đề xoá luôn item lý thuyết ở mọi lớp (cùng transaction).

Tạo tiết lý thuyết trong chuyên đề → tự thêm vào mọi lớp đã thêm chuyên đề đó (item + dòng timeline). Tạo tiết với `classId` (tiết riêng lớp) → `400` *«Lớp không tạo tiết riêng nữa. Hãy thêm chuyên đề của khoá hoặc giao tiết thực hành có sẵn.»* Sửa/xoá tiết đã lưu trữ (`archivedAt`, tiết riêng lớp cũ) → `400` *«Tiết học đã lưu trữ, không sửa hay xoá được.»* ADR `docs/adr/2026-10-02-class-content-by-module.md`.

## Chuyên đề của lớp (`/class/:classId/modules`)

Controller: `class-course-module.controller.ts` (`ClassCourseModuleService`). Quyền: admin + staff `assistant`/`teacher` (cùng `validateStaffClassAccess` với nội dung lớp).

| Method | Path | Body | Kết quả |
| --- | --- | --- | --- |
| `GET` | `/class/:classId/modules` | — | `ClassModuleResponseDto[]`: mọi chuyên đề của khoá của lớp, theo `sortOrder` khoá — `{ moduleId, title, sortOrder, classSortOrder, theoryLessonCount, practiceLessonCount, added, addedAt }` (đếm tiết chưa lưu trữ; `classSortOrder` = thứ tự nhóm của lớp, `null` khi chưa thêm) |
| `POST` | `/class/:classId/modules` | `{ "moduleId": "..." }` | Thêm chuyên đề: nhóm **lên đầu** thứ tự lớp; tạo item + dòng timeline cho tiết lý thuyết còn thiếu (thứ tự theo `order` tiết); hiện lại item (lý thuyết + lần giao) ẩn với `hiddenReason = module_removed`, item gia sư tự ẩn (`manual`) giữ ẩn. Trả danh sách mới. `400` chuyên đề khác khoá; `409` *«Lớp đã có chuyên đề này.»* |
| `DELETE` | `/class/:classId/modules/:moduleId` | — | Gỡ chuyên đề = coi như chưa từng thêm: ẩn mềm (`module_removed`) item lý thuyết **và lần giao thực hành** của chuyên đề + dòng timeline; lượt xem, attempt giữ nguyên. Trả danh sách mới. `404` *«Lớp chưa thêm chuyên đề này.»* |
| `PUT` | `/class/:classId/modules/order` | `{ "moduleIds": ["..."] }` | Sắp lại thứ tự nhóm chuyên đề của lớp (`class_modules.sort_order`; học sinh thấy cùng thứ tự). `moduleIds` phải đúng **mọi** chuyên đề lớp đang có, mỗi id một lần — trùng/thiếu/thừa → `400`. Không đổi `modules.sort_order`. Trả danh sách mới. |
| `GET` | `/class/:classId/modules/:moduleId/removal-impact` | — | `ClassModuleRemovalImpactDto` `{ moduleId, ungradedEssayCount, inProgressStudentCount }`: số câu tự luận đã nộp chưa chấm + số học sinh đang làm dở lần giao của chuyên đề. Dialog xác nhận gỡ hiện cảnh báo, **không chặn** gỡ. |

ADR `docs/adr/2026-10-05-class-module-order-and-removal.md`.

Liên quan nội dung lớp (`/class/:classId/content`):

- `POST` chỉ nhận `{ lessonId, openAt?, durationMinutes }` của **tiết thực hành** có sẵn trong khoá. Thiếu `lessonId` → `400` (không tạo tiết riêng). Tiết lý thuyết → `400` *«Tiết lý thuyết vào lớp theo chuyên đề…»*. Tiết đã lưu trữ → `404`. Tiết thuộc chuyên đề lớp **chưa thêm** (hoặc khoá khác) → `400` *«Lớp chưa thêm chuyên đề chứa tiết thực hành này. Hãy thêm chuyên đề trước khi giao.»* Gỡ chuyên đề thì lần giao của nó bị ẩn cùng (`module_removed`), thêm lại chuyên đề thì hiện lại.
- `POST .../:itemId/restore` item thuộc chuyên đề (lý thuyết hoặc lần giao) khi lớp chưa thêm chuyên đề đó → `400`; tiết đã lưu trữ → `400`. Ẩn tay (`DELETE /class/:classId/content/:itemId`) ghi `hiddenReason = manual`; khôi phục xoá lý do.
- `GET /class/:classId/content/course-lessons` chỉ trả tiết thực hành chưa lưu trữ thuộc chuyên đề lớp đã thêm (`moduleId`, `alreadyAdded`).
- Tiết đã lưu trữ (`lessons.archived_at`) không hiện ở màn nào: `GET` nội dung lớp + timeline (staff, kể cả item đang ẩn; học sinh) bỏ item/dòng của tiết đó. Học sinh mở tiết/lần giao đó (`/users/me/student-classes/:classId/lessons/:lessonId`, `/view`, attempt) và staff xem tiến độ lý thuyết, hàng đợi chấm tự luận, thống kê lần giao → `404`. `POST /class/:classId/content/reorder` không cần (và không nhận, `400`) id của tiết đã lưu trữ. Dữ liệu giữ nguyên trong DB.
- `GET /class/:classId/content/groups` (admin + staff `assistant`/`teacher`, #153): `ClassContentModuleGroupDto[]` — `{ moduleId, title, added, theoryItems, practiceItems }`. Một nhóm cho mỗi chuyên đề lớp **đang có** (kể cả rỗng; chuyên đề đã gỡ không có nhóm), theo thứ tự nhóm của lớp (`class_modules.sort_order`); trong nhóm lý thuyết theo `order` tiết, thực hành theo `sortOrder` item. Item không thuộc chuyên đề → nhóm cuối `moduleId: null`, `title: "Ngoài chuyên đề"`. Cùng bộ lọc với `GET` nội dung lớp (gồm item đang ẩn, bỏ tiết đã lưu trữ). Item có thêm `moduleId`.
- `GET /class/:classId/content/student/groups` (học sinh, #156): cùng shape và cách gom như `/content/groups`, nhưng chỉ item học sinh thấy (bỏ item `hiddenAt`, tiết đã lưu trữ — cùng lọc `GET /content/student`), cùng thứ tự nhóm của lớp. Tiết thực hành chưa tới `openAt` vẫn trả về với `isOpen=false`. `403` khi không học lớp hoặc lớp hết hạn xem nội dung; `404` khi tài khoản không có hồ sơ học sinh.
- `GET` danh sách nội dung (staff + học sinh) sắp theo `sortOrder` chuyên đề → trong chuyên đề: lý thuyết theo `order`, rồi thực hành theo `sortOrder` item; item không có chuyên đề ở cuối.

`lesson_plan` thuần soạn cây nội dung trên khoá được gán. GET list chuyên đề kèm `lessonCount`; GET list tiết kèm `quizCount` / `questionCount`.

Học sinh: `GET/POST /users/me/student-classes/:classId/lessons/:lessonId` (+ `/view`, `/quizzes`). Không còn path lồng `topics`/`lectures`.

## Không đổi trong ticket 02

- `question.controller.ts`
- `exam-library.controller.ts`
- các endpoint `difficulty-levels` trên `CourseController`
