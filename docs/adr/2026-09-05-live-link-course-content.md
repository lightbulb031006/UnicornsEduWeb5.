# ADR: Nội dung khoá học dùng trong lớp là liên kết sống, không snapshot và không version

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

Khi gia sư import một Chuyên đề từ cấp Khoá học vào danh sách nội dung của lớp, có hai cách mô hình hoá: sao chép nội dung vào lớp (snapshot), hoặc trỏ thẳng tới bản ghi gốc (liên kết sống). Đội giáo án của một khoá sửa nội dung liên tục và cùng một chuyên đề có thể đang được dùng ở nhiều lớp đồng thời.

## Decision

`class_content_items.topic_id` trỏ thẳng tới bản ghi `topics` gốc ở cấp khoá. Không sao chép, không đánh version, không có bước duyệt/xuất bản. Đội giáo án sửa nội dung ở cấp khoá là mọi lớp đang dùng thấy ngay lập tức.

Ranh giới đi kèm quyết định này: **đề thuộc về khoá, lần giao thuộc về lớp**. Danh sách câu hỏi và điểm từng câu nằm trên `topics`/`question_links` (dùng chung, sống). Thời điểm mở bài và thời lượng làm bài nằm trên `class_content_items` (riêng từng lớp). `attempts` tham chiếu `class_content_item_id`, không tham chiếu `topic_id` — nhờ đó cùng một đề giao cho 5 lớp cho ra 5 khung giờ và 5 bảng thống kê độc lập.

## Considered options

- **Snapshot nội dung khi import**: lớp miễn nhiễm với thay đổi giữa chừng, nhưng sửa một lỗi sai trong đề phải đi sửa lại từng lớp, và mất luôn lý do tồn tại của kho nội dung dùng chung.
- **Version + duyệt**: an toàn nhất nhưng PRD mục 4 nói rõ không muốn bước duyệt, và chi phí xây dựng vượt xa giá trị ở quy mô hiện tại.

## Consequences

- Đội giáo án có thể sửa một Chuyên đề luyện tập trong khi học sinh ở lớp khác đang làm bài đó. **Lần giao vẫn liên kết sống**, nhưng **Bài làm** đóng băng đề lúc `start` (ADR `2026-09-07-attempt-exam-snapshot`): chấm không đọc `Question` live. `question_links.points` không còn là thang chấm Attempt.
- Xoá một câu hỏi khỏi Ngân hàng câu hỏi phải là soft delete; hard delete sẽ phá lịch sử bài làm ở mọi lớp.
- Không có cách nào để một lớp "đóng băng" bản nội dung mình đang dùng. Nếu nghiệp vụ sau này cần điều đó, đây là thay đổi lớn (thêm toàn bộ tầng snapshot), không phải chỉnh sửa nhỏ.
