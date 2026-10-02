# ADR: Workspace khoá học một trang bốn tab; đội giáo án đi staff shell

- **Status:** Accepted (quyết định 1 về bốn tab: **superseded một phần** bởi `docs/adr/2026-09-10-course-content-drill-down.md` — tab `de-thi` gỡ, còn 3 tab)
- **Date:** 2026-09-10
- **Ticket:** 08 (course-workspace; quyết định đã triển khai ở ticket 01–07)

## Context

Trước workspace này, một khoá học bị xé thành bốn bề mặt admin: danh sách/cài đặt dưới `/admin/classes/courses`, ngân hàng câu hỏi `/admin/question-bank`, thư viện đề `/admin/exam-library`, và cây nội dung gắn trang chi tiết khoá. Người soạn giáo án phải nhớ dropdown chọn khoá trên từng trang; bookmark và sidebar trỏ bốn URL khác nhau cho cùng một thực thể.

Đội giáo án (`lesson_plan`, `lesson_plan_head`) không vào admin shell. Mở `/admin/**` cho họ sẽ phá ma trận workspace đã chốt (`docs/pages/README.md`): assistant mirror admin, giáo án ở staff. Quyền nội dung khoá đã có ở `CourseAccessService` (manager = admin / `assistant` / `lesson_plan_head`; `lesson_plan` thuần chỉ khoá được gán). `GET /courses` từng trả mọi khoá cho mọi staff — đủ cho dropdown tạo lớp, sai cho danh sách workspace của giáo án.

`CourseService.create` / `update` / `remove` chỉ nhận DTO/id, không nhận actor, không gọi `CourseAccessService`. Tạo và xoá khoá vì thế không có tầng service theo từng người.

## Decision

1. **Gộp bốn trang thành một workspace có tab.** UI nằm ở `apps/web/components/course-workspace/` (`CourseListWorkspace`, `CourseDetailWorkspace`, bốn tab). Bốn file App Router chỉ là wrapper mỏng truyền `routeBase`. Tab theo thứ tự `noi-dung` · `cau-hoi` · `de-thi` · `cai-dat`, state `?tab=`. Header khoá (tên, Sửa/Switch/Xoá) nằm ngoài vùng tab vì đó là thao tác trên thực thể khoá, không phải nội dung một tab. Khoá đến từ URL — không còn dropdown chọn khoá trên ngân hàng/đề thi.

2. **Đội giáo án đi staff shell, không mở admin shell.** Admin/assistant dùng `/admin/courses*`. `lesson_plan` / `lesson_plan_head` dùng `/staff/courses*` (gate `isStaffCoursesRoute`, sidebar **Nội dung khoá**). Cái giá: hai bộ route wrapper trỏ cùng một bộ component. `routeBase` chỉ dựng href; `resolveCourseWorkspaceCapabilities(profile, routeBase)` được phép **thu hẹp** quyền trên `/admin` (chỉ admin/assistant), **không** được mở rộng quyền vì đang đứng trên `/staff`. Không sửa `admin-shell-access.ts` để nhét giáo án vào admin.

3. **`resolveListableCourseIds` tách khỏi `resolveViewableCourseIds`.** Hai câu hỏi khác nhau. Listable = được *thấy tên khoá* trên `GET /courses` (dropdown lớp, danh sách workspace): `null` (mọi khoá) trừ `lesson_plan` thuần thì chỉ id từ `course_lesson_plan_members`. Viewable = được *quản lý nội dung* một khoá: manager mọi khoá, `lesson_plan` thuần khoá gán, mọi role còn lại mảng rỗng. Gộp hai hàm là nguồn lỗi phân quyền — training/teacher/kế toán/CSKH sẽ mất dropdown khoá khi tạo lớp.

4. **`lesson_plan_head` được tạo và xoá khoá học.** Trưởng giáo án đã nằm trong `COURSE_MANAGER_STAFF_ROLES` nên thấy/sửa mọi khoá; thiếu quyền tạo/xoá thì họ quản lý nội dung của một danh sách khoá mà không thể lập khoá mới hay gỡ khoá rỗng. Controller `POST /courses` và `DELETE /courses/:id` thêm `@AllowStaffRolesOnAdminRoutes(..., lesson_plan_head)` cạnh `assistant`.

   **Rủi ro đã chấp nhận:** `CourseService.create` và `CourseService.remove` **không nhận actor** và **không** gọi `CourseAccessService`. Guard controller (`@Roles` + `@AllowStaffRolesOnAdminRoutes`) là tầng bảo vệ duy nhất cho tạo/xoá. `PATCH` khoá cùng kiểu — service không kiểm actor. Caller nội bộ hoặc decorator bị nới sau này sẽ tạo/xoá được khoá mà không đi qua `assertCanManageCourse`. Chấp nhận vì tạo/xoá không có “khoá được gán” để so: đó là thao tác toàn cục, trùng tập manager, và `remove` vẫn chặn khi còn lớp. Không backfill actor vào service trong đợt này.

5. **Xoá thẳng bốn route cũ, không redirect.** `/admin/question-bank`, `/admin/exam-library`, `/admin/classes/courses`, `/admin/classes/courses/[id]` bị xoá. Không `redirect()` trong App Router. Bookmark cũ 404 có chủ đích: giữ redirect vĩnh viễn sẽ hai URL cho cùng workspace, sidebar/docs dễ lệch, và query cũ (dropdown khoá, không có `?tab=`) không map 1-1 sang tab.

## Considered options

- **Giữ bốn trang, chỉ chia sẻ component:** vẫn bốn URL, dropdown khoá, sidebar ba mục. Bị loại vì đúng vấn đề nghiệp vụ (một khoá, một chỗ).
- **Mở `/admin/courses` cho `lesson_plan*`:** một bộ route, nhưng giáo án vào admin shell — trái policy mirror và làm sidebar admin hiện với role không được coi là quản trị.
- **Một hàm phạm vi khoá dùng cho cả list và nội dung:** ít API hơn, phá dropdown tạo lớp của role vận hành (viewable = `[]`).
- **`lesson_plan_head` chỉ sửa nội dung, không tạo/xoá khoá:** an toàn hơn với lỗ hổng actor trên `create`/`remove`, nhưng trưởng giáo án không lập được khoá mới khi chương trình đổi.
- **Redirect 301/308 từ URL cũ:** thân thiện bookmark, giữ URL chết sống mãi và không có mapping tab trung thực.

## Consequences

- Nguồn sự thật UI: `apps/web/components/course-workspace/` + `apps/web/lib/course-workspace-access.ts`. Spec: `docs/pages/admin.md`, `docs/pages/staff.md`. API: `docs/api/courses.md`.
- Tab Đề thi và tab Nội dung cùng hàng `Topic.kind = practice` (hai query key; invalidate dùng `invalidateCoursePracticeTopicQueries`).
- `Question.chapterId` NOT NULL: `lesson_plan` không tạo Chương nên khoá chưa có chương thì không tạo câu hỏi — empty state, không mở form trống.
- Người sau đọc `DELETE /courses/:id` cho `lesson_plan_head` thì câu trả lời là quyết định 4 ở trên, không phải quên sót guard service.
