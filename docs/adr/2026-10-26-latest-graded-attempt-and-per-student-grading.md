# ADR: Điểm theo lượt đã chấm gần nhất, chấm trọn bài từng học sinh

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

Điểm của học sinh cho một tiết thực hành từng lấy **lượt cao điểm nhất đã chấm xong**, còn hàng đợi chấm tự luận lại chỉ chứa **lượt mới nhất**, chấm theo từng câu xuyên qua mọi học sinh. Hai quy tắc chỉ vào hai lượt khác nhau, và phía dạy không có chỗ xem trọn bài làm của một học sinh.

## Decision

1. **Điểm = lượt đã chấm xong gần nhất** (theo giờ nộp), áp cho điểm từng học sinh, điểm trung bình lớp và tỉ lệ đúng từng câu. Lượt còn câu tự luận chưa chấm bị bỏ qua (dùng lượt đã chấm trước đó). Làm lại có thể tụt điểm; lobby học sinh ghi rõ điều này.
2. **Chấm trọn bài của từng học sinh** trên màn Bài làm (chế độ Chấm điểm), thay cho hàng đợi chấm theo câu. Vẫn chỉ chấm được lượt mới nhất. Bảng Kết quả (lọc «Chờ chấm») là danh sách duy nhất để vào chấm; route `/grading/:assignmentId` chỉ còn chuyển hướng.

## Considered options

- **Giữ lượt cao điểm nhất:** học sinh không bao giờ bị tụt điểm khi làm lại, nhưng điểm hiển thị lệch với bài gia sư chấm và bài mở ra khi xem. Bị loại: người dùng muốn điểm phản ánh lần làm gần nhất.
- **Giữ cả hàng đợi theo câu lẫn chấm theo học sinh:** chấm một câu cho 30 em nhanh hơn, nhưng hai lối chấm, hai danh sách. Bị loại: người dùng chỉ muốn chấm trọn bài.

## Consequences

- Điểm của học sinh có thể giảm sau khi làm lại và được chấm.
- Bảng thống kê cũ đổi thành trang **Kết quả** có bộ lọc trạng thái; nút «Chấm bài» mở trang này với lọc «Chờ chấm».
