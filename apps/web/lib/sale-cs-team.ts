import type { SaleCsTeamRole } from "@/dtos/sale-cs-team.dto";

/**
 * Quản lý đội Sale & CSKH bởi Trưởng phòng Sale & CSKH (#271). Khớp
 * `sale-cs-head-role-policy.ts` ở backend; quyền từng dòng lấy từ
 * `permissions` backend trả về, backend vẫn là nơi chặn cuối.
 */
export const SALE_CS_TEAM_ROLES = [
  "sale",
  "customer_care",
] as const satisfies readonly SaleCsTeamRole[];

export function isSaleCsTeamRole(role: string): role is SaleCsTeamRole {
  return (SALE_CS_TEAM_ROLES as readonly string[]).includes(role);
}

export function getSaleCsTeamRoles(roles: readonly string[]): SaleCsTeamRole[] {
  return SALE_CS_TEAM_ROLES.filter((role) => roles.includes(role));
}

/** Role ngoài Sale/CSKH: chỉ hiển thị, giữ nguyên khi lưu. */
export function getNonTeamRoles(roles: readonly string[]): string[] {
  return roles.filter((role) => !isSaleCsTeamRole(role));
}

/** Sau khi lưu còn ít nhất một role (backend trả 400 nếu không). */
export function hasAnyRoleAfterTeamChange(
  currentRoles: readonly string[],
  selected: readonly string[],
): boolean {
  return getNonTeamRoles(currentRoles).length > 0 || selected.length > 0;
}

/** % mặc định CSKH (phân số 0–0.99) → «25%». */
export function formatCustomerCarePercent(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 10000) / 100}%`;
}
