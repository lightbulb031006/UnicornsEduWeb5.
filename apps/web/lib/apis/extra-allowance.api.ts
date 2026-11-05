import {
  BulkUpdateExtraAllowanceStatusPayload,
  BulkUpdateExtraAllowanceStatusResult,
  CreateExtraAllowancePayload,
  ExtraAllowanceDetailResponse,
  ExtraAllowanceListResponse,
  SaleStudentOption,
  SearchExtraAllowanceParams,
  UpdateExtraAllowancePayload,
} from "@/dtos/extra-allowance.dto";
import { api } from "../client";

export async function getExtraAllowances(
  params: SearchExtraAllowanceParams,
): Promise<ExtraAllowanceListResponse> {
  const response = await api.get("/extra-allowance", {
    params: {
      page: params.page,
      limit: params.limit,
      ...(params.search ? { search: params.search } : {}),
      ...(params.year ? { year: params.year } : {}),
      ...(params.month ? { month: params.month } : {}),
      ...(params.roleType ? { roleType: params.roleType } : {}),
      ...(params.staffId ? { staffId: params.staffId } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
  });

  const payload = response.data as ExtraAllowanceListResponse;
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    meta: {
      total: payload?.meta?.total ?? 0,
      page: payload?.meta?.page ?? params.page,
      limit: payload?.meta?.limit ?? params.limit,
    },
  };
}

export async function getExtraAllowanceById(
  id: string,
): Promise<ExtraAllowanceDetailResponse> {
  const safeId = encodeURIComponent(id);
  const response = await api.get(`/extra-allowance/${safeId}`);
  return response.data as ExtraAllowanceDetailResponse;
}

export async function createExtraAllowance(
  data: CreateExtraAllowancePayload,
): Promise<ExtraAllowanceDetailResponse> {
  const response = await api.post("/extra-allowance", data);
  return response.data as ExtraAllowanceDetailResponse;
}

export async function updateExtraAllowance(
  data: UpdateExtraAllowancePayload,
): Promise<ExtraAllowanceDetailResponse> {
  const response = await api.patch("/extra-allowance", data);
  return response.data as ExtraAllowanceDetailResponse;
}

export async function bulkUpdateExtraAllowanceStatus(
  data: BulkUpdateExtraAllowanceStatusPayload,
): Promise<BulkUpdateExtraAllowanceStatusResult> {
  const response = await api.patch("/extra-allowance/status/bulk", data);
  return response.data as BulkUpdateExtraAllowanceStatusResult;
}

export async function deleteExtraAllowanceById(id: string) {
  const safeId = encodeURIComponent(id);
  const response = await api.delete(`/extra-allowance/${safeId}`);
  return response.data;
}

/** Admin / kế toán chi: tìm học sinh để gắn vào Trợ cấp sale. */
export async function searchSaleStudentOptions(
  search?: string,
): Promise<SaleStudentOption[]> {
  const response = await api.get<SaleStudentOption[]>(
    "/extra-allowance/student-options",
    { params: search ? { search } : undefined },
  );
  return Array.isArray(response.data) ? response.data : [];
}
