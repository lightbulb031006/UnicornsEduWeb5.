# ADR: Trợ cấp sale nằm trên `extra_allowances`, gắn học sinh qua cột nullable

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

Thêm staff role `sale`. Sale tự ghi **Trợ cấp sale**: mỗi khoản gắn đúng một **Học sinh** (khách hàng sale đem về), có ghi chú bắt buộc, sale tự nhập số tiền, không qua duyệt, cùng cơ chế **trợ cấp tự quản** của kỹ thuật / truyền thông / đào tạo (`SELF_MANAGED_EXTRA_ALLOWANCE_ROLES`).

Payroll, **Thanh toán tất cả**, thuế theo role, **Công việc khác** và **Chi phí nhân sự** trên dashboard admin đều đã đọc `extra_allowances`. Một bảng riêng thì mọi aggregate đó phải cộng thêm một nguồn.

## Decision

1. **Không tạo bảng `sale_allowances`.** Trợ cấp sale là một dòng `extra_allowances` với `role_type = sale`.
2. **Thêm `extra_allowances.student_id` nullable**, FK `student_info.id` với `onDelete: SetNull`. Cột này chỉ có nghĩa với `role_type = sale`.
3. **Ràng buộc nằm ở service, không nằm ở schema:** `role_type = sale` thì bắt buộc `student_id` + `note` khác rỗng lúc tạo và lúc sửa, dù sale tự tạo hay admin / kế toán chi tạo thay. Role khác gửi `student_id` lên thì bị reject.
4. **Xoá học sinh không xoá khoản trợ cấp.** `SetNull` giữ chứng từ payroll, UI hiện "Học sinh đã xoá". Vì vậy `student_id` null trên dòng sale là trạng thái hợp lệ ở DB, ràng buộc ở mục 3 chỉ kiểm lúc ghi.
5. **Không có ràng buộc unique** trên `(student_id, month)` hay `(staff_id, student_id, month)`: cùng học sinh được nằm trên nhiều khoản, của một hay nhiều sale.

## Considered options

- **Bảng `sale_allowances` riêng**: schema sạch hơn (FK học sinh `NOT NULL` được), nhưng phải nhân đôi luồng thanh toán, thuế, bulk status, "Thanh toán tất cả" và mọi aggregate chi phí nhân sự.
- **CHECK constraint `role_type <> 'sale' OR student_id IS NOT NULL`**: xung đột với `SetNull` khi xoá học sinh (mục 4).
- **`onDelete: Cascade`**: mất khoản tiền đã trả theo học sinh. **`Restrict`**: chặn admin xoá học sinh chỉ vì còn một dòng trợ cấp.

## Consequences

- Đọc `extra_allowances` không được giả định `student_id` có giá trị, kể cả dòng sale.
- Cùng đợt này, guard **trợ cấp tự quản** áp cho cả 4 role: nhân sự sửa và xoá được khoản của mình khi chưa thanh toán; khoản `paid` khoá. Trước đó self-service sửa được cả dòng `paid` và không có xoá.
