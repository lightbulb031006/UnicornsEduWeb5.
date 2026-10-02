# Đồng bộ repo Tin vào web Toán — 02/10/2026

## Phạm vi

Tích hợp upstream/main tại 451f60d1537fad395a349ca0d126babf245f5665 vào bản Toán fa56472. Bước đầu chỉ đồng bộ mã nguồn tại máy. Sau yêu cầu xuất bản của người dùng, đã push và triển khai lên math.uniedu.vn ngày 03/10/2026, không chạy seed.

## Kết quả triển khai 03/10/2026

- GitHub Actions: [37037290547, attempt 4](https://github.com/lightbulb031006/UnicornsEduWeb5./actions/runs/37037290547) — build API, build web, mirror nginx và deploy đều success. Image ứng dụng từ commit `6e823e1a`; script vận hành từ `5527fe9a`.
- Backup schema public đã khôi phục được trên PostgreSQL 17 riêng: `/root/unicorns-math-predeploy-AIV8pr5X/public.dump`, kèm checksum và báo cáo trong cùng thư mục.
- Không có ID Tin bị trùng với học sinh Toán. Cả 53 migration đã thử thành công, sau đó áp dụng production; kiểm tra read-only xác nhận 0 migration chờ.
- Tạo thêm đúng ba tài khoản và ba hồ sơ thiếu theo dự báo hai migration backfill. Số lớp, buổi, điểm danh, giao dịch ví và tổng số dư giữ nguyên; checksum trường tài chính của điểm danh/giao dịch khớp trước và sau trên production.
- Healthcheck API, web và nginx pass; trang đăng nhập/API qua domain trả HTTP 200 và hash tệp web thay đổi so với bản cũ. Kiểm tra public không thay thế kiểm tra thao tác có đăng nhập bằng tài khoản người dùng.

## Các phần riêng của Toán

- Giữ biên lai Học Toán Cùng Chuyên Toán và logo_math_sm.png. Watermark ảnh public mới dùng cùng logo Toán.
- Giữ ngoại lệ kiểm tra lịch khi admin tạo buổi; tài khoản khác vẫn bị kiểm tra. Các quy tắc thời lượng/học phí theo block mới vẫn áp dụng.
- Giữ cấu hình deploy duy nhất math.uniedu.vn và github.token cho GHCR.
- Ghép lại thống kê buổi học theo tháng trên admin/staff class detail với timeline mới; nguồn dữ liệu dùng API tương ứng theo quyền.
- Nguồn khách hiển thị Fanpage Học Toán Cùng Chuyên Toán / Fanpage Luyện Toán THPT. Giữ mã enum fanpage_hoc_tin / fanpage_luyen_tin để tương thích migration gốc.
- Nhận xét điểm danh giới hạn 500 ký tự văn bản thuần, không tính thẻ HTML; giới hạn raw HTML tại DTO là 20.000 ký tự.
- Các thay đổi chưa commit trước đồng bộ được lưu dự phòng và khôi phục; không thay đổi thư mục .scratch/antigravity-cli-install.

## Database trước lần triển khai sau

Preflight dùng Compose để đọc `.env` đúng quy tắc của runtime; các container kiểm thử dùng digest bất biến của API vừa được pull, không khởi động Nest.

Chạy thử lần đầu đã qua 53 migration và phát hiện backfill tạo thêm tài khoản/hồ sơ đúng mục đích upstream. Preflight tính số lượng bổ sung dự kiến từ các điều kiện SQL của hai migration `20260822150000_backfill_student_user_accounts` và `20260904090000_backfill_student_info_for_student_users` trước khi chạy, rồi đối chiếu chính xác sau khi chạy. Các chỉ số khác phải giữ nguyên, bao gồm checksum trường tài chính của điểm danh và giao dịch ví. Không bỏ qua kiểm tra nếu số lượng thực tế không khớp.

Người dùng đã yêu cầu push và triển khai website. CD gọi `scripts/math-release-preflight.sh` trước `prisma migrate deploy`: đối chiếu các ID Tin bằng transaction read-only, lưu backup schema `public` (bao gồm lịch sử migration) trong thư mục riêng `/root/unicorns-math-predeploy-*`, rồi khôi phục và chạy thử toàn bộ migration trên PostgreSQL riêng không có mạng ngoài. Pipeline kiểm tra số học sinh, tài khoản, lớp, buổi, điểm danh, giao dịch ví và tổng số dư trước/sau bản sao. Lỗi hoặc khác biệt làm dừng rollout. File chứa thông tin kết nối tạm bị xoá khi kết thúc; backup và checksum được giữ lại với quyền riêng tư. Không chạy server API/cron trong bản sao.

Có 53 migration mới so với mốc đồng bộ dd5c6c3. Giữ nguyên lịch sử migration upstream; đã áp dụng ở môi trường Toán trong lượt triển khai nêu trên. Mỗi lần deploy vẫn cần backup database và kiểm tra read-only dữ liệu bị tác động.

Đặc biệt hai migration dữ liệu của Tin:

- 20260818120000_backfill_achievement_import_student_dates: đổi ngày tạo, ngày nghỉ và status thành inactive cho danh sách ID cụ thể.
- 20260818140000_remove_hallucinated_achievement_students: xoá danh sách 75 ID cụ thể khi còn cô lập.

Đối chiếu các ID trong hai file SQL với database Toán. Nếu có ID trùng, dừng rollout để xác minh; không cho migration này tự sửa học sinh Toán. Không sửa migration đã triển khai ở môi trường khác.

Các migration backfill tài khoản/hồ sơ, lịch hiệu lực, timeline, chuyển nội dung ba cấp và nguồn khách cũng thay đổi dữ liệu có sẵn. Kiểm tra trên bản sao database trước rollout. Chế độ block là opt-in; kiểm tra bảng giá giáo án theo độ khó trước sử dụng cho Toán.

## Khôi phục

Nhánh dự phòng: codex/backup-math-before-sync-20261002 (fa56472). Snapshot thay đổi local: stash có nhãn math-local-edits-before-upstream-sync-20261002. Bản sao file và manifest SHA256 nằm trong thư mục TEMP/unicorns-math-before-sync-20261002.

Không reset checkout đang có công việc chưa commit. Nếu cần quay lại, mở nhánh dự phòng trong một checkout riêng và khôi phục các file local từ snapshot.

## Kiểm tra đã hoàn tất

- Kiểm tra chuẩn bị triển khai phát hiện upstream gọi `ScheduleModule.forRoot()` hai lần; bỏ lời gọi dư để tránh đăng ký tác vụ định kỳ trùng và giữ cấu hình tắt cron trong test.
- pnpm install --frozen-lockfile; Prisma generate bằng script của workspace.
- Typecheck web/API pass; build Next.js 16.2.6 và NestJS pass.
- Backend: 91 suites / 1.008 tests pass; kiểm tra tập trung tạo buổi, nhận xét và UNIOJ: 52 tests pass.
- Frontend: 21 suites / 191 tests pass (gồm các test thống kê local có sẵn); lint các file xử lý xung đột và tuỳ biến Math pass.
- Không còn conflict marker. Tất cả file migration trong index có blob hash trùng upstream; cấu hình deploy Math có blob hash trùng nhánh dự phòng.
- Các chỉnh sửa thống kê/vitest và footer AGENTS có sẵn trước sync vẫn ở working tree, không gộp vào merge commit.
- Lượt triển khai sau đã thử migration trên bản sao, cập nhật production và xác minh healthcheck/public assets như ghi ở phần Kết quả triển khai. Chưa kiểm tra thao tác có đăng nhập bằng tài khoản người dùng.
