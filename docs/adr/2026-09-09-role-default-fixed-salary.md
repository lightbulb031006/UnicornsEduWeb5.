# ADR: Hai chính sách độc lập — mức lương cứng vs % vận hành lương cứng theo role

- **Status:** Accepted (supersedes combined-row design from ticket 02)
- **Date:** 2026-09-09
- **Ticket:** 02b (staff-fixed-salary)

## Context

Cần cấu hình **lương cứng** mặc định cho đủ 12 `StaffRole`, kèm **% khấu trừ vận hành lương cứng**. Hệ thống đã có `extra_allowances` (khoản trợ cấp thêm theo staff/tháng, có `PaymentStatus`) và `% vận hành` gia sư trên `class_teachers.tax_rate_percent`. Nếu nhồi lương cứng vào `extra_allowances` thì lẫn cấu hình mặc định với khoản phải trả.

Ticket 02 gộp hai giá trị vào **một** row `role_fixed_salary_defaults` (`amount` + `operating_rate_percent`). Khi cần “nhân sự lấy mức lương mặc định của role nhưng % vận hành riêng” (override ticket sau), đè một trục trên row gộp bắt buộc phải chép cứng trục kia — mức lương của người đó đứng yên khi mặc định role đổi.

## Decision

1. **Hai bảng / hai chính sách độc lập.** `role_fixed_salary_defaults` chỉ lưu `amount`. `role_fixed_salary_operating_rate_defaults` chỉ lưu `rate_percent`. Mỗi bảng một row / `StaffRole`. Null hoặc không có row = chưa cấu hình; `0` / `0%` là giá trị đã đặt. Xoá một trục không xoá trục kia.
2. **Không tái dùng `extra_allowances`.** Extra allowance vẫn là khoản phát sinh theo người/tháng. Lương cứng mặc định là cấu hình hệ thống; sinh khoản phải trả là ticket sau.
3. **% vận hành lương cứng không đọc/ghi `% vận hành` theo lớp.** Trợ cấp buổi học (`sessions.allowance_amount`, `class_teachers.tax_rate_percent`) không đổi khi lưu tab này.
4. **% thuế không tạo mới.** Lương cứng (khi có khoản phải trả) sẽ resolve thuế theo `role_tax_deduction_rates` / `staff_tax_deduction_overrides` đã có.
5. **Mặc định theo role áp cho mọi nhân sự đang hoạt động** mang role đó. Override theo người (ticket 03) đè **từng trục** trên `staff_fixed_salary_overrides` / `staff_fixed_salary_operating_rate_overrides` — có row thì dùng số đè (0 hợp lệ), không row thì bám mặc định role. Không snapshot cả cặp. Audit `action_history`.
6. **Migration ticket 02 chưa áp DB nào** — sửa migration `20260909210000_add_role_fixed_salary_defaults` tại chỗ thành hai bảng, không chồng migration vá.

## Considered options

- Giữ một bảng hai cột — không biểu diễn được override một trục mà vẫn bám mặc định trục còn lại.
- Tái dùng `extra_allowances` với `staff_id` giả / tháng `0000-00` — phá invariant khoản thanh toán.
- Cột trên `staff_info` — không scale 12 role, nhân sự dual-role không có một mức/role.
- Effective-dated history giống thuế — quá nặng cho cấu hình hiện hành; `action_history` đủ cho audit.

## Consequences

- API tách: `GET/PUT /fixed-salary-settings/role-defaults` (amount) và `GET/PUT /fixed-salary-settings/role-operating-rates` (percent). Admin + assistant qua `@Roles(admin)`.
- UI tab **Lương cứng** vẫn một tab. Từ 2026-09-10 hai nhóm role gộp thành **một bảng 3 cột** (Role / mức lương / % vận hành) với hai API tách. Từ 2026-09-16 **một nút Lưu chính sách** gọi lần lượt hai PUT; toast phản ánh đúng trục đã lưu khi một lệnh hỏng, draft trục lỗi được giữ. Từ 2026-09-15 **mức đè theo nhân sự** nằm trong dialog **Chỉnh sửa thông tin nhân sự** (`PATCH /staff/:id/with-fixed-salary-overrides` ghi role rồi override trong một transaction); tab settings chỉ còn chính sách theo role + chốt tháng. PUT từng trục `/staff-overrides/*` giữ cho cấu hình lương chung. Tắt vai trò đang có mức đè hỏi `ConfirmDialog` với đúng số hai trục; xác nhận xóa override kèm role trong cùng transaction; `action_history` ghi vai trò bị tắt; khoản tháng đã chốt không đổi. Từ 2026-09-16 dialog gom lương cứng + % vận hành **một dòng ngang** mỗi vai trò; **`teacher` không còn ăn lương cứng** (trợ cấp buổi học giữ nguyên) — `FIXED_SALARY_STAFF_ROLES` dùng chung lúc đọc cấu hình và lúc chốt tháng; migration `20260916100000_remove_teacher_fixed_salary_config` xoá dòng `teacher` ở hai bảng cấu hình, không đụng `staff_fixed_salary_payables`. Cron 01:00 ngày 28 bỏ qua cả tháng nếu đã có khoản (chốt sớm); `POST /close-month` thủ công vẫn chạy.
- Ticket sau đọc từng bảng khi resolve lương cứng / % vận hành, không đọc extra allowance.
