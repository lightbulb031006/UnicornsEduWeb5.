# API khoá học — phân quyền & phạm vi

Nguồn triển khai: `apps/api/src/class/course.controller.ts`, `course.service.ts`, `course-access.service.ts`.

> **Vé 06–08 (API):** HTTP path, DTO, Swagger và Nest module nói **Chuyên đề** (`modules`) và **Tiết học** (`lessons`). Không còn `/chapters`, `/topics`, `/lectures` hay alias tương thích ngược. Schema vật lý: vé 05; nghiệm thu typecheck/test: vé 08.

Nguồn sự thật cho guard controller. Tầng service (`CourseAccessService`) vẫn kiểm từng khoá sau khi request qua được decorator.

`UserRole.admin` (và staff có `staffInfo.roles` chứa `admin`) luôn được coi là admin đầy đủ trên các route dùng `@Roles(UserRole.admin)` + `@AllowStaffRolesOnAdminRoutes(...)`.

## CRUD khoá (`CourseController`)

| Endpoint | admin | `assistant` | `lesson_plan_head` | `lesson_plan` | `teacher` |
| --- | --- | --- | --- | --- | --- |
| `GET /courses` | ✅ (class-level `admin` + `staff`) | ✅ | ✅ | ✅ | ✅ |
| `GET /courses/:id` | ✅ | ✅ | ✅ mọi khoá | ✅ khoá được gán (`assertCanManageCourse`) | ❌ |
| `POST /courses` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `PATCH /courses/:id` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `DELETE /courses/:id` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `GET/POST/PATCH/DELETE` difficulty-levels | ✅ | ✅ | ✅ | ✅ khoá được gán | ❌ |
| `GET /courses/:id/lesson-plan-members` | ✅ | ✅ | ✅ | ✅ khoá được gán | ❌ |
| `PUT /courses/:id/lesson-plan-members` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `GET /courses/lesson-plan-staff` | ✅ | ✅ | ✅ | ❌ | ❌ |

`POST` / `PATCH` / `DELETE` khoá: `CourseService.create()` / `.remove()` **không nhận actor**. Guard controller là tầng bảo vệ duy nhất cho tạo/xoá. Lý do nới `lesson_plan_head` và rủi ro đã chấp nhận: `docs/adr/2026-09-10-course-workspace.md`.

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
| `lesson_plan` thuần (có `lesson_plan`, không kèm `admin` / `assistant` / `lesson_plan_head`) | Chỉ khoá được gán trong `course_lesson_plan_members` |
| `lesson_plan_head` (kể cả khi kèm `lesson_plan`) | Tất cả khoá |
| `admin`, `assistant`, `training`, `accountant_income`, `accountant_expense`, `teacher`, `customer_care` | Tất cả khoá (không đổi so với trước) |
| User đã auth nhưng không có staff profile, và không phải `lesson_plan` thuần | Tất cả khoá; không crash |

`resolveListableCourseIds` trả `null` = mọi khoá, trả mảng = chỉ các id đó. **Không** dùng `resolveViewableCourseIds` cho endpoint này: hàm kia là phạm vi *quản lý nội dung* và sẽ trả mảng rỗng cho training/giáo viên/kế toán (dropdown khoá trống khi tạo lớp).

## Cây nội dung khoá (Chuyên đề / Tiết học)

Controller: `apps/api/src/course-content/` — `course-module.controller.ts`, `course-lesson.controller.ts`, `lesson-quiz.controller.ts`. Module Nest: `CourseContentModule` (không đụng `apps/api/src/lesson/` — đó là giáo án nhân sự).

| Endpoint nhóm | admin | `assistant` | `lesson_plan_head` | `lesson_plan` | `teacher` (decorator) |
| --- | --- | --- | --- | --- | --- |
| Chuyên đề: `GET/POST/PATCH/DELETE /course/:courseId/modules` + `POST .../reorder` | ✅ | ✅ | ✅ | ✅ khoá được gán (`assertCanManageCourse`) | Có trên decorator; service 403 nếu không thuộc đội giáo án |
| Tiết học: `GET/POST/PATCH/DELETE /course/:courseId/modules/:moduleId/lessons` + `POST .../reorder` | ✅ | ✅ | ✅ | ✅ khoá được gán | Cùng quy tắc `teacher` |
| Quiz ôn nhẹ: `GET/POST/DELETE /lessons/:lessonId/quizzes` | ✅ | ✅ | ✅ | ✅ | Có trên decorator; service vẫn `assertCanManageCourse` |
| Câu hỏi tiết thực hành: `GET/POST/PATCH/DELETE /lessons/:lessonId/questions` | ✅ | ✅ | ✅ | ✅ khoá được gán | Cùng quy tắc `teacher` |

Tạo chuyên đề: body `POST /course/:courseId/modules` là `{ "title": "..." }`. `courseId` lấy từ path; gửi thêm trong body cũng được, controller ghi đè bằng param.

Loại tiết: `LessonKind` = `theory` (video/nội dung) hoặc `practice` (chỉ tập câu hỏi). Tạo/sửa tiết thực hành kèm `videoUrl` hoặc `content` → `400` *«Tiết thực hành không được kèm video hoặc nội dung — chỉ gồm tập câu hỏi.»*

Xoá chuyên đề hoặc tiết học khi còn `class_content_items` tham chiếu **kể cả item đang ẩn** → `409` *«Không thể xoá chuyên đề/tiết học: còn N lớp đang tham chiếu — {tên lớp} (X lần giao đang hiện, Y lần giao đang ẩn).»*

`lesson_plan` thuần soạn cây nội dung trên khoá được gán. GET list chuyên đề kèm `lessonCount`; GET list tiết kèm `quizCount` / `questionCount`.

Học sinh: `GET/POST /users/me/student-classes/:classId/lessons/:lessonId` (+ `/view`, `/quizzes`). Không còn path lồng `topics`/`lectures`.

## Không đổi trong ticket 02

- `question.controller.ts`
- `exam-library.controller.ts`
- các endpoint `difficulty-levels` trên `CourseController`
