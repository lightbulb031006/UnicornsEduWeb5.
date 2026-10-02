# ADR: Drill-down chủ đề; trang chuyên đề; bỏ tab Đề thi

- **Status:** Accepted
- **Date:** 2026-09-10
- **Supersedes:** quyết định 1 (bốn tab, gồm `de-thi`) trong `docs/adr/2026-09-10-course-workspace.md`

## Context

Workspace khoá học gộp bốn bề mặt thành bốn tab trên một URL. Tab **Đề thi** và tab **Nội dung** đọc cùng hàng `Topic(kind = practice)` qua hai API / hai query key. Cây nội dung accordion (chủ đề mở sẵn chuyên đề + bài học) khiến list dài, không kéo-thả, và nhét editor bài học vào dialog. `PATCH`/`DELETE` chuyên đề cấp khoá mà FE gọi không tồn tại trên `CourseTopicController`. `lesson_plan` thuần soạn đề qua tab Đề thi nhưng bị chặn decorator cây Chương/Chuyên đề/Bài học.

## Decision

1. **Ba tab:** `noi-dung` · `cau-hoi` · `cai-dat`. Gỡ `ExamTab`. `?tab=de-thi` `replace` sang `noi-dung`. API `exam-library` giữ cho lần giao lớp.
2. **List chủ đề phẳng** trên tab Nội dung; bấm row → `?chapter=` list chuyên đề (cùng trang khoá). Cả hai list kéo-thả local, **Lưu thứ tự** mới POST reorder; rời dirty thì ConfirmDialog.
3. **Trang chuyên đề** `/…/courses/:id/chapters/:chapterId/topics/new|[topicId]` (admin + staff). Tạo: chọn `kind` rồi tên. Sửa: tên blur-save; lý thuyết = list bài học + `?lecture=` thay list; luyện tập = `PracticeTopicQuestionsCard`.
4. **`lesson_plan` mở cây nội dung** (decorator `COURSE_TREE_STAFF_ROLES` gồm `lesson_plan`); service vẫn `assertCanManageCourse`.
5. **Ngôn ngữ:** UI admin/staff không dùng **Đề thi** / **Thư viện đề thi** — chỉ **chuyên đề luyện tập**. Glossary: `CONTEXT.md`.

## Considered options

- Giữ tab Đề thi + search xuyên khoá: hai bề mặt cùng bảng, `lesson_plan` lệch quyền.
- Nested route cho list chuyên đề: thêm file route cho bước nông; query param đủ Back/share.
- Autosave DnD: nhanh hơn, dễ mất thứ tự khi kéo nhầm — loại vì đã chốt Lưu thứ tự trên timeline.

## Consequences

- `CourseTopicController` có GET/PATCH/DELETE `:topicId`.
- GET chapters/topics trả `topicCount` / `lectureCount` / `questionCount`.
- Staff mirror cùng path dưới `/staff/courses/...`.
- Prefactor (vé 04): FE không ghép URL cây nội dung rải rác. Href trang: `apps/web/lib/course-content-routes.ts`. Endpoint Axios: `apps/web/lib/content-api-paths.ts`. Hai bộ dựng tách biệt; đổi tên segment sau này chỉ sửa hai file đó.
