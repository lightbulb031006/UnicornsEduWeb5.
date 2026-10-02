# ADR: Cờ "không cần điểm danh" nằm ở Lớp, và lớp đó vẫn sinh bản ghi điểm danh, vẫn thu tiền đủ

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

PRD cho phép bỏ qua điểm danh với những lớp quá đông — điểm danh từng buổi cho vài chục tới trăm học sinh là không khả thi trên thực tế. Nhưng trong hệ thống này điểm danh không chỉ là thông tin chuyên cần: `Session.allowanceAmount` tính theo `snapshotPerStudentAllowance × số học sinh có mặt`, và học phí trừ ví học sinh phát sinh theo **từng dòng `Attendance`** (`Attendance.tuitionFee` liên kết `WalletTransactionsHistory`). Không có dòng `Attendance` nghĩa là gia sư nhận 0 đồng trợ cấp và trung tâm không thu được đồng học phí nào.

Bản nháp đầu đặt cờ này trên form tạo Buổi học do gia sư tick. Điều đó sai chủ thể: "lớp này đông quá nên không điểm danh" là quyết định vận hành ở cấp lớp, một lần cho cả khoá, không phải lựa chọn lặp lại mỗi buổi — và để gia sư tự tick là để người hưởng trợ cấp tự quyết định điều kiện tính trợ cấp của mình.

## Decision

1. Cờ "không cần điểm danh" là thuộc tính của **`Class`**, không phải của `Session`. Bật một lần, áp cho **mọi buổi** của lớp đó.
2. Chỉ **admin** và **trợ lí** (`assistant`) chỉnh được cờ này, trong tab Cài đặt của trang chi tiết lớp. Form tạo/sửa Buổi học **không** có lựa chọn này; gia sư chỉ thấy trạng thái hiện hành dưới dạng thông báo.
3. Lớp bật cờ vẫn ghi nhận **toàn bộ học sinh đang học là có mặt** ở mọi buổi: hệ thống tự sinh các dòng `Attendance` như bình thường, chỉ ẩn phần điểm danh khỏi giao diện tạo/xem buổi. Học phí thu đủ, trợ cấp gia sư tính theo **sĩ số lớp được snapshot vào chính buổi đó**, không đọc lại roster tại thời điểm xem báo cáo.

## Considered options

- **Cờ ở từng buổi, gia sư tự tick**: linh hoạt nhất theo chữ PRD ban đầu. Bị loại vì tick nhầm một ô là lệch tiền của một buổi, và vì nó đặt quyết định tài chính vào tay người thụ hưởng.
- **Buổi không điểm danh là buổi 0 đồng**: minh bạch nhất, nhưng biến tính năng tiện lợi cho lớp đông thành hình phạt tài chính — không ai bật.
- **Trả trợ cấp theo sĩ số nhưng không thu học phí**: hợp với buổi chữa bài/buổi bù miễn phí, nhưng biến mọi lớp tắt điểm danh thành chi phí của trung tâm mà không có công tắc riêng để kiểm soát.
- **Thêm một công tắc học phí độc lập với công tắc điểm danh**: kiểm soát đầy đủ nhất, bị loại vì hai công tắc gần nhau rất dễ đặt sai và hệ quả chỉ lộ ra ở kỳ tính lương.

## Consequences

- Trong DB sẽ có các dòng `Attendance` với `status = present` mà **không ai bấm** — người đọc sau chắc chắn sẽ thắc mắc. Cờ nằm ở `Class` nên truy nguyên được, và mọi báo cáo chuyên cần phải loại **toàn bộ lớp** này ra khỏi thống kê "tỉ lệ đi học", chứ không phải loại từng buổi.
- Bật cờ giữa chừng làm dữ liệu chuyên cần của lớp đứt đoạn: các buổi trước đó có điểm danh thật, các buổi sau thì không. Báo cáo phải xử lý được lớp có cả hai loại buổi.
- Học sinh vắng mặt trong một lớp tắt điểm danh vẫn bị trừ học phí. Đây là đánh đổi có chủ đích; CSKH cần biết để trả lời khiếu nại.
- Sĩ số được snapshot vào từng buổi nên báo cáo lương tháng trước không đổi số khi roster thay đổi.
