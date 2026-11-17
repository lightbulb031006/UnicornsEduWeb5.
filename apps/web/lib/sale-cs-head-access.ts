/**
 * Staff role của **Trưởng phòng Sale & CSKH** (giá trị `sale_customer_care_head`;
 * trước #268 là Trợ lí, giá trị `assistant`), khớp `SALE_CS_HEAD_ROLE` ở backend. Mọi check quyền trên web
 * (shell, menu, nút, cột) đi qua đây để việc đổi tên enum (biên bản họp
 * 12/11/2026) chỉ sửa một chỗ.
 *
 * Danh sách liệt kê toàn bộ role (type union trong `dtos/`, nhãn role, option
 * chọn role) vẫn ghi giá trị trực tiếp — TypeScript sẽ báo khi enum đổi tên.
 */
export const SALE_CS_HEAD_ROLE = "sale_customer_care_head" as const;

export function hasSaleCsHeadAccess(
  staffRoles: readonly string[] | null | undefined,
): boolean {
  return staffRoles?.includes(SALE_CS_HEAD_ROLE) ?? false;
}
