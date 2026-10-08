# Đồng bộ Tin vào Toán — 08/10/2026

## Phạm vi

Gộp `upstream/main` tại `52869056a2fc5ae76b962faef934f8dc10d4e0f3` vào local `main` của Toán, từ `5134e9d1`. Có ba commit mới (#175, #176, #177), 358 file upstream thay đổi và 10 migration mới so với mốc `451f60d`. Chỉ đồng bộ nguồn; chưa push hoặc triển khai, chưa chạy migration/seed hay khởi động API trên database thật.

Các nhóm chính: quản lý chuyên đề của lớp và hai tab Buổi học/Chuyên đề; học phí bán một lần; Ban Đào Tạo tra cứu gia sư; trợ cấp/scale riêng; hồ sơ/thành tích, nguồn khách cũ và lý do nghỉ; khảo sát và thông báo theo quyền; giao diện lớp/học sinh; nhập và hiển thị LaTeX.

## Giữ các phần riêng của Toán

- Biên lai Học Toán Cùng Chuyên Toán, logo Toán và watermark; nhãn nguồn khách Toán, giữ mã enum gốc.
- Admin bỏ kiểm tra lịch khai báo khi tạo buổi học; staff và người không có actor vẫn phải kiểm tra. Trợ cấp scale riêng và học phí một lần theo upstream.
- Popup Thống kê buổi học đặt trong tab Buổi học ở cả admin/staff; giữ quyền xem admin/trợ lí/CSKH và API theo scope.
- Cấu hình deploy Math và preflight backup/rehearsal; chỉ một `ScheduleModule.forRoot()`.
- Chỉnh sửa chưa commit có trước sync được sao lưu riêng rồi khôi phục, không đưa vào merge commit.
- Theo quy tắc UI của repo, các xác nhận kết thúc lớp/cho học sinh nghỉ học trên trang lớp dùng `ConfirmDialog` thay confirm/prompt trình duyệt; giữ lý do kết thúc lớp tuỳ chọn. Route staff dùng lại trang admin nhận cùng hành vi.

## Migration trước lần triển khai tiếp theo

Giữ nguyên lịch sử migration nguồn. Chưa kiểm tra tác động trên database Math thật trong lượt đồng bộ này.

- `20261002100000_backfill_one_time_course_tuition` nhận diện khoá bằng tên `THPTQG`/`PREVOI`, dồn học phí vào buổi đầu và đóng băng cơ sở hoa hồng.
- `20261004000000_one_time_course_setting` bật cờ bán một lần theo tên khoá; nhắm các lớp `UNICL-c1f789b32e` / `UNICL-dc32916487` và học sinh `UNIST-9b344d2867` / `UNIST-c17f8016fe`. Migration có xoá/ghi lại giao dịch ví và cập nhật số dư của học sinh active thuộc các lớp đích.
- Math preflight kiểm tra các tên/ID trên trong transaction read-only khi một trong hai migration đang chờ. Có trùng thì dừng để đánh giá tác động, không tự sửa migration đã dùng ở Tin. Giữ các kiểm tra ID Tin cũ và checksum tài chính/ví, backup public, rehearsal PostgreSQL riêng trước migrate deploy.
- `20261002120000_add_class_modules` thêm chuyên đề cho lớp có tiết lý thuyết, archive tiết riêng lớp. `20261005120000_class_module_order_and_hidden_reason` bỏ thứ tự timeline thủ công, giữ thứ tự chuyên đề theo lớp và ẩn lần giao của chuyên đề đã gỡ. Cần kiểm tra trên bản sao dữ liệu Toán trước phát hành.
- Ảnh bìa cần bucket Supabase private `class-covers` (theo docs nguồn). Chưa tạo bucket trong lượt này.

## Sao lưu và khôi phục

- Nhánh trước sync: `codex/backup-math-before-sync-20261008-095926` (`5134e9d1`).
- Snapshot local: stash `88ee41046b3ca64b5b3824fb405e970e8d0d8a1d`, nhãn `math-local-edits-before-upstream-sync-20261008-095926`.
- Bản sao chín file, patch và manifest SHA256: thư mục TEMP `unicorns-math-before-sync-20261008-095926`.
- Muốn đối chiếu bản cũ: mở nhánh dự phòng ở checkout riêng; không reset working tree chứa công việc chưa commit.

## Kiểm tra

Kết quả kiểm tra được bổ sung sau khi hoàn tất gộp và khôi phục các chỉnh sửa local.
