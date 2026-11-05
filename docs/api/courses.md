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

Tạo tiết ở khoá **không** tự thêm vào lớp nào (ADR `docs/adr/2026-10-18-class-content-as-lesson-set.md`). Tạo tiết với `classId` (tiết riêng lớp) → `400` *«Lớp không tạo tiết riêng nữa. Hãy thêm tiết có sẵn của khoá.»* Sửa/xoá tiết đã lưu trữ (`archivedAt`, tiết riêng lớp cũ) → `400` *«Tiết học đã lưu trữ, không sửa hay xoá được.»* ADR `docs/adr/2026-10-02-class-content-by-module.md`.

## Chuyên đề của lớp (`/class/:classId/modules`)

Controller: `class-course-module.controller.ts` (`ClassCourseModuleService`). Quyền: admin + staff `assistant`/`teacher` (cùng `validateStaffClassAccess` với nội dung lớp).

| Method | Path | Body | Kết quả |
| --- | --- | --- | --- |
| `GET` | `/class/:classId/modules` | — | `ClassModuleResponseDto[]`: mọi chuyên đề của khoá của lớp, theo `sortOrder` khoá — `{ moduleId, title, sortOrder, classSortOrder, theoryLessonCount, practiceLessonCount, inClassLessonCount, added, addedAt }` (đếm tiết chưa lưu trữ; `inClassLessonCount` = số tiết đó lớp đang có, kể cả Ẩn tay, không tính tiết đã gỡ; `classSortOrder` = thứ tự nhóm của lớp, `null` khi chưa có nhóm; `added` = lớp có nhóm — kể cả nhóm sinh ra do thêm lẻ tiết) |
| `POST` | `/class/:classId/modules` | `{ "moduleId": "..." }` | Thêm **cả chuyên đề** (chốt một lần, #232): tạo item + dòng timeline cho mọi tiết **đang có** (chưa lưu trữ) còn thiếu — lý thuyết trước, thực hành sau, mỗi loại theo `order` tiết. Mỗi tiết thực hành thành **lần giao**: `openAt` = lúc thêm, `closeAt` = `classes.contentAccessExpiresAt` (khoá vô hạn → không hạn), `shuffleQuestions = true`. Item từng **gỡ** (`removedAt`) trở lại lớp (giữ lịch cũ); item hiện lại nếu ẩn kèm lần gỡ (`module_removed`), item gia sư tự ẩn (`manual`) giữ ẩn. Chuyên đề mới vào lớp → nhóm **lên đầu**; lớp đã có nhóm (thêm lẻ tiết trước đó) → giữ vị trí, chỉ bổ sung tiết thiếu (idempotent, không còn `409`). Tiết khoá thêm về sau không tự vào lớp. Trả danh sách mới. `400` chuyên đề khác khoá. |
| `DELETE` | `/class/:classId/modules/:moduleId` | — | Gỡ chuyên đề = coi như chưa từng thêm (#233): mọi item của chuyên đề (lý thuyết, lần giao, **kể cả item đang Ẩn**) nhận `removedAt` → biến mất ở mọi phía (nội dung lớp, nhóm, timeline staff + học sinh); item đang hiện ẩn kèm `hiddenReason = module_removed` + dòng timeline. Lượt xem, attempt, điểm giữ nguyên. Trả danh sách mới. `404` *«Lớp chưa thêm chuyên đề này.»* |
| `PUT` | `/class/:classId/modules/order` | `{ "moduleIds": ["..."] }` | Sắp lại thứ tự nhóm chuyên đề của lớp (`class_modules.sort_order`; học sinh thấy cùng thứ tự). `moduleIds` phải đúng **mọi** chuyên đề lớp đang có, mỗi id một lần — trùng/thiếu/thừa → `400`. Không đổi `modules.sort_order`. Trả danh sách mới. |
| `GET` | `/class/:classId/modules/:moduleId/removal-impact` | — | `ClassModuleRemovalImpactDto` `{ moduleId, ungradedEssayCount, inProgressStudentCount }`: số câu tự luận đã nộp chưa chấm + số học sinh đang làm dở lần giao (chưa gỡ) của chuyên đề. Dialog xác nhận gỡ hiện cảnh báo, **không chặn** gỡ. |

ADR `docs/adr/2026-10-05-class-module-order-and-removal.md`.

Thời lượng làm bài (#228): `POST /course/:courseId/modules/:moduleId/lessons` (và `POST /course/:courseId/exam-library`) với `kind: practice` **bắt buộc** `durationMinutes` (int 1–720, phút/lượt) — thiếu → `400` *«Tiết thực hành phải đặt thời lượng làm bài (phút).»*; tiết lý thuyết bỏ qua giá trị. `PATCH` tiết nhận `durationMinutes?` — tiết lý thuyết → `400`. Response tiết có `durationMinutes`. Lượt mới của mọi lần giao đọc thời lượng từ tiết (trừ lần giao cũ đã chốt); `durationMinutes` trên response nội dung lớp/timeline/lobby là giá trị hiệu lực.

Liên quan nội dung lớp (`/class/:classId/content`):

- `POST` thêm lẻ **một tiết** (lý thuyết hoặc thực hành) có sẵn của khoá, body `{ lessonId, openAt?, closeAt?, shuffleQuestions? }` (#231). Tiết thuộc **bất kỳ** chuyên đề nào của khoá: lớp chưa có dòng `class_modules` cho chuyên đề đó thì tạo với `sortOrder = min − 1` → nhóm mới đứng **đầu**. Tiết thực hành thành **lần giao** (thời lượng đọc từ tiết, #228); tiết lý thuyết bỏ qua `openAt`/`closeAt`/`shuffleQuestions` (lưu `null`). Thiếu `lessonId` → `400` (không tạo tiết riêng). Tiết đã lưu trữ → `404`. Tiết khoá khác / tiết riêng lớp → `400` *«Tiết học không thuộc khoá của lớp.»* Tiết đã có trong lớp → `400`; đang Ẩn tay → `400` *«…Hãy khôi phục thay vì thêm lại.»* Tiết từng **gỡ** (`removedAt`, #233) → đưa item cũ trở lại (giữ lượt xem/attempt; tiết thực hành nhận lịch của lần thêm này; từng Ẩn tay thì vẫn ẩn), không tạo trùng.
- Hạn làm bài (#229): `closeAt` (ISO) trên `POST` (bỏ qua = `classes.contentAccessExpiresAt`, `null` = không hạn) và `PATCH /class/:classId/content/:itemId` (bỏ qua = giữ). `closeAt ≤ openAt` → `400` *«Hạn làm bài phải sau thời điểm mở bài.»* Response nội dung lớp có `closeAt`. Sau hạn `start` → `403`; điểm/đáp án hiện ngay khi nộp.
- `POST .../:itemId/restore` (bỏ Ẩn) item đã gỡ khỏi lớp → `400` *«Tiết đã gỡ khỏi lớp. Hãy thêm lại tiết thay vì khôi phục.»*; tiết đã lưu trữ → `400`. Ẩn tay (`DELETE /class/:classId/content/:itemId`) ghi `hiddenReason = manual`; khôi phục xoá lý do. Item đã gỡ → `DELETE` `404`.
- **Gỡ một tiết khỏi lớp** (#233, admin + staff `assistant`/`teacher`): `POST /class/:classId/content/:itemId/remove` — khác Ẩn: item nhận `removedAt`, biến mất ở mọi phía (kể cả item đang Ẩn); item đang hiện ẩn kèm `hiddenReason = module_removed` + dòng timeline. Bài làm, điểm, lượt xem giữ nguyên. Gỡ tiết cuối của chuyên đề → xoá dòng `class_modules` (nhóm biến mất). Trả danh sách nội dung lớp mới. `404` item không có / khác lớp / đã gỡ. Thêm lại tiết bằng `POST /class/:classId/content`.
- `GET /class/:classId/content/:itemId/removal-impact` → `ClassContentItemRemovalImpactDto` `{ itemId, ungradedEssayCount, inProgressStudentCount }` (cùng cách đếm với chuyên đề; tiết lý thuyết = 0). Chỉ cảnh báo, không chặn.
- `GET /class/:classId/content/course-lessons` trả **mọi tiết** (lý thuyết + thực hành) chưa lưu trữ của khoá (không gồm tiết riêng lớp), theo thứ tự chuyên đề → `order` tiết: `{ id, title, kind, moduleId, moduleTitle, alreadyAdded }`. Tiết đã gỡ khỏi lớp có `alreadyAdded = false` (#231).
- Tiết đã lưu trữ (`lessons.archived_at`) không hiện ở màn nào: `GET` nội dung lớp + timeline (staff, kể cả item đang ẩn; học sinh) bỏ item/dòng của tiết đó. Học sinh mở tiết/lần giao đó (`/users/me/student-classes/:classId/lessons/:lessonId`, `/view`, attempt) và staff xem tiến độ lý thuyết, hàng đợi chấm tự luận, thống kê lần giao → `404`. `POST /class/:classId/content/reorder` không cần (và không nhận, `400`) id của tiết đã lưu trữ. Dữ liệu giữ nguyên trong DB.
- `GET /class/:classId/content/groups` (admin + staff `assistant`/`teacher`, #153): `ClassContentModuleGroupDto[]` — `{ moduleId, title, added, theoryItems, practiceItems }`. Nhóm lấy từ **tập tiết của lớp** (ADR 2026-10-18): một nhóm cho mỗi chuyên đề lớp có ít nhất một item chưa gỡ (`removedAt = null`; chuyên đề không có tiết nào không có nhóm), theo thứ tự nhóm của lớp (`class_modules.sort_order`, nhóm chưa có thứ tự đứng đầu); trong nhóm lý thuyết theo `order` tiết, thực hành theo `sortOrder` item. Item không thuộc chuyên đề → nhóm cuối `moduleId: null`, `title: "Ngoài chuyên đề"`. Cùng bộ lọc với `GET` nội dung lớp (gồm item đang ẩn, bỏ tiết đã lưu trữ). Item có thêm `moduleId` và `hiddenReason` (`manual` / `module_removed` / `null`). Tạo tiết mới ở khoá không tự thêm vào lớp.
- `GET /class/:classId/content/student/groups` (học sinh, #156): cùng shape và cách gom như `/content/groups`, nhưng chỉ item học sinh thấy (bỏ item `hiddenAt`, tiết đã lưu trữ — cùng lọc `GET /content/student`), cùng thứ tự nhóm của lớp. Tiết thực hành chưa tới `openAt` vẫn trả về với `isOpen=false`. `403` khi không học lớp hoặc lớp hết hạn xem nội dung; `404` khi tài khoản không có hồ sơ học sinh.
- `GET` danh sách nội dung (staff + học sinh) sắp theo `sortOrder` chuyên đề → trong chuyên đề: lý thuyết theo `order`, rồi thực hành theo `sortOrder` item; item không có chuyên đề ở cuối.

`lesson_plan` thuần soạn cây nội dung trên khoá được gán. GET list chuyên đề kèm `lessonCount`; GET list tiết kèm `quizCount` / `questionCount`.

Học sinh: `GET/POST /users/me/student-classes/:classId/lessons/:lessonId` (+ `/view`, `/quizzes`). Không còn path lồng `topics`/`lectures`.

## Không đổi trong ticket 02

- `question.controller.ts`
- `exam-library.controller.ts`
- các endpoint `difficulty-levels` trên `CourseController`

## Hồ sơ môn Toán

`GET /public/app-config` trả `profile: math` khi API dùng `LMS_PROFILE=math`. Hỗ trợ trắc nghiệm một đáp án và tự luận, chấm thang 100 chia đều cho các câu.

## Hồ sơ môn IT (`LMS_PROFILE=it`) — câu hỏi Tin học (#178–#191)

ADR `docs/adr/2026-10-07-instance-subject-profile.md`, `docs/adr/2026-10-07-it-absolute-scoring-and-answer-key-regrade.md`.

| Method | Path | Ghi chú |
| --- | --- | --- |
| `GET` | `/public/app-config` | Không cần đăng nhập. `{ profile, questionTypes, optionCount: { min, max, default }, scoring, electiveGroups }`. IT: `questionTypes = ["single_choice","true_false_group"]`, `scoring = "absolute_it"`, `electiveGroups = true`. Web cache vô hạn (`useAppConfig`). |
| `POST/PATCH` | `/questions`, `POST /questions/bulk` | `type` phải thuộc `questionTypes` của hồ sơ (IT gửi `essay` → `400`). `true_false_group`: `options` đúng 4 chuỗi (nhận định a–d) + `tfAnswerKey: boolean[4]`, không có `correctIndex`. Loại khác gửi `tfAnswerKey` → `400`. Sửa `correctIndex`/`tfAnswerKey` → chấm lại im lặng các bài đã nộp có câu này. |
| `PATCH` | tiết học (khoá học / lớp / thư viện đề) | Nhận thêm `elective1Name`, `elective2Name` (`string \| null`, ≤ 120 ký tự). |
| `POST/PATCH` | `/lessons/:lessonId/questions` | Nhận thêm `slot`: `required` \| `elective_1` \| `elective_2`. Chỉ câu `true_false_group` được vào nhóm tự chọn; hồ sơ không có `electiveGroups` → chỉ nhận `required`. Summary trả `formWarning` (`null` khi hợp lệ; cảnh báo khi nhóm tự chọn chứa câu không phải Đúng/Sai, chỉ có một nhóm, hoặc hai nhóm lệch số câu). Đề sai form → học sinh bắt đầu làm bài bị `400` và câu kèm `tfAnswerKey`. |
| `PATCH` | `.../attempts/:attemptId/answers`, `POST .../submit` | Mỗi câu nhận thêm `tfChoices: (boolean \| null)[4]` (null = bỏ trống nhận định). |
| `GET` | chi tiết attempt (học sinh) | Thêm `scoring`, `electiveVoided`, `electiveGroupNames: { elective_1, elective_2 }`; mỗi câu thêm `slot`, `tfChoices`, `tfAnswerKey` (chỉ sau khi nộp). Điểm `absolute_it` là 1/100 điểm: 1000 = 10,00đ. |
| `POST` | ôn nhẹ `/users/me/student-classes/:classId/lessons/:lessonId/quizzes` | Câu Đúng/Sai gửi `tfChoices`; review trả `tfAnswerKey`. |

Chấm `absolute_it`: trắc nghiệm đúng = 25; Đúng/Sai theo số ý đúng 1 → 10, 2 → 25, 3 → 50, 4 → 100. Có nhận định được chọn ở cả hai nhóm tự chọn → `electiveVoided = true`, mọi câu tự chọn 0 điểm.

### Đề in (`examPrint`, chỉ IT)

Thuật ngữ: `CONTEXT.md` (**Đề in**). `GET /public/app-config` có `examPrint: boolean` (IT `true`, JP/ENG `false`); tắt → mọi endpoint dưới trả `404`. Response là `application/pdf` (A4), `Content-Disposition: attachment; filename="de-<slug>.pdf"` (bản có đáp án: `de-dap-an-<slug>.pdf`), `Cache-Control: private, no-store`.

| Method | Path | Ghi chú |
| --- | --- | --- |
| `GET` | `/lessons/:lessonId/print.pdf?answers=true\|false` | Tiết thực hành cấp khoá. Quyền như đọc câu hỏi của tiết (`GET /lessons/:lessonId/questions`): admin/trợ lí, đội giáo án của khoá. |
| `GET` | `/staff-ops/classes/:classId/assignments/:assignmentId/print.pdf?answers=true\|false` | Lần giao trên lớp. Admin/trợ lí + gia sư phụ trách lớp (`resolveClassViewAccessMode` = `admin` \| `teacher`); CSKH/đào tạo → `403`. Thời gian làm bài lấy từ lần giao. |
| `GET` | `/users/me/student-classes/:classId/assignments/:assignmentId/print.pdf` | Học sinh của lớp; luôn bản **Đề** (bỏ qua `answers`). Cùng điều kiện thấy lần giao như lobby: lần giao ẩn → `404`, chưa tới `openAt` → `403`, lần giao không có thời lượng → `400`. Không cần đã bắt đầu làm bài. |

- Nội dung: câu `single_choice` (Phần I) + `true_false_group` (Phần II, Bắt buộc → Tự chọn 1 → Tự chọn 2) theo **thứ tự gốc** của tiết, không đảo câu/phương án, không mã đề. Phần I đánh số từ Câu 1; Phần II đánh lại từ Câu 1, liên tục qua hai nhóm tự chọn. Câu loại khác bị bỏ qua. Tiết không có câu in được → `400` *Tiết chưa có câu hỏi để in.*; không phải tiết thực hành → `400`; tiết lưu trữ → `404`.
- Header: UNIEDU / tên khoá / *(Đề có NN trang)* ‖ tên tiết in hoa / *Môn: TIN HỌC* / *Thời gian làm bài: X phút, không kể thời gian phát đề* (bỏ dòng khi không có thời lượng); *Họ, tên thí sinh*, *Số báo danh*. Cuối đề *—— HẾT ——* + câu Giám thị. Chân trang *Trang x/N – <tên tiết>*.
- `answers=true` (chỉ phía dạy): thêm **một trang đáp án ở cuối** — bảng `Câu | Đáp án` (Phần I) và `Câu | a | b | c | d` Đ/S (Phần II, chia dòng nhóm Bắt buộc / tên nhóm tự chọn). Không in giải thích. *Đề có NN trang* chỉ đếm phần đề; `N` ở chân trang tính cả trang đáp án.
- Render: HTML → PDF bằng Chromium (`CHROMIUM_PATH`, dùng chung PDF biên lai), font Times New Roman → Liberation Serif, công thức KaTeX render sẵn, ảnh câu hỏi ký URL Supabase lúc in. Chromium chỉ được tải `data:` và ảnh từ origin `SUPABASE_URL`. Cache LRU 40 bản trong RAM theo nội dung đề (sửa câu → bản mới); tối đa 2 lượt render song song.

## Hồ sơ môn JP (`LMS_PROFILE=jp`) — câu hỏi tiếng Nhật (#193–#203)

Thuật ngữ: `CONTEXT.md` (Kỹ năng, Câu Đúng/Sai, Câu điền vào ô trống, Câu sắp xếp, Tư liệu dùng chung, Giới hạn nghe…).

| Method | Path | Ghi chú |
| --- | --- | --- |
| `GET` | `/public/app-config` | Thêm `questionSkills`, `questionWeights`, `essayInputSizes`, `sharedMaterials`, `questionAudio: boolean` (JP `true`); `inClassTest: boolean` — nhận xét buổi học có Kiểm tra trong buổi (IT `false`, JP/ENG `true`). JP `questionTypes = ["single_choice","essay","true_false","fill_blank","ordering"]`. |
| `POST/PATCH` | `/questions`, `POST /questions/bulk` | `skills: QuestionSkill[]` (`kanji` \| `vocabulary` \| `grammar` \| `reading` \| `listening` \| `conversation` \| `writing`). JP: tạo/sửa phải có ≥1 kỹ năng, không trùng (sửa câu cũ chưa có kỹ năng mà không gửi `skills` → `400`); bulk kiểm tra từng câu như tạo (nhập AI chọn kỹ năng chung cho cả lô). IT/ENG gửi `skills` khác rỗng → `400`. |
| `POST/PATCH` | `/questions` | `type: 'true_false'` (Câu Đúng/Sai, chỉ JP; IT/ENG → `400`): nhận định ở `content`, `tfAnswerKey: [boolean]` (đúng 1 phần tử), không `options`/`correctIndex`; `tfLabelStyle: 'maru_batsu' \| 'dung_sai' \| 'true_false' \| null` (`null` = ○/×; loại khác gửi → `400` *Chỉ Câu Đúng/Sai có kiểu nhãn.*). Bài làm: học sinh gửi `tfChoices: [boolean]`; câu trả về `tfChoices` 1 phần tử và `tfLabelStyle` (snapshot); không xáo; chấm cả câu; xem lại có `tfAnswerKey`. Sửa đáp án → chấm lại như câu khác. Ôn nhẹ: chọn một lựa chọn là đã trả lời. |
| `POST/PATCH` | `/questions` | `type: 'fill_blank'` (Câu điền vào ô trống, chỉ JP): ô là dấu `[[___]]` trong `content`; `blankAnswerKey: string[][]` — đáp án hợp lệ từng ô theo thứ tự, số phần tử = số dấu (1–10 ô, mỗi ô 1–10 đáp án ≤ 200 ký tự); không `options`/`correctIndex`/`tfAnswerKey`. Loại khác gửi `blankAnswerKey` → `400` *Chỉ câu điền vào ô trống có đáp án ô trống.* Response câu hỏi và `QuestionLink.question` có `blankAnswerKey`. Bài làm: học sinh gửi `blankAnswers: (string\|null)[]` (≤ 10 phần tử, mỗi chuỗi ≤ 200); câu trả về `blankCount` + `blankAnswers` (loại khác `null`); xem lại có `blankAnswerKey`. Chấm từng ô (bỏ khoảng trắng đầu/cuối, toàn góc = nửa góc cho số/Latin, không phân biệt hoa/thường), điểm = `round(pointsPossible × ô đúng / số ô)`, `isCorrect` khi đúng mọi ô; đã làm = mọi ô có chữ. Sửa đáp án ô → chấm lại lượt có cùng số ô. Ôn nhẹ: `GET …/lesson-quizzes` của học sinh trả `blankCount`, `blankAnswerKey: null`; `POST` nhận `blankAnswers`; câu trả lời ôn nhẹ trả `blankAnswers` + `question.blankAnswerKey`. |
| `POST/PATCH` | `/questions` | `type: 'ordering'` (Câu sắp xếp, chỉ JP): `options` = 2–12 thẻ không rỗng theo **đúng thứ tự** (thẻ trùng chữ hợp lệ); không `correctIndex`/`tfAnswerKey`. Lỗi `400`: *Câu sắp xếp phải có 2–12 thẻ.* / *Thẻ N không được để trống.* Bài làm: `options` của câu là thẻ đã xáo (luôn xáo lúc start); học sinh gửi `orderAnswer: string[]` (chữ thẻ theo thứ tự xếp, ≤ 12 phần tử, mỗi chuỗi ≤ 200); câu trả về `orderAnswer` (loại khác `null`); xem lại có `orderingKey: string[]` (thứ tự đúng). Chấm cả chuỗi (khớp toàn bộ mới có điểm); đã làm = dùng hết thẻ. Sửa thẻ → chấm lại lượt có cùng bộ thẻ. Ôn nhẹ: `GET …/lesson-quizzes` của học sinh trả `options` đã xáo cố định theo học sinh + câu; `POST` nhận `orderAnswer`; câu trả lời ôn nhẹ trả `orderAnswer` + `question.options` (thứ tự đúng). |
| `POST/PATCH` | `/questions` | `essayInputSize: 'short' \| 'long' \| null` — kiểu ô câu tự luận (JP). Câu không phải tự luận gửi → `400` *Chỉ câu tự luận có kiểu ô nhập.*; IT/ENG gửi → `400`. `null` = ô dài (câu cũ). Trả về trên câu hỏi, câu của tiết, quiz ôn nhẹ và câu trong bài làm (`AttemptQuestionDto.essayInputSize`, snapshot lúc start). Màn chấm tự luận không đổi. |
| `POST` | `/questions/bulk` | Mỗi câu nhận thêm `essayInputSize`, `tfLabelStyle`, `blankAnswerKey` cùng ràng buộc như `POST /questions` (nhập AI đủ 5 loại JP). `options` của mọi `POST/PATCH /questions` và bulk tối đa 12 phần tử ở tầng DTO (trước đây 6 làm Câu sắp xếp > 6 thẻ bị `400`); số phần tử đúng theo loại vẫn do quy tắc hình dạng câu kiểm tra (trắc nghiệm 2–6, sắp xếp 2–12). |
| `GET` | `/questions` | Lọc thêm `skill=<QuestionSkill>` (câu có kỹ năng đó), kết hợp với bộ lọc sẵn có. |
| `GET/POST/PATCH/DELETE` | `/shared-materials[?courseId=]`, `/shared-materials/:id` | Tư liệu dùng chung (JP; hồ sơ khác → `400`). List theo `courseId` trả `{ id, courseId, moduleId, title, content, questionCount, createdAt, updatedAt }`. Tạo bắt buộc `moduleId` (chuyên đề của bộ, cùng khoá → khác `400`) + `title` (1–200) + `content` HTML (rỗng được); phần đầu bộ phải có ít nhất một trong văn bản / ảnh (`<img>`) / `audioId`, thiếu cả ba (tạo hoặc sau khi sửa) → `400` "Phần đầu bộ cần có văn bản, ảnh hoặc audio."; sửa `moduleId` → mọi câu trong bộ chuyển chuyên đề theo. Câu chỉ vào bộ qua `POST /shared-materials/:id/questions` (câu mới) hoặc `POST /shared-materials/:id/questions/:questionId` (câu có sẵn); câu mới vào bộ xếp cuối bộ (`setPosition`). `DELETE` = xoá mềm bộ cùng mọi câu, gỡ khỏi mọi tiết thực hành / bài ôn (lượt đã bắt đầu / đã nộp giữ snapshot); bộ đã xoá → `404`, không còn trong list, không gắn câu / thêm vào tiết được. Ghi lịch sử thao tác (`shared_material`). |
| `PUT` | `/shared-materials/:id/question-order` | Sắp lại thứ tự câu trong Bộ câu hỏi. Body `{ questionIds: string[] }` — đủ mọi câu chưa xoá của bộ, mỗi câu một lần (thiếu / thừa / trùng → `400`); vị trí `setPosition` = thứ tự trong danh sách. |
| `POST/PATCH/GET` | `/questions` | `sharedMaterialId` không gắn / đổi bộ được: `POST /questions` có `sharedMaterialId` khác null → `400`; `PATCH` khác bộ hiện tại → `400` (đổi bộ qua chuyển vào / ra bộ). Lọc `GET /questions?sharedMaterialId=` (kết quả xếp theo thứ tự bộ); `GET /questions?standalone=true` = chỉ câu lẻ (ngân hàng JP hiện bộ dạng thẻ riêng). `QuestionLink.question` có `sharedMaterialId` + `sharedMaterial { id, title }`. |
| `POST` | `/audio-assets` | Tải audio tư liệu (JP; hồ sơ khác → `400`). `multipart/form-data`: `file` (MP3, M4A/AAC, WAV; > 20MB → `413`) + `courseId`. Quyền như ghi câu hỏi của khoá. Trả `{ id, originalName, url, maxPlays, allowSeek }` (signed URL 6 giờ; giới hạn mặc định không giới hạn, cho tua). Asset bất biến — thay audio = tải bản mới. |
| `POST/PATCH/GET` | `/questions`, `/shared-materials` | `audioId: string \| null` — gắn audio cùng khoá (khác khoá / hồ sơ không bật → `400`; `null` = gỡ). Mỗi audio thuộc đúng một chỗ: `audioId` đã gắn ở câu / bộ khác → `400` "Audio đã dùng ở chỗ khác — tải bản mới." Form câu trên web không còn ô audio (câu cũ giữ audio, sửa câu không gửi `audioId`); audio đặt ở phần đầu bộ. Response có `audio { id, originalName, url } \| null`. `QuestionLink.question` có `audioId` + `audio { id, originalName }` (không URL). |
| `PATCH` | `/audio-assets/:id/limits` | Giới hạn nghe (JP). Body `{ maxPlays: 1 \| 2 \| null, allowSeek: boolean }`. Quyền như ghi câu hỏi của khoá. Trả `AudioRef` (`{ id, originalName, url, maxPlays, allowSeek }`). Áp ngay cả cho lượt đang làm. |
| `POST` | `/question-images` | Tải ảnh nội dung câu hỏi / Bộ câu hỏi. `multipart/form-data`: `file` (JPEG, PNG, WEBP; > 5MB → `413`) + `courseId`. Quyền như ghi câu hỏi của khoá. Lưu bucket private `question-images`, path `{courseId}/{uuid}.{ext}`. Trả `{ path, url }` (signed URL 6 giờ). HTML lưu `<img data-question-image="{path}">`; `ContentImageInterceptor` (toàn cục) bỏ `src` của ảnh này khi ghi và ký lại `src` ở mọi response. Ảnh bất biến. |
| `GET` | Bài làm (`/users/me/student-classes/:classId/attempts/:attemptId` và các response `AttemptDetail` khác) | Câu có `audio` và `sharedMaterial.audio`: `{ id, url, maxPlays, allowSeek, playsUsed } \| null` theo snapshot lúc start. Lượt **đang làm** + audio có giới hạn: `url = null`, phải xin qua endpoint phát. Đã nộp/hết giờ: `url` thẳng, `maxPlays = null`, `allowSeek = true`. |
| `POST` | `/users/me/student-classes/:classId/attempts/:attemptId/audio/:audioId/play` | Học sinh bấm phát audio trong lượt đang làm. Trả `{ url, maxPlays, playsUsed }`; audio giới hạn trừ một lượt (nguyên tử). `404` audio không thuộc snapshot lượt làm; `409` hết lượt nghe hoặc lượt đã kết thúc/hết giờ. |
| `GET` | Ôn nhẹ (`/lessons/:id/quizzes...`) | Câu có `audioUrl` và `sharedMaterial.audioUrl` (signed URL ngắn hạn, ký mới mỗi lần tải; `null` = không có). Không áp Giới hạn nghe. |
| `GET` | bài làm, `…/lesson-quizzes` | Câu trả `sharedMaterial: { id, content } \| null` (bài làm: snapshot lúc start). Câu cùng tư liệu đứng liền nhau tại vị trí câu đầu khối; Đảo câu xáo cả khối, giữ thứ tự trong khối. Ôn nhẹ gom khối theo thứ tự tiết — cả danh sách câu lẫn câu trả lời khi xem lại (câu đã gỡ khỏi tiết xuống cuối). Vị trí trống `[[#<questionId>]]` trong `content` không đổi ở API; web thay bằng số câu trong lượt làm (sau Đảo câu), câu vắng → ô không số. |
| `POST/PATCH` | `/lessons/:lessonId/questions[/:linkId]` (liên kết câu vào tiết) | JP: `points` là **trọng số** câu-trong-tiết (null = 1); `points: 0` → `400` *Trọng số câu phải ≥ 1.* Lúc bắt đầu làm bài, `pointsPossible` = chia 100 theo trọng số (Hamilton). Sửa trọng số không chấm lại bài đã bắt đầu. ADR `2026-10-09-jp-weighted-scoring`. |
| `GET` | `/lessons/:lessonId/questions/summary` | Thêm `totalWeight` (tổng trọng số, null tính 1). |
| `POST` | `/lessons/:lessonId/questions/sets` | Thêm nguyên một Bộ câu hỏi vào tiết. Body `{ sharedMaterialId }`. Mọi câu chưa xoá của bộ được link theo thứ tự bộ, nối cuối tiết, `points` null (trọng số 1). Bộ không tồn tại → `404`; khác khoá → `400`; bộ chưa có câu / đã có trong tiết → `400`. ADR `2026-10-09-question-set`. |
| `DELETE` | `/lessons/:lessonId/questions/sets/:sharedMaterialId` | Gỡ mọi link câu của bộ khỏi tiết. Bộ không có trong tiết → `404`. |
| `POST/DELETE` | `/lessons/:lessonId/questions[/:linkId]` (câu thuộc bộ) | Link lẻ / gỡ lẻ câu thuộc bộ → `400` ("Câu thuộc bộ — thêm cả bộ vào tiết." / "… gỡ cả bộ khỏi tiết."). Sửa trọng số từng câu của bộ vẫn được. |
| `PUT` | `/lessons/:lessonId/questions/reorder` | Phải gửi đủ mọi link của tiết, mỗi link một lần (thiếu / thừa / trùng → `400`). Câu của một bộ phải liền nhau → khác `400` "Bộ câu hỏi phải là một mục liền trong tiết." |
| `POST` | `/lessons/:lessonId/quizzes/sets` | Thêm nguyên Bộ câu hỏi vào bài ôn nhẹ của tiết lý thuyết. Body `{ sharedMaterialId }`. Mọi câu chưa xoá của bộ theo thứ tự bộ, nối cuối. Bộ không tồn tại → `404`; khác khoá / chưa có câu / đã có trong bài ôn → `400`. |
| `DELETE` | `/lessons/:lessonId/quizzes/sets/:sharedMaterialId` | Gỡ mọi câu của bộ khỏi bài ôn. Bộ không có trong bài ôn → `404`. |
| `POST/DELETE` | `/lessons/:lessonId/quizzes[/:questionId]` (câu thuộc bộ) | Gắn / gỡ lẻ câu thuộc bộ → `400` ("Câu thuộc bộ — thêm cả bộ vào bài ôn." / "… gỡ cả bộ khỏi bài ôn."). Bài ôn đi theo bộ như tiết thực hành: câu mới của bộ tự vào bài ôn ngay sau câu cuối của bộ; xoá câu bộ gỡ khỏi bài ôn (câu trả lời cũ vẫn xem lại được, xếp cuối). |
| `GET` | `/shared-materials/:id/usage` | `{ lessonCount, assignedLessonCount, quizLessonCount }` — số tiết thực hành đang dùng bộ, số tiết trong đó đã giao cho lớp, số tiết lý thuyết có bài ôn nhẹ chứa bộ (cảnh báo trước khi thêm / xoá câu). |
| `GET` | `/shared-materials/questions/:questionId/usage` | Cùng shape, đếm theo một câu — cảnh báo trước khi chuyển câu vào / ra bộ. |
| `POST` | `/shared-materials/:id/questions/:questionId` | Chuyển câu lẻ vào bộ: gỡ mọi link lẻ của câu trong tiết thực hành / bài ôn, câu nhận chuyên đề của bộ, đứng cuối bộ và vào mọi tiết / bài ôn đang dùng bộ (sau câu cuối của bộ). Câu khác khoá / đã ở bộ này / thuộc bộ khác → `400`; câu không tồn tại hoặc đã xoá → `404`. Ghi lịch sử (`question`). |
| `POST` | `/shared-materials/:id/questions` | Tạo câu mới trong bộ (body như `POST /questions`). Câu nhận chuyên đề của bộ (bỏ qua `moduleId` gửi lên), đứng cuối bộ, vào mọi tiết / bài ôn đang dùng bộ. Bộ không tồn tại / đã xoá → `404`. |
| `DELETE` | `/shared-materials/:id/questions/:questionId` | Đưa câu ra khỏi bộ: câu biến mất khỏi mọi tiết / bài ôn, thành câu lẻ (`sharedMaterialId`, `setPosition` = null). Câu không thuộc bộ → `404`. Lượt đã bắt đầu giữ snapshot. |
| — | Tiết đi theo bộ | `POST /shared-materials/:id/questions` → câu mới được link vào mọi tiết đang dùng bộ, ngay sau câu cuối của bộ, `points` null. `DELETE /questions/:id` câu thuộc bộ → gỡ khỏi mọi tiết (không còn `409`). Lượt làm đã bắt đầu giữ snapshot cũ. |
