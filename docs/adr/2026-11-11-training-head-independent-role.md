# ADR: Trưởng Ban Đào Tạo là role độc lập (`training_head`)

## Context

Cần role **Trưởng Ban Đào Tạo**: có toàn bộ quyền truy cập như Ban Đào Tạo (`training`) và thêm quyền chỉnh role nhân sự (gia sư / chuyên môn / đào tạo). Hai cách:

1. `training_head` *kéo theo* `training` — người được gán luôn có cả hai role; mọi check `roles.includes('training')` giữ nguyên.
2. `training_head` *độc lập* — chỉ cần một role; mọi check quyền Ban Đào Tạo phải nhận cả hai.

## Decision

Chọn (2). `StaffRole.training_head` là enum riêng, không yêu cầu `training`.

- Mọi check *quyền* Ban Đào Tạo đi qua predicate chung `hasTrainingAccess` / `TRAINING_ACCESS_ROLES` (API `src/common/training-access.ts`, web `lib/training-access.ts`), được tách trước ở prefactor (#253).
- Check theo *thu nhập của role* (extra allowance tự quản, lương cứng mặc định, dòng «Công việc khác», trang chi tiết thu nhập) **không** đi qua predicate — `training_head` có dòng thu nhập riêng dưới role của chính mình, không có hoa hồng doanh thu.
- `RegulationAudience.staff_training_head` riêng; người có `training_head` cũng thấy quy định gửi `staff_training`.

## Consequences

- Một người không bị tính thu nhập/dòng role hai lần (nếu kéo theo `training` thì lương cứng / trợ cấp role sẽ nhân đôi hoặc phải loại trừ thủ công).
- Thêm role mới vào Ban Đào Tạo sau này chỉ cần sửa `TRAINING_ACCESS_ROLES`.
- Chi phí: check quyền viết thẳng `roles.includes('training')` sẽ âm thầm bỏ sót `training_head` — review code phải dùng `hasTrainingAccess` cho check quyền.
