# ADR: Hai định nghĩa "Học sinh mới" theo góc nhìn

- **Status:** Accepted
- **Date:** 2026-10-12

## Context

Admin cần đo học sinh mới **thực sự đem tiền về** (Báo cáo tháng, dashboard admin), còn CSKH cần thấy học sinh mới **được giao cho mình** ngay khi hồ sơ được tạo, kể cả trước khi phụ huynh nạp tiền. Một định nghĩa duy nhất làm sai một trong hai bên.

## Decision

- **Học sinh mới** (admin shell, Báo cáo tháng): tính theo ngày **nạp đầu tiên** rơi vào kỳ.
- **Học sinh mới đăng ký** (mọi khối CSKH trên `/staff`, kể cả Tổng hợp CSKH của trợ lí): tính theo ngày **tạo hồ sơ** học sinh rơi vào kỳ.
- Nhãn UI phía CSKH **vẫn là "Học sinh mới"**; hint định nghĩa trên từng shell phải nói rõ đang dùng định nghĩa nào.

## Considered options

- **Một định nghĩa nạp đầu cho cả hai:** CSKH không thấy học sinh chưa nạp, mất động lực chăm từ đầu.
- **Một định nghĩa ngày tạo cho cả hai:** báo cáo admin đếm cả hồ sơ ảo / chưa bao giờ học.
- **Đổi nhãn CSKH thành "Học sinh mới đăng ký":** rõ hơn nhưng người dùng muốn giữ nhãn quen thuộc.

## Consequences

- Cùng một tháng, số "Học sinh mới" admin thấy và CSKH thấy có thể khác nhau; đây là chủ ý, không phải lỗi.
- Code tính chỉ số phải gọi đúng hàm theo shell; không dùng chung một helper "new students" không tham số.
