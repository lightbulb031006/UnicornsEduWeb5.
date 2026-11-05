# ADR: Học thử là trạng thái điểm danh từng học sinh, thu bù gấp đôi ở buổi kế tiếp

- **Status:** Accepted
- **Date:** 2026-10-12

## Context

Trước đây "Dạy thử" là toggle cấp buổi (`coefficient = 0`): cả buổi không trừ ví ai, gia sư không có trợ cấp. Thực tế học thử là chuyện của **một học sinh** trong lớp đang chạy, các học sinh khác vẫn học bình thường. Trung tâm muốn học thử miễn phí nếu học sinh không theo, còn nếu học tiếp thì thu lại buổi thử.

## Decision

1. **Gỡ toggle Dạy thử cấp buổi.** Thêm trạng thái điểm danh thứ tư `trial` (Học thử) cho từng học sinh.
2. **Học thử:** không trừ ví, không tính vào sĩ số trợ cấp, không truy lĩnh trợ cấp cho gia sư về sau.
3. **Thu bù:** buổi `present`/`excused` đầu tiên sau buổi thử, trên cùng lớp, trừ **gấp đôi** học phí của chính buổi đó. Lịch sử ví ghi **2 dòng `extend` riêng**; dòng thứ hai ghi rõ là thu bù học thử kèm ngày buổi thử. Doanh thu và hoa hồng tính cả hai lần, ghi vào ngày buổi thu bù, không tách nhãn trên dashboard. Buổi vắng không kích hoạt thu bù.
4. **Thu bù dời theo buổi:** xoá buổi thu bù hoặc sửa học sinh thành vắng thì hoàn cả hai lần và thu bù chuyển sang buổi kế tiếp đủ điều kiện. Xoá buổi thử hoặc bỏ trạng thái học thử thì hoàn lần thu bù.
5. **Giới hạn:** mỗi học sinh tối đa một lần học thử trên mỗi lớp, chỉ khi chưa từng học chính thức (`present`/`excused`, kể cả buổi học phí 0đ) hoặc bị thu học phí trên lớp đó ở buổi trước. Lớp bán một lần không có học thử.

## Considered options

- **Giữ toggle cấp buổi:** đơn giản nhưng sai mô hình; buổi có một học sinh thử thì cả lớp được miễn phí.
- **Truy thu ngay lúc học sinh đăng ký học tiếp** (giao dịch độc lập, không gắn buổi): tách bạch hơn nhưng không có mốc tự nhiên để kích hoạt và khó hoàn khi buổi bị sửa.
- **Một dòng `extend` gộp 2× học phí:** gọn nhưng phụ huynh không thấy được khoản thu bù trong lịch sử ví.
- **Không hoàn tiền / không dời thu bù khi sửa buổi:** dễ code nhưng ví lệch khi điểm danh bị sửa.

## Consequences

- Thêm giá trị enum `AttendanceStatus` → migration và mọi chỗ đếm sĩ số / tính học phí phải xử lý `trial`.
- Logic sửa/xoá buổi phải tìm lại "buổi thu bù hiện hành" của từng cặp học sinh–lớp, không chỉ hoàn tiền buổi bị sửa.
- Dữ liệu buổi Dạy thử cũ (`coefficient = 0`) giữ nguyên; không chuyển đổi về trạng thái `trial`.
