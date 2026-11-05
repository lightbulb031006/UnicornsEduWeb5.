# Đồng bộ Tin vào Toán ngày 05/11/2026

Gộp 18 commit của `upstream/main` đến `dab3b08f` vào `main` Toán tại máy từ `707853e9`. Các nhóm chính gồm Bộ câu hỏi, nội dung và kết quả thực hành, nhận xét buổi học, học thử, báo cáo tháng, hồ sơ và thành tích nổi bật của gia sư.

## Cấu hình Toán

- Thêm `LMS_PROFILE=math` vào môi trường API khi chạy bản mới. Hồ sơ Toán giữ trắc nghiệm một đáp án, tự luận, điểm thang 100 chia đều và mục Kiểm tra trong buổi. Giữ workspace Giáo án học sinh giỏi.
- Giữ instance duy nhất `math`, cấu hình GHCR/Compose/nginx và kết nối Supabase được quản lý. Data stack self-host từ Tin là tài liệu và mã tham khảo cho IT/ENG/JP.
- Upload ảnh nội dung câu hỏi cần bucket private `question-images` trên Supabase của Toán.
- Giữ logo, biên lai và watermark Toán, nhãn Fanpage Toán, quyền thống kê buổi học và ngoại lệ kiểm tra lịch khi admin tạo buổi. Kết thúc lớp dùng hộp xác nhận có cảnh báo trợ cấp còn thiếu theo nghiệp vụ mới.
- Đổi tên báo cáo UniOJ từ `8:6.txt` sang `8-6.txt` để Windows checkout được. Blob nội dung giữ nguyên.

## Kiểm tra trước phát hành

29 migration mới được giữ nguyên theo lịch sử Git của Tin. Lượt đồng bộ này chỉ cập nhật mã nguồn trên máy. Chưa chạy migration hay rehearsal với bản sao database Toán.

- `20261025090000_reset_student_passwords` đặt lại mật khẩu của mọi tài khoản học sinh về một mật khẩu dùng chung. Preflight Toán dừng nếu migration còn chờ và có tài khoản học sinh, kể cả tài khoản do migration cũ dự kiến tạo. Cần xử lý riêng migration dữ liệu này và xác minh mật khẩu được giữ trước khi phát hành.
- `20261026100000_student_class_zero_tuition` chuyển cấu hình học phí riêng từ 0 kế thừa sang NULL và có nhánh hoàn tiền nhắm `test123`/`THPTQG 02`. Preflight dừng nếu cả hai đích tồn tại và migration còn chờ. Rehearsal phải đối chiếu ví, điểm danh và số bản ghi như quy trình hiện hành.
- `20261027090000_fix_schema_drift` thêm khoá ngoại cho mức độ khó của khoá học. Kiểm tra bản sao database trước khi phát hành để phát hiện dòng mồ côi hoặc constraint đã có do chỉnh tay.

## Sao lưu

- Nhánh trước khi đồng bộ `codex/backup-math-before-sync-20261105-707853e9`.
- Snapshot chỉnh sửa local `261f1b075c3ea59e425a14298ab0efc6cae35d3e`, nhãn `math-local-edits-before-upstream-sync-20261105-707853e9`.
