# Vé 06 — API nói bằng từ vựng mới

**Branch:** `SunnyYeahBoiii/rename-three-levels` (chung với vé 05/07). Không merge / rebase / PR.

## Đã làm

- Đổi Nest `apps/api/src/topic/` → `apps/api/src/course-content/` (`CourseContentModule`). Không đụng `apps/api/src/lesson/` (giáo án nhân sự).
- HTTP không alias: `/course/:courseId/modules`, `/course/:courseId/modules/:moduleId/lessons`, `/lessons/:lessonId/quizzes`, `/lessons/:lessonId/questions`, `/class/:classId/lessons`, `/class/:classId/content/course-lessons`, học sinh `/users/me/student-classes/:classId/lessons/:lessonId` (+ `/view`, `/quizzes`).
- DTO `apps/api/src/dtos/course-content.dto.ts`; Swagger mô tả Chuyên đề / Tiết học / `LessonKind` {theory, practice}.
- Tiết thực hành kèm video/nội dung → 400 tại `assertPracticeHasNoMedia`.
- Xoá chuyên đề/tiết còn `class_content_items` (kể cả ẩn) → 409 kèm tên lớp + số lần giao hiện/ẩn.
- Seed `seed-question-bank.ts` + pack data dùng `prisma.module` / `prisma.lesson`; UUID salt `'chapter'`/`'topic'` giữ nguyên để id không đổi.
- Docs: `docs/api/courses.md`, `docs/Database Schema.md`, `docs/Seed Question Bank.md`, `docs/CHANGELOG.md`.

## Verify

- `pnpm check-types` (`apps/api`) — sạch.
- Jest API: 88/89 suite xanh khi chạy song song; `sepay.service.spec.ts` SIGSEGV worker (không liên quan vé), chạy lại `--runInBand` 7/7 xanh. Course-content 84/84.
- `apps/web` cố ý còn đỏ — vé 07. Nghiệm thu xanh: vé 08.

## Không làm

- Không sửa migration đã commit (kể cả vé 05).
- Không đổi FE path/DTO (`content-api-paths.ts`, `apps/web/dtos/topic.dto.ts`).
