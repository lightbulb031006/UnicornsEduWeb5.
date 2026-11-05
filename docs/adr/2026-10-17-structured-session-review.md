# ADR: Nhận xét buổi học có cấu trúc, buổi cũ giữ format tự do

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Nhận xét buổi học gửi phụ huynh qua Zalo cần theo một template thống nhất (tiến độ, kiểm tra, điểm tốt, cần cải thiện, chất lượng BTVN, buổi sau…). Mô hình cũ chỉ có một ô rich text tự do mỗi học sinh (`attendance.notes`), không ép được format, không tính được % kiểm tra, không thống kê được.

## Decision

- Thay ô nhận xét tự do bằng các field có cấu trúc. Phần **chung buổi** lưu trên `sessions` (tiến độ, kiểm tra trong buổi, hạn BTVN, buổi sau, kiểm tra lại); phần **từng học sinh** lưu trên `attendance` (kết quả kiểm tra, điểm tốt, cần cải thiện, chất lượng BTVN + nhận xét).
- Cờ "có kiểm tra" ở **cấp buổi**: cả lớp làm chung một đề, nội dung và tổng số câu nhập một lần.
- Khối copy Zalo là **một tin cho cả lớp**: phần chung in một lần, sau đó từng học sinh.
- **Không migrate** `attendance.notes`. Buổi cũ (chưa có field mới) hiển thị và copy theo format cũ; mở sửa buổi cũ thì phải nhập đủ field mới.

## Considered options

- **Chỉ đổi format copy, giữ ô tự do:** rẻ nhưng không ép được template.
- **Migrate `notes` vào "Điểm tốt":** một format duy nhất nhưng gắn sai nghĩa cho dữ liệu cũ.
- **Cờ kiểm tra theo từng học sinh:** linh hoạt khi đề khác nhau nhưng gõ lặp N lần.

## Consequences

- Code hiển thị/copy phải phân nhánh buổi legacy vs buổi có cấu trúc (dựa vào `sessions.progress_status` có giá trị hay không).
- `attendance.notes` không còn ô nhập trên UI nhưng vẫn được đọc cho buổi cũ.
