# ADR: Gộp năm nhóm nguồn khách thành "Người quen"

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Thống kê nguồn khách có bảy nguồn cộng dòng **Chưa gán**. Ngoài Tiktok và hai fanpage, các dòng còn lại (Giới thiệu từ người quen của khách, Nguồn riêng của bản thân, Khách cũ, Khác, Chưa gán) không được vận hành phân biệt; người xem chỉ cần biết khách đến từ kênh marketing nào hay từ quan hệ cá nhân.

## Decision

- Tập đóng **Nguồn khách** còn bốn giá trị: Tiktok, Fanpage Học Tin Cùng Chuyên Tin, Fanpage Luyện Tin THPT, **Người quen**.
- Gộp ở cấp domain, không chỉ khi hiển thị: học sinh đang mang một trong năm nhóm trên (kể cả chưa có nguồn) chuyển sang **Người quen**; form hồ sơ chỉ còn bốn lựa chọn; bỏ chú thích bắt buộc của **Khác**.
- Migration chép giá trị nguồn cũ và chú thích sang cột legacy chỉ lưu DB, không hiện UI.

## Considered options

- **Gộp hiển thị, giữ bảy giá trị trên hồ sơ:** đảo ngược được, nhưng CSKH vẫn phải chọn giữa các nhóm mà không ai dùng để phân biệt.
- **Gộp domain, xoá hẳn dữ liệu cũ:** gọn nhất nhưng mất vĩnh viễn chú thích của **Khác** và dấu `Nguồn cũ`.

## Consequences

- **Chưa gán** không còn tồn tại; mọi học sinh đều có nguồn.
- Thống kê kỳ đã qua tính lại theo nguồn mới (theo `2026-09-29-customer-source-follows-current-value.md`).
- Muốn tách lại nhóm nào thì đọc cột legacy; học sinh tạo sau khi gộp không có dữ liệu legacy.
