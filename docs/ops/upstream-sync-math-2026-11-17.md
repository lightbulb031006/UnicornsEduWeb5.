# Đồng bộ Tin vào Toán ngày 17/11/2026

Gộp 16 commit của `upstream/main`, từ sau `dab3b08f` đến `e3adf5ad`, vào `main` Toán tại máy. Lần đồng bộ này cập nhật mã nguồn local; chưa push GitHub, deploy VPS hoặc chạy migration production.

## Backup

- Tip Toán trước merge: `16e3ec49`.
- Nhánh backup: `codex/backup-math-before-sync-20261117-16e3ec49`.
- Snapshot thay đổi local chưa commit: stash `math-local-edits-before-upstream-sync-20261117-16e3ec49`.

## Phạm vi chính từ Tin

- Tái cấu trúc role theo biên bản 12/11: Trưởng ban Đào tạo độc lập, bỏ role Kế toán chung, đổi Trợ lí thành Trưởng phòng Sale & CSKH và siết quyền admin.
- Dashboard/thống kê: sửa biến động học sinh thử nghỉ, thêm thống kê học sinh theo kỳ và lợi nhuận khoá, thêm hoa hồng Trưởng ban Chuyên môn vào chi phí.
- Lớp/buổi học: mức trợ cấp theo buổi chính xác, role trưởng quản lý lớp/buổi, chốt gói lớp bán một lần, cảnh báo chưa dạy thử.
- Hồ sơ/tài khoản: đổi tên đăng nhập, xác thực email học sinh, thiết bị đăng nhập sau cùng thắng, hồ sơ nhân sự dùng chung cho các role trưởng.
- Khoá học/giáo án/video: mọi role thấy danh sách khoá nhưng nội dung vẫn phân quyền, form lesson output theo hạng mục, tiến trình xử lý video bảo vệ.

## Phần giữ riêng cho Toán

- `LMS_PROFILE=math`, câu một đáp án + tự luận, thang 100 chia đều và mục Kiểm tra trong buổi.
- Workspace Giáo án học sinh giỏi và các dòng chi phí giáo án tiếp tục bật cho IT và Toán.
- Thương hiệu biên lai/email, logo Toán, cấu hình Supabase managed và bucket `question-images`.
- Registry/pipeline một instance `math`, kiến trúc amd64, `github.token` cho GHCR và preflight backup/rehearsal riêng; không nhận cấu hình deploy ARM multi-instance IT/ENG/JP của upstream.
- Giới hạn ghi chú điểm danh theo văn bản thuần 500 ký tự và hộp `ConfirmDialog` khi chuyển học sinh sang nghỉ.
- Chữ ký nhận xét Zalo profile Toán: `— Gia sư Học Toán Cùng Chuyên Toán`.

## 8 migration mới cần kiểm tra trước phát hành

1. `20261105090000_user_devices_superseded_at`: thêm cột thời điểm thu hồi thiết bị.
2. `20261106090000_class_teacher_custom_allowance_per_session`: thêm cột và backfill mức trợ cấp theo buổi từ lịch lớp; cần đối chiếu số tiền trước/sau trên bản sao Math.
3. `20261111090000_training_head_role`: thêm enum Trưởng ban Đào tạo.
4. `20261112090000_remove_accountant_staff_role`: dừng nếu còn bất kỳ dữ liệu enum `accountant`; phải kiểm tra read-only và quyết định mapping trước deploy.
5. `20261112100000_rename_assistant_to_sale_customer_care_head`: đổi enum tại chỗ, cần kiểm tra các role/lương/thuế hiện có của Toán.
6. `20261116090000_lock_one_time_student_packages`: backfill gói riêng cho học sinh active trong lớp bán một lần; đây là migration dữ liệu tài chính.
7. `20261116100000_derive_one_time_locked_per_session`: suy ra học phí/buổi từ gói đã chốt; cần đối chiếu digest học phí.
8. `20261116120000_trial_teaching_warning_dismissals`: tạo bảng cảnh báo dạy thử.

Preflight Toán hiện vẫn phải chặn các migration nguy hiểm đã ghi trong runbook 05/11. Trước release kế tiếp, mở rộng rehearsal/digest cho migration trợ cấp theo buổi, hai migration gói bán một lần và hai migration role; tuyệt đối không bỏ qua preflight.

## Dashboard production

Ngày 17/11, kiểm tra trực tiếp `GET /api/dashboard?month=11&year=2026&alertLimit=6&topClassLimit=5` trên `math.uniedu.vn` xác nhận API trả HTTP 500; đây là lỗi backend, không phải lỗi render frontend. Máy local không có `apps/api/.env`, và alias SSH VPS không khả dụng trong phiên này nên chưa đọc được stack trace production. Bản sync có các sửa dashboard mới và đã qua test local, nhưng chưa được xem là đã sửa production cho tới khi chạy preflight, deploy có kiểm soát và xác minh endpoint trả 200.

## Kiểm tra local

- `pnpm --filter api check-types`: đạt.
- `pnpm --filter web exec tsc --noEmit`: đạt.
- Jest `dashboard.service`, `lms-profile`, `session-validation`: 93/93 test đạt.
- Vitest `session-comment-zalo.helpers`: 28/28 test đạt.
- Đã rà UI thay đổi theo Web Interface Guidelines; thay hai `window.confirm` mới ở trang chi tiết lớp bằng `ConfirmDialog` dùng chung.

## Trước khi phát hành

1. Đọc log API đúng thời điểm gọi `/dashboard` để xác định câu SQL/schema gây 500 hiện tại.
2. Chạy read-only impact check trên database Toán cho 8 migration mới và các migration còn chờ từ 05/11.
3. Cập nhật `scripts/math-release-preflight.*`, backup production và rehearsal toàn bộ migration trên PostgreSQL disposable.
4. Chỉ khi rehearsal/digest đạt mới push/deploy; sau deploy xác minh dashboard, đăng nhập, biên lai, Storage và role matrix Toán.
