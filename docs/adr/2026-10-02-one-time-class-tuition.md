# ADR: Lớp bán một lần ghi nhận doanh thu ở buổi đầu, không hoàn ví

- **Status:** Superseded by `docs/adr/2026-10-04-one-time-course-setting.md` (cờ chuyển sang khoá; backfill thay giao dịch ví theo buổi bằng một lần trừ gói)
- **Date:** 2026-10-02

## Context

Khoá `THPTQG` và `PREVOI` bán một lần, nhưng lớp đang tính `per_session`. Học phí trên điểm danh bị rải theo từng buổi, nên lợi nhuận dashboard cũng rải theo ngày buổi. Trên data vận hành, tổng học phí điểm danh không khớp từng giao dịch ví, và một phần trợ cấp trợ lí 3% đã `paid`/`pending` được tính từ học phí từng buổi.

## Decision

Thêm `ClassPricingMode.one_time`. Lớp của hai khoá này dùng chế độ đó. Với mỗi học sinh, toàn bộ học phí `present`/`excused` dồn vào buổi sớm nhất; các buổi sau và các dòng `absent` về 0. Số dư ví và giao dịch ví giữ nguyên. Trợ cấp gia sư từng buổi giữ nguyên. Mọi dòng present/excused của hai khoá lưu học phí cũ ở `payroll_basis_tuition_fee`, bất kể trạng thái thanh toán hoa hồng; hoa hồng trợ lí 3% và CSKH luôn đọc cột này khi có, nên không đổi khi doanh thu dồn đi. Buổi mới của học sinh đã có buổi tính phí thì học phí bằng 0. Học sinh chưa từng tính phí bị trừ tổng gói ở buổi đầu.

## Considered options

- **Hoàn ví về tổng gói đang lưu:** bị loại vì gói THPTQG đang là 300.000đ / 1 buổi, trùng học phí mỗi buổi, trong khi điểm danh đã ghi 18.300.000đ. Hoàn theo gói sẽ xoá doanh thu.
- **Chỉ bật cờ cho buổi tương lai:** bị loại vì lợi nhuận các kỳ đã qua vẫn rải theo buổi.
- **Dồn cả trợ cấp gia sư về buổi đầu:** bị loại vì gia sư đã dạy và đã được trả theo từng buổi.

## Consequences

- Lợi nhuận theo kỳ đổi ngày ghi nhận, không đổi tổng học phí `present`/`excused`.
- Sổ ví vẫn kể lại các lần trừ cũ. Đối soát ví với học phí buổi đầu sẽ lệch ở data lịch sử.
- Tắt `one_time` trên UI không tính lại học phí, để tránh đụng ví.
- "Buổi đầu" khác nhau giữa backfill và vận hành: backfill dồn về buổi có ngày sớm nhất; buổi mới thì gói rơi vào buổi đầu tiên **ghi nhận** dòng present/excused mang học phí > 0. Chỉ dòng mang tiền mới tính là "đã thu", nên sửa lại chính buổi đã thu không hoàn gói, và khi dòng đã thu bị xoá hoặc chuyển vắng thì buổi kế tiếp thu lại.
- Tạo/sửa buổi của lớp `one_time` lấy `pg_advisory_xact_lock` theo lớp, để hai thao tác đồng thời không cùng thấy "chưa thu".
- Gói học phí rỗng thì rơi về chuỗi giá theo buổi như lớp `per_session`.
- Chi tiết học sinh hiện tổng gói; chi tiết lớp hiện khoản sẽ thu ở buổi kế tiếp (0đ nếu học sinh đã bị thu).
