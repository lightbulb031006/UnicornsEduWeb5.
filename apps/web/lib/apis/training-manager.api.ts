import type {
  TrainingManagerBulkPaymentStatusPayload,
  TrainingManagerBulkPaymentStatusResult,
  TrainingManagerManagedClassListResponse,
  TrainingManagerSessionAllowanceItem,
  TrainingManagerStaffOption,
  UpdateClassTrainingManagerPayload,
} from "@/dtos/training-manager.dto";
import { api } from "../client";

export async function getTrainingManagerOptions(params?: {
  search?: string;
  limit?: number;
}): Promise<TrainingManagerStaffOption[]> {
  const res = await api.get<TrainingManagerStaffOption[]>(
    "/staff/training-manager-options",
    { params },
  );
  return Array.isArray(res.data) ? res.data : [];
}

export async function updateClassTrainingManager(
  classId: string,
  payload: UpdateClassTrainingManagerPayload,
) {
  const res = await api.patch(
    `/class/${encodeURIComponent(classId)}/training-manager`,
    payload,
  );
  return res.data;
}

export async function getTrainingManagerManagedClasses(
  staffId: string,
  month: string,
): Promise<TrainingManagerManagedClassListResponse> {
  const res = await api.get<TrainingManagerManagedClassListResponse>(
    `/training-manager/staff/${encodeURIComponent(staffId)}/managed-classes`,
    { params: { month } },
  );
  const payload = res.data;
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    summary: {
      classCount: payload?.summary?.classCount ?? 0,
      totalMonth: payload?.summary?.totalMonth ?? 0,
      totalPending: payload?.summary?.totalPending ?? 0,
    },
  };
}

export async function getTrainingManagerSessionAllowances(
  staffId: string,
  classId: string,
  month: string,
): Promise<TrainingManagerSessionAllowanceItem[]> {
  const res = await api.get<TrainingManagerSessionAllowanceItem[]>(
    `/training-manager/staff/${encodeURIComponent(staffId)}/classes/${encodeURIComponent(classId)}/session-allowances`,
    { params: { month } },
  );
  return Array.isArray(res.data) ? res.data : [];
}

export async function bulkUpdateTrainingManagerPaymentStatus(
  staffId: string,
  payload: TrainingManagerBulkPaymentStatusPayload,
): Promise<TrainingManagerBulkPaymentStatusResult> {
  const res = await api.patch<TrainingManagerBulkPaymentStatusResult>(
    `/training-manager/staff/${encodeURIComponent(staffId)}/payment-status/bulk`,
    payload,
  );
  return res.data;
}
