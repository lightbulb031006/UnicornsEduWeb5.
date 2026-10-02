# ADR: Mỗi Achievement row mang đúng 1 ảnh, không phải gallery nhiều ảnh

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Yêu cầu ban đầu cho hệ thống "Thành tích" (chuẩn hoá từ field text đơn sơ sài) là mỗi row cho phép "đính kèm ảnh minh chứng". Bàn thảo lúc đầu chốt mỗi row nhiều ảnh (tối đa 5), lưu ở bảng con `StaffAchievementImage`/`StudentAchievementImage` (FK tới achievement, có `sortOrder` riêng, hỗ trợ thêm/xoá từng ảnh độc lập) — để hỗ trợ trường hợp 1 thành tích có nhiều minh chứng (giấy khen + ảnh trao giải...).

Sau khi review lại, quyết định đổi hướng: mỗi Achievement chỉ cần hiển thị đúng 1 ảnh.

## Decision

Bỏ hẳn concept "nhiều ảnh/row" và bảng ảnh con. `StaffAchievement`/`StudentAchievement` có sẵn 1 cột `imagePath` (nullable) ngay trên row. Upload ảnh mới ghi đè ảnh cũ (`upsert: true`, cùng path) — y hệt pattern `uploadMyAvatar`/`deleteMyAvatar` đã có trong `apps/api/src/user/user.service.ts`. Không có sortOrder cho ảnh (chỉ row có `sortOrder`).

## Considered options

- **Nhiều ảnh/row qua bảng con** (phương án ban đầu): linh hoạt hơn cho thành tích có nhiều minh chứng, nhưng kéo theo bảng con, sortOrder ảnh, endpoint thêm/xoá ảnh lẻ, UI gallery — phức tạp hơn đáng kể cho lợi ích chưa chắc cần thiết ở giai đoạn này.
- **1 ảnh/row** (đã chọn): đơn giản hoá tối đa cả schema lẫn UX — tái dùng nguyên xi pattern avatar đã có sẵn và đã test, không cần thiết kế UI gallery/reorder-ảnh mới.

## Consequences

- Nếu sau này cần nhiều ảnh/row, đây là thay đổi schema có chi phí thật: cần thêm bảng con, migrate `imagePath` hiện có thành 1 row đầu tiên trong bảng ảnh mới, và build lại UI gallery — không phải việc bật lại một flag.
- Handoff doc/spec version trước (đề cập 5 ảnh/row, bảng ảnh con) đã lỗi thời so với quyết định này — đọc theo ADR này, không theo bản nháp cũ.
