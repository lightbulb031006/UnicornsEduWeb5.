# Đồng bộ Tin vào Toán — 08/10/2026

## Phạm vi

Gộp `upstream/main` tại `52869056a2fc5ae76b962faef934f8dc10d4e0f3` vào local `main` của Toán, từ `5134e9d1`. Có ba commit mới (#175, #176, #177), 358 file upstream thay đổi và 10 migration mới so với mốc `451f60d`. Lượt đồng bộ đầu chỉ cập nhật nguồn tại máy. Sau đó người dùng yêu cầu triển khai lên website Toán để sử dụng tính năng CSKH tự tạo học sinh.

## Phát hành theo yêu cầu 08/10/2026

Triển khai qua workflow `Build and Deploy` của repo Toán, chỉ instance `math`. Preflight phải kiểm tra read-only các target Tin, lưu backup public trên VPS, khôi phục và thử migration trên PostgreSQL riêng, giữ checksum tài chính/ví trước khi áp dụng thật. Không seed hoặc tạo học sinh thật để thử.

Luồng CSKH đã đối chiếu với upstream: `/staff/customer-care-detail` có nút **Tạo học sinh**, API `POST /users/student` cho `customer_care`, tự gán CSKH tạo với % mặc định và chặn xếp lớp. Kiểm tra tập trung trước phát hành: 4 tests user service + 4 tests form pass. Các chỉnh sửa local có trước sync vẫn giữ ngoài release commit.

Trạng thái triển khai và kết quả kiểm tra public/database sẽ được ghi lại sau khi workflow hoàn tất.

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

- Merge commit local `056392f3`; `upstream/main` là ancestor của HEAD, không còn commit nguồn bị thiếu hay conflict marker.
- Prisma Client 7.2.0 tạo bằng script workspace; typecheck web/API và build Next.js/NestJS thành công. Next.js tạo đủ 77 trang trong bước build; chưa kiểm tra UI có đăng nhập.
- Backend: 105 suites / 1.220 tests pass. Sau chỉnh assertion để qua lint, chạy lại riêng tạo buổi: 17 tests pass (gồm admin bỏ kiểm tra lịch và staff vẫn kiểm tra, scale gia sư, học phí, noAttendance).
- Frontend sau khôi phục popup/test local: 41 suites / 288 tests pass. Lint hai trang lớp và popup/test thống kê, cùng service/spec tạo buổi pass.
- `node --test scripts/math-release-preflight.test.cjs`: 5 tests pass, mô phỏng các nhánh trùng tên/ID, chỉ migration cũ hơn còn chờ, không trùng, đã áp dụng, và giữ chốt legacy. Test chỉ dùng client PostgreSQL giả; chưa chạy rehearsal SQL/database thật.
- Các file Prisma schema/migration trong kết quả gộp có blob trùng upstream. Branding/mail/watermark, workflow, registry Math, Compose và script deploy/rehearsal không thay đổi so với nhánh trước sync.
- Tám file local ngoài AGENTS khớp SHA256 bản sao trước sync. AGENTS giữ nguyên phần local có sẵn, chỉ bổ sung quy tắc kiểm tra backfill học phí mới trong commit đồng bộ. Stash dự phòng vẫn được giữ.
