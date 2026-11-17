import { StaffRole } from 'generated/enums';

/**
 * Staff role của **Trưởng phòng Sale & CSKH** (enum `sale_customer_care_head`;
 * trước #268 là Trợ lí, enum `assistant`). Mọi chỗ backend cần nói tới role này — decorator cho phép route,
 * check quyền, redaction, thuế/hoa hồng theo role — đều đi qua hằng số này, để
 * việc đổi tên enum (biên bản họp 12/11/2026, #268) chỉ sửa một chỗ. Có thể có nhiều
 * Trưởng phòng cùng lúc — không giả định duy nhất.
 */
export const SALE_CS_HEAD_ROLE = StaffRole.sale_customer_care_head;

/** Nhãn hiển thị của role (#268; tên cũ «Trợ lí» không dùng nữa). */
export const SALE_CS_HEAD_ROLE_LABEL = 'Trưởng phòng Sale & CSKH';

/**
 * Nhãn khoản hoa hồng 3% học phí trên nhóm CSKH mà Trưởng phòng quản lí (trước #268
 * gọi là «hoa hồng/phần chia trợ lí»). Dữ liệu vẫn nằm ở cột `attendance.assistant_*`.
 */
export const SALE_CS_HEAD_COMMISSION_LABEL = 'Hoa hồng trưởng phòng';

/** Nhân sự có mang role Trưởng phòng Sale & CSKH hay không. */
export function hasSaleCsHeadAccess(
  roles: readonly string[] | null | undefined,
): boolean {
  return roles?.includes(SALE_CS_HEAD_ROLE) ?? false;
}
