# ADR: Ẩn mềm nội dung lớp; Restrict FK cây Kiến thức

- **Status:** Accepted
- **Date:** 2026-09-07
- **Ticket:** #99

## Context

PRD 3.3: gia sư xoá item nội dung lớp thì hệ thống **chỉ ẩn khỏi học sinh**, không xoá dữ liệu để tra cứu sau. PRD 2.2: lịch sử làm bài luyện tập ở khoá/lớp cũ vẫn được giữ.

Trước đây `DELETE` nội dung lớp gọi `classContentItem.delete()` (và `topic.delete()` nếu topic riêng lớp). `ClassContentItem.topicId` và `Attempt.assignmentId` dùng `onDelete: Cascade`. Xoá Chủ đề / Chuyên đề / Bài học cấp khoá vì thế có thể cascade xuống lần giao → Attempt → AttemptAnswer ở **mọi lớp**.

`mapClassContentItem` đã có nhãn `(Chuyên đề đã xoá)` khi `topic` null — đó là dấu vết của cascade cũ, không phải luồng xóa mới.

## Decision

1. **Ẩn mềm, không xoá dòng.** `class_content_items` và `class_timeline_items` thêm `hidden_at` (nullable timestamptz) và `hidden_by_staff_id` (nullable FK → `staff_info`, `onDelete: SetNull`). `DELETE /class/:id/content/:itemId` set cả hai bảng (dòng timeline `content_item` cùng `classContentItemId`). `POST .../restore` xóa cờ. Unique `(class_id, topic_id)` giữ nguyên: không thêm lại cùng chuyên đề khi đang ẩn — khôi phục.

2. **Học sinh không thấy item đã ẩn.** Mọi GET nội dung lớp / timeline / topic đã giao / bắt đầu Attempt / quiz ôn nhẹ của học sinh lọc `hidden_at IS NULL` (hoặc 404 nếu vào thẳng id đã ẩn). Gia sư/admin list vẫn trả item đã ẩn kèm `hiddenAt` để khôi phục.

3. **Restrict, không SetNull, cho `ClassContentItem.topicId`.** Xoá Chủ đề / Chuyên đề / Bài học cấp khoá khi còn bất kỳ `ClassContentItem` nào (kể cả đã ẩn) → HTTP 409 `"… đang được N lớp sử dụng"` và không xoá gì. Restrict là invariant DB; guard ứng dụng cho message tiếng Việt. Không chọn SetNull: AC yêu cầu chặn xóa khi còn tham chiếu — SetNull sẽ để xóa Chuyên đề thành công và biến lần giao thành mồ côi.

4. **Restrict cho `Attempt.assignmentId`.** Lịch sử bài làm không bị xóa theo lần giao. `AttemptAnswer.questionId` vốn đã Restrict. `AttemptAnswer.attemptId` vẫn Cascade (câu trả lời thuộc về lượt làm).

5. **Không đổi** cascade nội bộ cây Kiến thức (`Lecture` → `Topic`, `QuestionLink` → `Topic`, `Topic` → `Chapter`) khi không còn `ClassContentItem` tham chiếu — xóa cấp khoá lúc đó chạy bình thường, không P2003 từ nhánh lớp/attempt.

## Considered options

- **SetNull `ClassContentItem.topicId`:** giữ row mồ côi + `(Chuyên đề đã xoá)`. Trái AC “DELETE khi còn tham chiếu → 409, không xoá gì”.
- **Soft-delete Topic/Chapter/Lecture:** ngoài phạm vi ticket; cây khoá vẫn xóa cứng khi không bị lớp dùng.

## Rollback

Migration `20260918000000_soft_hide_class_content`:

```sql
ALTER TABLE "attempts" DROP CONSTRAINT "attempts_assignment_id_fkey";
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "class_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_content_items" DROP CONSTRAINT "class_content_items_topic_id_fkey";
ALTER TABLE "class_content_items" ADD CONSTRAINT "class_content_items_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_timeline_items" DROP CONSTRAINT "class_timeline_items_hidden_by_staff_id_fkey";
DROP INDEX "class_timeline_items_hidden_by_staff_id_idx";
ALTER TABLE "class_timeline_items" DROP COLUMN "hidden_by_staff_id";
ALTER TABLE "class_timeline_items" DROP COLUMN "hidden_at";

ALTER TABLE "class_content_items" DROP CONSTRAINT "class_content_items_hidden_by_staff_id_fkey";
DROP INDEX "class_content_items_hidden_by_staff_id_idx";
ALTER TABLE "class_content_items" DROP COLUMN "hidden_by_staff_id";
ALTER TABLE "class_content_items" DROP COLUMN "hidden_at";
```

Cột ẩn chỉ chứa metadata; rollback không mất Attempt. Sau rollback, API ẩn/khôi phục không còn schema.

## Consequences

- Gia sư “xoá” = ẩn; Attempt/điểm chấm còn nguyên.
- Đội giáo án không xóa được nút cây khoá đang gắn lớp (kể cả lớp đã ẩn item).
- Nhãn `(Chuyên đề đã xoá)` chỉ còn cho `topicId` null sẵn (dữ liệu cũ), không phải kết quả xóa mới.
