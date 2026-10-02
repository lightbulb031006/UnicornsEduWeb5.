# ADR: Separate StaffAchievement/StudentAchievement tables, not a shared polymorphic table

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Chuẩn hoá "Thành tích" từ 2 field sơ sài (`StaffInfo.personalAchievementLink`, `StaffInfo.specialization`) thành danh sách nhiều row, có ảnh minh chứng, dùng chung logic cho cả `StaffInfo` và `StudentInfo`. Vì Staff và Student cần đúng một bộ tính năng giống hệt nhau (title, ảnh, sortOrder, CRUD), một bảng `Achievement` dùng chung với cột `ownerType` + `ownerId` polymorphic trông hấp dẫn để tránh lặp code.

Toàn bộ schema hiện tại (`apps/api/prisma/schema/people.prisma`) không có tiền lệ polymorphic nào: `StaffInfo` và `StudentInfo` là hai model độc lập hoàn toàn, mọi quan hệ con (`StudentExamSchedule`, `ClassTeacher`, `CustomerCareService`, ...) đều dùng FK tường minh trỏ về đúng một model cha.

## Decision

Tạo hai model riêng biệt: `StaffAchievement` (FK `staffId → StaffInfo.id`) và `StudentAchievement` (FK `studentId → StudentInfo.id`). Không có bảng `Achievement` dùng chung, không có cột `ownerType`.

## Considered options

- **Polymorphic `Achievement(ownerType, ownerId)`**: giảm lặp code (1 bảng, 1 service). Bị loại vì Prisma không hỗ trợ polymorphic FK thật — `ownerId` sẽ không có ràng buộc khoá ngoại DB, mất tính toàn vẹn tham chiếu mà mọi quan hệ khác trong schema đang có. Cũng lệch hẳn convention hiện tại của codebase.
- **Hai model riêng, dùng chung service/controller logic ở tầng ứng dụng**: giữ FK thật cho từng bảng, chỉ tái sử dụng code (validation, upload ảnh, reorder) ở tầng service/UI component — chọn phương án này.

## Consequences

- Hai migration, hai bảng, hai bộ Prisma Client type — nhưng FK constraint thật, query/index rõ ràng, khớp pattern đọc schema hiện tại của team.
- Logic dùng chung (validate title, upload ảnh, reorder `sortOrder`) phải tái dùng ở tầng service/component thay vì tầng schema — component UI phải nhận owner type qua props thay vì suy ra từ 1 bảng chung.
