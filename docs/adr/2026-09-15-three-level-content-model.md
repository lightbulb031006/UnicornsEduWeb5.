# ADR: Mô hình nội dung ba cấp — Khoá học → Chuyên đề → Tiết học

- **Status:** Accepted
- **Date:** 2026-09-15
- **Supersedes:** phần cây bốn cấp Chủ đề / Chuyên đề / Bài học trong `docs/adr/2026-09-10-course-content-drill-down.md` (tab workspace và prefactor URL đã đổi ở vé 06–07)
- **Details:** `docs/adr/2026-09-16-one-lecture-becomes-one-lesson.md`, `docs/adr/2026-09-16-class-owned-lesson-xor.md`

## Context

Cây nội dung trên `dev` là bốn cấp: `Course` → `Chapter` (chủ đề) → `Topic` (chuyên đề) → `Lecture` (bài học). Lớp gắn `ClassContentItem` vào **topic**, nên một chuyên đề lý thuyết nhiều bài chỉ hiện **một** mục trên danh sách nội dung và timeline. Biên bản 13/09/2026 chốt rename dứt điểm và mỗi bài giảng cũ thành **một** tiết lý thuyết riêng, không gộp.

21 migration trên `dev` chưa chạy production. Sửa migration cũ sẽ buộc reset DB local/staging.

## Decision

1. **Tên:** `chapters` → `modules` (Chuyên đề), `topics` → `lessons` (Tiết học), `lectures` biến mất, `TopicKind` → `LessonKind {theory, practice}`. Tên cũ không tái dùng.
2. **Backfill:** mỗi `lectures` row → một tiết `theory` (giữ id, title, video, content, thứ tự trong chuyên đề). Topic `practice` → tiết `practice` (giữ id). Topic `theory` không có lecture → một tiết `theory` (giữ id) để không mất mục.
3. **Lớp:** một lần giao topic lý thuyết N bài → N `class_content_items` + N `class_timeline_items`. Item gốc (seq = 1) giữ attempts và lượt xem; ẩn/`hidden_by_staff_id` copy sang item mới. Lượt xem cũ ở tiết đầu; tiết sau chưa xem.
4. **XOR ở tầng dữ liệu:** CHECK `lessons_owner_check` — `(course_id + module_id)` XOR `class_id`. Tiết riêng lớp không thuộc chuyên đề. CHECK `lessons_practice_no_media_check` — tiết thực hành không có `video_url`/`content`.
5. **Migration mới** `20260921000000_rename_three_level_content` chồng lên lịch sử. Không sửa file migration đã commit. Production sẽ tạo bảng tên cũ rồi đổi tên ngay sau đó.

HTTP path / Prisma client call site (web + Nest) nghiệm thu xanh ở vé 08 trên cùng integration branch.

## Considered options

- **Gộp nhiều lecture vào một tiết:** trái AC "không gộp"; lớp sẽ vẫn một mục nội dung.
- **Sửa 21 migration cũ:** reset dữ liệu test của mọi người; bị cấm.
- **Giữ bảng `lectures` song song:** tên cũ tái dùng, lệch glossary.

## Consequences

- Sau migrate không còn bảng/cột `chapters` / `topics` / `lectures` / `chapter_id` / `topic_id` / `lecture_id`.
- `ClassContentItem.lessonId` Restrict — xóa chuyên đề/tiết cấp khoá khi còn lần giao vẫn 409.
- API (vé 06) nói `modules` / `lessons` trên HTTP, DTO, Swagger; không alias. FE (vé 07) cùng path. Nghiệm thu typecheck/test: vé 08.
