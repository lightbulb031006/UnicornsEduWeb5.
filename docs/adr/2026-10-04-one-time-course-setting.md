# ADR: Bán một lần là cài đặt của khoá, backfill thay ví theo buổi bằng một lần trừ gói

- **Status:** Accepted
- **Date:** 2026-10-04
- **Supersedes:** `docs/adr/2026-10-02-one-time-class-tuition.md`

## Context

ADR 2026-10-02 nhận diện lớp bán một lần qua tên khoá (`THPTQG`, `PREVOI`), chỉ dồn học phí trên điểm danh và giữ nguyên ví. Trên bản sao prod 2026-10-04, ba chỗ không khớp:

- Lớp THPTQG 02 nằm ở khoá Basic, nên migration cũ không đụng tới. Lớp vẫn bị trừ theo buổi, làm lệch lợi nhuận tháng.
- Ví học sinh vẫn kể các lần trừ theo buổi, trong khi học phí thật là cả gói ở buổi đầu.
- Không có chỗ nào trên UI để bật bán một lần cho khoá mới.

## Decision

- **Cờ của khoá:** thêm `courses.is_one_time`. Khoá bán một lần ép mọi lớp của nó, kể cả lớp tạo sau này, về `pricing_mode = one_time`. Lớp không tự chọn `one_time`.
- **Bật và tắt:**
  - Chỉ admin hoặc trợ lí được đổi cờ.
  - Chỉ bật được khi chưa lớp nào của khoá có điểm danh present/excused mang học phí > 0, và mọi lớp có Tổng gói > 0đ.
  - Tắt luôn được. Các lớp về `per_session` và không tính lại khoản đã trừ.
- **Đổi khoá của lớp:** chỉ sang khoá cùng chế độ, kể cả khi lớp chưa thu đồng nào.
- **Gói bắt buộc:** API chặn tạo/sửa lớp bán một lần có Tổng gói ≤ 0đ, và chặn bật cờ khi còn lớp chưa có gói. Học phí trừ là gói riêng của học sinh (0 coi như không có) nếu có, không thì gói của lớp. Sửa gói sau khi đã trừ không tính lại.
- **Backfill (migration `20261004000000_one_time_course_setting`):**
  - Chỉ lớp THPTQG 02 (`UNICL-c1f789b32e`, chuyển sang khoá THPTQG) và PREVOI 02 (`UNICL-dc32916487`), chọn theo id.
  - Chỉ học sinh `student_classes.status = active`. Học sinh nghỉ giữ nguyên lịch sử theo buổi.
  - Hai học sinh THPTQG 02 đăng ký chung (`UNIST-9b344d2867`, `UNIST-c17f8016fe`) được giảm: migration đặt gói riêng `custom_tuition_package_total = 1.440.000` (trước 1.600.000) trước khi tính gói.
  - Hoàn theo sổ ví, xoá hẳn mọi giao dịch trừ/hoàn học phí của lớp. Giao dịch được nhận ra qua `attendance.transaction_id` hoặc qua note đúng mẫu `Đóng học phí lớp <lớp> buổi học …` / `Hoàn trả số dư lớp <lớp> buổi học …`.
  - Ghi đúng một giao dịch `extend` bằng gói, `date`/`created_at` là buổi present/excused đầu tiên.
  - Số dư mới = số dư cũ + (đã trừ − đã hoàn) − gói, chấp nhận âm.
  - Điểm danh buổi đầu mang gói và link giao dịch mới; các buổi sau về 0, không link.

## Considered options

- **Giữ nhận diện theo tên khoá:** bị loại. THPTQG 02 nằm sai khoá nên lọt, và đổi tên khoá sẽ âm thầm đổi cách thu tiền.
- **Cờ trên từng lớp:** bị loại. Khoá là đơn vị bán, nên lớp cùng khoá phải thu cùng kiểu.
- **Ghi giao dịch bù (một dòng hoàn + một dòng trừ gói) thay vì xoá:** bị loại theo yêu cầu vận hành. Lịch sử ví của học sinh phải đọc như thể lớp luôn bán một lần. Bản dump prod trước deploy là bản lưu duy nhất của giao dịch cũ.
- **Hoàn theo tổng `attendance.tuition_fee`:** bị loại. Sửa buổi tạo giao dịch `repayment` mới mà link điểm danh chỉ giữ giao dịch cuối, nên điểm danh thiếu tiền thật đã trừ. Sổ ví mới là số đúng.
- **Cho đổi khoá khác chế độ khi lớp chưa thu:** bị loại để luật đơn giản, không phụ thuộc trạng thái thu.

## Consequences

- Doanh thu THPTQG 02 và PREVOI 02 dồn về tháng của buổi đầu (tháng 8 và 9/2026), nên lợi nhuận các tháng đó đổi.
- Hoa hồng trợ lí 3% và CSKH đọc `attendance.payroll_basis_tuition_fee`, nên giữ số cũ. Trợ cấp gia sư không đổi.
- Trên bản sao prod, bốn học sinh âm số dư sau backfill (PREVOI 02: 2, THPTQG 02: 2).
- Xoá giao dịch không có bản ghi đối soát trong DB. Phải dump prod ngay trước deploy và giữ bản đó.
- `attendance.transaction_id` là FK `ON DELETE CASCADE`. Migration gỡ link trước khi xoá giao dịch, để dòng điểm danh không bị xoá theo.
- Logic thu ở buổi mới giữ nguyên từ ADR cũ: thu ở dòng present/excused đầu tiên mang học phí > 0, khoá advisory lock theo lớp.
