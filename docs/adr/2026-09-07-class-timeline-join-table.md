# ADR: Timeline lớp là bảng join riêng, không nhồi vào `ClassContentItem`

- **Status:** Accepted
- **Date:** 2026-09-07

## Context

Trang chi tiết lớp cần một dải **timeline** trộn buổi học, báo cáo khảo sát lớp, và chuyên đề (nội dung lớp). Thứ tự DnD của admin/staff là nguồn sự thật cho học sinh. `ClassContentItem` đã mang chuyên đề, lịch lần giao (`openAt`/`durationMinutes`), và `attempts`. Nếu thêm `session`/`class_survey` vào cùng bảng, XOR FK + kind + lịch giao + attempt sẽ chồng nghĩa.

## Decision

Bảng `class_timeline_items` (`ClassTimelineItem`) là join riêng:

- `kind`: `session` | `class_survey` | `content_item`
- đúng một FK: `sessionId` / `classSurveyId` / `classContentItemId` (CHECK + unique)
- `sortOrder` là thứ tự hiển thị. Mặc định **mới nhất → cũ nhất** (`classes.timeline_custom_order = false`): buổi (ngày + giờ bắt đầu), khảo sát (`report_date`), chuyên đề (`open_at` hoặc `created_at`). FE kéo-thả chỉ đổi list local; bấm **Lưu thứ tự** mới persist. Lưu lỗi rollback về thứ tự server (không khóa `timeline_custom_order`). Lần lưu DnD đầu tiên set `timeline_custom_order = true` và khóa `sortOrder`. Mục mới: auto → chèn đúng chỗ theo giờ; đã khóa DnD → append cuối.

Không dùng `ClassContentItem` làm chỗ chứa buổi học hay khảo sát.

## Considered options

- **Kéo `ClassContentItem.kind` thêm session/survey:** ít bảng, nhưng trộn lịch giao luyện tập, attempt, và điểm danh buổi học trên cùng row.
- **Chỉ sort client, không persist:** học sinh và admin lệch thứ tự sau reload.

## Consequences

- API: `GET/POST /class/:classId/timeline` (staff list + reorder), `GET .../timeline/student?cursor&limit`.
- `POST .../timeline/reorder` bắt buộc `orderedIds` chứa mọi item của lớp đúng 1 lần (id trùng hoặc id lạ → 400). Tạo/nhập chuyên đề vào lớp (`createClassContentItem`) ghi topic + content item + dòng timeline + resync sort trong một `$transaction`.
- `class_content_items.sort_order` vẫn là thứ tự trong picker nội dung; thứ tự **học sinh thấy** là `class_timeline_items.sort_order`.
