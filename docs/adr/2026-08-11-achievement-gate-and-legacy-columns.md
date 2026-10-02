# ADR: Achievement không còn nằm trong gate `staffProfileComplete`; cột cũ giữ deprecated chờ drop sau

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

`StaffInfo.personalAchievementLink` hiện là điều kiện bắt buộc trong `hasCompletedStaffProfile` (`apps/web/lib/staff-shell-access.ts`) và logic tương đương ở `apps/api/src/auth/auth-access.service.ts`: staff thiếu link này bị chặn vào `/staff/**`. Khi field 1-URL này bị thay bằng hệ thống `StaffAchievement` nhiều row (title + ảnh, có thể rỗng), không còn một giá trị đơn để check "đã điền hay chưa" theo đúng ngữ nghĩa cũ, và bắt buộc "phải có ≥ 1 thành tích" sẽ tạo ma sát onboarding không cần thiết cho một mục vốn chỉ mang tính giới thiệu.

Đồng thời, `personalAchievementLink` và `specialization` (mislabeled là "Thành tích chuyên môn" trên UI, thực chất là field môn giảng dạy) sẽ bị thay thế hoàn toàn về mặt UI, nhưng dữ liệu cũ trong DB không được backfill 1:1 sạch sẽ (URL không map được vào field ảnh; xem ADR ảnh 1-row/1-ảnh và ghi chú backfill trong handoff doc).

## Decision

1. Bỏ `personalAchievementLink` khỏi điều kiện `staffProfileComplete` ở cả hai nơi (`staff-shell-access.ts` và `auth-access.service.ts`) — Achievement trở thành mục tuỳ chọn, không chặn truy cập `/staff/**`.
2. Giữ nguyên cột `specialization` và `personal_achievement_link` trong `StaffInfo` sau khi hệ thống Achievement mới lên production — không `DROP COLUMN` ngay trong cùng migration. Ẩn khỏi mọi form/UI mới. Việc drop cột sẽ nằm ở một PR/migration riêng sau khi code mới đã chạy ổn định trên production.

## Considered options

- **Giữ gate, đổi điều kiện thành "≥ 1 StaffAchievement"**: giữ nguyên mức kiểm soát cũ nhưng ép staff phải tạo ít nhất 1 thành tích để vào được `/staff/**` — bị loại vì Achievement giờ là mục tự nguyện/giới thiệu, không phải hồ sơ pháp lý bắt buộc như CCCD.
- **Drop cột cũ ngay trong migration đầu**: đúng tinh thần "chuẩn hoá", tránh cột chết — bị loại vì rủi ro nếu code mới có lỗi cần rollback nhanh trong giai đoạn đầu sau deploy; giữ cột một thời gian là an toàn hơn và chi phí gần như bằng 0.

## Consequences

- Một khoảng thời gian (đến khi có PR drop cột) DB có 2 cột chết không dùng ở UI nào — người đọc migration sau này cần ADR này để hiểu tại sao chưa xoá ngay, tránh "tiện tay" xoá sớm khi chưa verify xong hoặc thắc mắc tại sao chưa dọn.
- Không còn cách nào ép buộc/khuyến khích staff khai báo thành tích qua gate — nếu sau này cần lại, phải thiết kế cơ chế nhắc nhở khác (banner, checklist) chứ không tái dùng `staffProfileComplete`.
