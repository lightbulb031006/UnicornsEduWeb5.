import type {
  SaleCsTeamAccountStatusResult,
  SaleCsTeamBonus,
  SaleCsTeamListParams,
  SaleCsTeamMember,
  SaleCsTeamMemberDetail,
  SaleCsTeamPage,
  SaleCsTeamRolesResult,
  SaleCsTeamSaleAllowance,
  UpdateSaleCsTeamAccountStatusPayload,
  UpdateSaleCsTeamProfilePayload,
  UpdateSaleCsTeamRolesPayload,
} from "@/dtos/sale-cs-team.dto";
import type {
  AccountHandleResult,
  SetAccountHandlePayload,
} from "@/dtos/user.dto";
import { api } from "@/lib/client";

export const saleCsTeamKeys = {
  all: ["sale-cs-team"] as const,
  list: (params: SaleCsTeamListParams) =>
    ["sale-cs-team", "list", params] as const,
  detail: (staffId: string) => ["sale-cs-team", "detail", staffId] as const,
  saleAllowances: (staffId: string, month: string) =>
    ["sale-cs-team", "sale-allowances", staffId, month] as const,
  bonuses: (staffId: string, month: string) =>
    ["sale-cs-team", "bonuses", staffId, month] as const,
};

const memberPath = (staffId: string) =>
  `/sale-cs-team/members/${encodeURIComponent(staffId)}`;

export async function listSaleCsTeamMembers(
  params: SaleCsTeamListParams,
): Promise<SaleCsTeamPage<SaleCsTeamMember>> {
  const response = await api.get<SaleCsTeamPage<SaleCsTeamMember>>(
    "/sale-cs-team/members",
    {
      params: {
        page: params.page,
        limit: params.limit,
        ...(params.search ? { search: params.search } : {}),
        ...(params.role ? { role: params.role } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.scope === "candidates" ? { scope: "candidates" } : {}),
      },
    },
  );
  return response.data;
}

export async function getSaleCsTeamMember(
  staffId: string,
): Promise<SaleCsTeamMemberDetail> {
  const response = await api.get<SaleCsTeamMemberDetail>(memberPath(staffId));
  return response.data;
}

export async function listSaleCsTeamSaleAllowances(
  staffId: string,
  month: string,
): Promise<SaleCsTeamSaleAllowance[]> {
  const response = await api.get<SaleCsTeamSaleAllowance[]>(
    `${memberPath(staffId)}/sale-allowances`,
    { params: month ? { month } : {} },
  );
  return response.data;
}

export async function listSaleCsTeamBonuses(
  staffId: string,
  month: string,
): Promise<SaleCsTeamBonus[]> {
  const response = await api.get<SaleCsTeamBonus[]>(
    `${memberPath(staffId)}/bonuses`,
    { params: month ? { month } : {} },
  );
  return response.data;
}

/** Bật/tắt role Sale / CSKH (trạng thái đích của 2 role này). */
export async function updateSaleCsTeamRoles(
  staffId: string,
  payload: UpdateSaleCsTeamRolesPayload,
): Promise<SaleCsTeamRolesResult> {
  const response = await api.patch<SaleCsTeamRolesResult>(
    `${memberPath(staffId)}/roles`,
    payload,
  );
  return response.data;
}

export async function updateSaleCsTeamAccountStatus(
  staffId: string,
  payload: UpdateSaleCsTeamAccountStatusPayload,
): Promise<SaleCsTeamAccountStatusResult> {
  const response = await api.patch<SaleCsTeamAccountStatusResult>(
    `${memberPath(staffId)}/account-status`,
    payload,
  );
  return response.data;
}

/** Đổi tên đăng nhập nhân sự chỉ mang Sale/CSKH (16/11). */
export async function updateSaleCsTeamAccountHandle(
  staffId: string,
  payload: SetAccountHandlePayload,
): Promise<AccountHandleResult> {
  const response = await api.patch<AccountHandleResult>(
    `${memberPath(staffId)}/account-handle`,
    payload,
  );
  return response.data;
}

export async function updateSaleCsTeamProfile(
  staffId: string,
  payload: UpdateSaleCsTeamProfilePayload,
): Promise<SaleCsTeamMember> {
  const response = await api.patch<SaleCsTeamMember>(
    `${memberPath(staffId)}/professional-profile`,
    payload,
  );
  return response.data;
}

/** Đổi ảnh đại diện nhân sự dưới cấp (multipart `avatar`), lưu ngay. */
export async function uploadSaleCsTeamAvatar(
  staffId: string,
  file: File,
): Promise<SaleCsTeamMemberDetail> {
  const formData = new FormData();
  formData.append("avatar", file);
  const response = await api.post<SaleCsTeamMemberDetail>(
    `${memberPath(staffId)}/avatar`,
    formData,
  );
  return response.data;
}
