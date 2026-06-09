# Domain Context

## Giáo án

- **Nhân sự thực hiện giáo án**: một hoặc nhiều staff được giao thực hiện một `lesson_task`. Đây là ngôn ngữ nghiệp vụ duy nhất cho điều phối nhân sự ở cấp task.
- **Nhân sự nhận thanh toán output**: staff đứng tên chi phí/thanh toán cho một `lesson_output`; không phải nhóm điều phối task.
- **Tài nguyên tổng giáo án**: tài nguyên tham chiếu dùng chung trong workspace giáo án, không nhất thiết gắn với một `lesson_task`; mọi nhân sự giáo án có thể xem, còn quyền sửa/xóa tài nguyên cá nhân dựa trên user đã tạo tài nguyên đó.
- Các cách gọi cũ như `người chịu trách nhiệm`, `nhân sự thực hiện task`, `nhân sự thực hiện output` không còn là ba nhóm phân công độc lập ở cấp task. Khi đọc data cũ, UI/API gộp các staff legacy này vào danh sách `Nhân sự thực hiện`; khi sửa task, backend ghi lại về `staff_lesson_task` và xóa `lesson_task.created_by`.

## Lớp và gia sư

- **Mã định danh hệ thống**: ID nội bộ hiển thị trong URL/API/QR cho hồ sơ học sinh, lớp và nhân sự. Định dạng hiện hành là `UNIST-[0-9a-f]{10}` cho học sinh, `UNICL-[0-9a-f]{10}` cho lớp, và `UNISTAFF-[0-9a-f]{10}` cho nhân sự; đây là định danh hệ thống, không phải mã tuyển sinh, mã kế toán hay giấy tờ cá nhân.
- **Kế toán chi**: staff role phụ trách các khoản phải trả và dòng chi outbound như trợ cấp, bonus, thanh toán nhân sự và chi phí vận hành; không phải kế toán tài chính chung và không bao gồm thu/top-up/học phí/lợi nhuận.
- **Lớp kết thúc**: lớp không còn vận hành lịch học, roster và phân công gia sư hiện tại. Trạng thái này là quyết định ở cấp lớp, khác với việc một gia sư riêng lẻ **nghỉ dạy theo lớp**.
- **Nghỉ dạy theo lớp**: trạng thái hiển thị khi gia sư không còn nằm trong phân công hiện tại của lớp, nhưng vẫn còn thu nhập/trợ cấp liên quan tới lớp trong kỳ hoặc snapshot chưa nhận. Trạng thái này không đồng nghĩa lớp đã kết thúc.

## Hồ sơ nhân sự

- **Thanh toán tất cả**: thao tác thanh toán một lần mọi khoản `pending/unpaid` của mọi role trên hồ sơ nhân sự, không giới hạn theo tháng đang xem trên UI; buổi ghi cọc vẫn thanh toán qua luồng cọc riêng.
- **Công việc khác (tổng hợp)**: breakdown thu nhập theo từng role ngoài giáo viên trên trang chi tiết nhân sự; **Tổng nhận** và **Đã nhận** phản ánh tháng đang chọn, **Chưa nhận** phản ánh toàn bộ khoản pending/unpaid hiện tại của role đó.
- **Trợ lí**: staff role `assistant` trên linked `staffInfo` còn `active`. Trợ lí là role vận hành admin-mirror gần tương đương admin trên `/admin/**` và `/staff/**`, trừ dashboard tổng admin và bước cộng tiền trực tiếp vào ví học sinh. Trợ lí được tạo `yêu cầu nạp thẳng` để admin duyệt và được rút/giảm số dư trực tiếp khi cần, nhưng không được tự duyệt queue hay tự nạp tiền vào ví.
- **Nhân sự ngừng hoạt động**: hồ sơ nhân sự không còn tham gia vận hành hiện tại hoặc nhận phân công mới, nhưng lịch sử công việc và thanh toán đã phát sinh vẫn được giữ lại. Trạng thái này không đồng nghĩa khóa tài khoản user.
- **Dân tộc nhân sự**: field `staff_info.ethnicity`, là thông tin định danh nhập tay trong hồ sơ nhân sự, không nằm trên hồ sơ user chung.
- **Giới tính nhân sự**: field `staff_info.gender`, dùng enum `Gender` chung (`male`, `female`) giống hồ sơ học viên.
- **Địa chỉ hiện tại của nhân sự**: field `staff_info.current_address`, là địa chỉ liên hệ hiện tại nhập tay trong hồ sơ nhân sự. Field này khác với `users.province`, vốn chỉ là tỉnh/thành phố cấp user.
- **Ảnh CCCD legacy**: hệ thống không còn nhận upload hoặc lưu path ảnh CCCD trong `staff_info`; object cũ trong bucket Supabase Storage `id-cards` nếu còn tồn tại chỉ là dữ liệu legacy và không được tự dọn bởi flow hồ sơ nhân sự.

## Quyền vận hành

- **Admin-mirror route**: route dưới `/admin/**` hoặc `/staff/**` reuse cùng business flow quản trị. Với policy hiện tại, `staff.assistant` được phép như admin trên hầu hết admin-mirror route, trừ các route bị deny tường minh bằng `AllowAssistantOnAdminRoutes(false)`.
- **Strict-admin route**: route hoặc mutation chỉ dành cho admin đầy đủ. Trong policy hiện tại, bước duyệt/queue nạp thẳng ví học sinh, cộng tiền thủ công trực tiếp vào ví, và dashboard tổng admin vẫn là strict-admin ngay cả khi trợ lí thấy các mirror workspace khác.

## Hồ sơ học sinh

- **Học sinh nghỉ học**: hồ sơ học sinh không còn tham gia vận hành lớp hiện tại hoặc được thêm vào lớp mới, nhưng lịch sử học tập, ví và công nợ đã phát sinh vẫn được giữ lại. Trạng thái này không đồng nghĩa khóa tài khoản user.

## Lịch học và Google Calendar

- **Lịch học hệ thống**: lịch học chính thức của lớp được lưu trong hệ thống; đây là nguồn sự thật cho lịch định kỳ của lớp.
- **Lịch cố định**: cách gọi vận hành của các slot định kỳ trong **lịch học hệ thống** (`Class.schedule`), gồm thứ, giờ bắt đầu/kết thúc và gia sư chịu trách nhiệm.
- **Lịch bù**: các buổi học một lần trong `makeup_schedule_events`; khi dùng để bù một buổi cố định bị lỡ, record phải giữ `baselineScheduleEntryId` và `originalDate` để biết buổi gốc nào đã được xếp bù.
- **Cảnh báo chưa dạy**: cảnh báo động cho một buổi thuộc **lịch cố định** đã quá giờ học + 3 tiếng nhưng chưa có buổi dạy thực tế khớp trong ±3 tiếng và chưa có **lịch bù** gắn cùng `baselineScheduleEntryId` + `originalDate`; chỉ hiển thị các cảnh báo có `originalDate >= 2026-06-01`.
- **Bản chiếu Google Calendar**: event Google Calendar được tạo từ lịch học hệ thống để nhắc lịch và mở lớp; không phải nguồn sự thật khi có sai khác.
- **Đồng bộ lại lịch học**: thao tác tạo, cập nhật hoặc xoá các bản chiếu Google Calendar để khớp lại với lịch học hệ thống.
- Mỗi slot trong **lịch học hệ thống** có thể có một **bản chiếu Google Calendar** dạng recurring event.
- Khi **lịch học hệ thống** và **bản chiếu Google Calendar** lệch nhau, **đồng bộ lại lịch học** phải giữ nguyên dữ liệu hệ thống và sửa Google Calendar theo dữ liệu hệ thống.

## Ví học sinh

- **Nạp ví qua QR tĩnh SePay**: phụ huynh/học sinh quét QR riêng của học sinh và chuyển khoản số tiền muốn nạp. Giao dịch ngân hàng được coi là nạp ví khi nội dung chuyển khoản nhận diện đúng học sinh và tiền đi vào đúng tài khoản nhận SePay chính thức.
- **Tài khoản nhận SePay**: tài khoản ngân hàng chính thức của Unicorns Edu dùng để nhận tiền nạp ví tự động. Giao dịch vào tài khoản khác không được cộng ví tự động, kể cả khi nội dung chuyển khoản có mã học sinh.
- **Yêu cầu nạp thẳng**: thao tác do CSKH, trợ lí, hoặc admin tạo khi cần ghi nhận tiền vào ví học sinh ngoài luồng QR/webhook. Yêu cầu không làm đổi số dư ngay và chỉ cộng ví sau bước duyệt/confirm của admin.
- Mỗi yêu cầu nạp thẳng gồm `student_id`, số tiền VND nguyên dương và lý do đối soát. Backend gửi email React Email tới `ADMIN_EMAIL`; `ADMIN_EMAIL` phải là mailbox thật, và production `FRONTEND_URL` phải là origin public HTTPS để tạo link duyệt.
- Admin mở link trong email để xem trang xác nhận public. Link dùng token chỉ lưu dạng hash trong DB, hết hạn sau 14 ngày và chỉ cộng ví sau khi admin bấm nút xác nhận cuối cùng trên trang.
- Khi duyệt thành công, hệ thống tạo `wallet_transactions_history` loại `topup`, tăng `student_info.account_balance`, liên kết request với transaction và ghi action history cho hồ sơ học sinh.
