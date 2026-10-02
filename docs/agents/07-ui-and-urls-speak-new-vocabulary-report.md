# Vé 07 — Giao diện và URL nói bằng từ vựng mới

**Branch:** `SunnyYeahBoiii/rename-three-levels` (chung với vé 05/06). Không merge / rebase / PR.

## Đã làm

- Path builders: href `/courses/:id/modules/:moduleId/lessons/*`, học sinh `/student/classes/:id/lessons/:lessonId`; Axios `/modules` `/lessons`. Query `?module=` (không `?chapter=` / `?lecture=` / `tab=topics`).
- App Router: `chapters/[chapterId]/topics` → `modules/[moduleId]/lessons`; student `topics/[topicId]` → `lessons/[lessonId]`.
- FE DTO `apps/web/dtos/course-content.dto.ts` (`CourseModule` / `CourseLesson` / `LessonKind`); xoá `topic.dto.ts`.
- Nhãn dùng chung `apps/web/lib/course-content-labels.ts` + `TimelineKindBadge`: Buổi học = CalendarDays + success; Tiết học = BookOpen + primary; không viết tắt "Tiết"/"Buổi". Tiết lý thuyết / Tiết thực hành khác màu trong danh sách.
- Workspace khoá: `CourseModulesPanel` / `CourseLessonsPanel` / `LessonWorkspace` / `TheoryLessonEditor` / `PracticeLessonQuestionsCard`. Flatten lecture: video/nội dung trên chính tiết.
- Timeline/lớp: `ClassContentManager` **Thêm tiết học**; picker cây Chuyên đề → Tiết học; editor lý thuyết `GET/PATCH /class/:id/lessons/:lessonId`.
- Copy user-facing: không còn chương / chủ đề / bài học (Lecture) / chuyên đề lý thuyết / chuyên đề luyện tập trên admin/staff/học sinh. Giữ "Nội dung bài học" của buổi học và "bài học" của giáo án.
- Docs: `docs/pages/admin.md`, `staff.md`, `student.md`, `README.md`, `docs/Cách làm việc.md`, `docs/CHANGELOG.md`.

## Verify

- Path tests: `course-content-routes.test.ts`, `content-api-paths.test.ts`, `query-invalidation.test.ts` — 5/5.
- API `kindLabel`: `Tiết lý thuyết` / `Tiết thực hành` (class-content + class-timeline).
- `pnpm --filter web exec tsc --noEmit` — sạch (0 error). Nghiệm thu tích hợp đầy đủ: vé 08. Không merge.

## Không làm

- Không mở PR, không merge vào `dev`.
- Không đụng session "Nội dung bài học", giáo án, CF "chương", tiếng Nhật.
