import type {
  CreateStudentWalletDirectTopUpRequestPayload,
  CreateStudentPayload,
  StudentAssignableUser,
  StudentDetail,
  StudentExamScheduleItem,
  StudentGender,
  StudentListItem,
  StudentListResponse,
  StudentSePayStaticQrResponse,
  StudentSePayTopUpOrderResponse,
  StudentStatus,
  StudentWalletDirectTopUpApprovalResult,
  StudentWalletDirectTopUpRequestListResponse,
  StudentWalletDirectTopUpRequestListStatus,
  StudentWalletDirectTopUpRequestResponse,
  StudentWalletTransaction,
  StudentWalletTransactionType,
  UpdateStudentAccountBalancePayload,
  UpdateStudentClassesPayload,
  UpdateStudentExamSchedulesPayload,
  UpdateStudentPayload,
} from "@/dtos/student.dto";
import { api } from "../client";

type StudentListParams = {
  page?: number;
  limit?: number;
  search?: string;
  school?: string;
  province?: string;
  status?: "" | StudentStatus;
  gender?: "" | StudentGender;
  className?: string;
};

type StudentWalletHistoryParams = {
  limit?: number;
  type?: StudentWalletTransactionType;
};

type StudentWalletDirectTopUpRequestListParams = {
  status?: StudentWalletDirectTopUpRequestListStatus;
  page?: number;
  limit?: number;
};

export async function searchAssignableUsersByEmail(
  email: string,
): Promise<StudentAssignableUser[]> {
  const response = await api.get("/student/assignable-users", {
    params: {
      email,
    },
  });

  return Array.isArray(response.data) ? (response.data as StudentAssignableUser[]) : [];
}

/**
 * GET /student – paginated student list for admin pages.
 */
export async function getStudentList(params: StudentListParams): Promise<StudentListResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;

  const response = await api.get<StudentListResponse>("/student", {
    params: {
      page,
      limit,
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
      ...(params.school?.trim() ? { school: params.school.trim() } : {}),
      ...(params.province?.trim() ? { province: params.province.trim() } : {}),
      ...(params.status?.trim() ? { status: params.status.trim() } : {}),
      ...(params.gender?.trim() ? { gender: params.gender.trim() } : {}),
      ...(params.className?.trim() ? { className: params.className.trim() } : {}),
    },
  });

  const payload = response.data as StudentListResponse;
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    meta: {
      total: payload?.meta?.total ?? 0,
      page: payload?.meta?.page ?? page,
      limit: payload?.meta?.limit ?? limit,
    },
  };
}

/**
 * GET /student – unwrap paginated response for lightweight search pickers.
 */
export async function getStudents(params: StudentListParams): Promise<StudentListItem[]> {
  const response = await getStudentList({
    ...params,
    limit: params.limit ?? 50,
  });

  return response.data;
}

/**
 * GET /student/:id – get student by ID.
 */
export async function getStudentById(id: string): Promise<StudentDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.get<StudentDetail>(`/student/${safeId}`);
  return response.data;
}

/**
 * GET /student/:id/wallet-history – get latest wallet transactions for a student.
 */
export async function getStudentWalletHistory(
  id: string,
  params: StudentWalletHistoryParams = {},
): Promise<StudentWalletTransaction[]> {
  const safeId = encodeURIComponent(id);
  const response = await api.get<StudentWalletTransaction[]>(`/student/${safeId}/wallet-history`, {
    params: {
      ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
      ...(params.type ? { type: params.type } : {}),
    },
  });

  return Array.isArray(response.data) ? response.data : [];
}

export async function getStudentExamSchedules(
  id: string,
): Promise<StudentExamScheduleItem[]> {
  const safeId = encodeURIComponent(id);
  const response = await api.get<StudentExamScheduleItem[]>(
    `/student/${safeId}/exam-schedules`,
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function createStudent(payload: CreateStudentPayload): Promise<StudentDetail> {
  const response = await api.post<StudentDetail>("/student", payload);
  return response.data;
}

/**
 * PATCH /student/:id – update student by ID.
 */
export async function updateStudentById(
  id: string,
  payload: UpdateStudentPayload,
): Promise<StudentDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch<StudentDetail>(`/student/${safeId}`, payload);
  return response.data;
}

export async function updateStudentStatus(
  id: string,
  status: StudentStatus,
  reason?: string,
): Promise<StudentDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch<StudentDetail>(`/student/${safeId}/status`, {
    status,
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  });
  return response.data;
}

export async function updateStudentExamSchedules(
  id: string,
  payload: UpdateStudentExamSchedulesPayload,
): Promise<StudentExamScheduleItem[]> {
  const safeId = encodeURIComponent(id);
  const response = await api.put<StudentExamScheduleItem[]>(
    `/student/${safeId}/exam-schedules`,
    payload,
  );
  return Array.isArray(response.data) ? response.data : [];
}

/** PATCH /student/update-student-account-balance – admin-only manual balance adjustment with reason. */
export async function updateStudentAccountBalance(
  payload: UpdateStudentAccountBalancePayload,
): Promise<StudentDetail> {
  const response = await api.patch<StudentDetail>("/student/update-student-account-balance", payload);
  return response.data;
}

/** POST /student/:id/wallet-sepay-topup-order – create SePay QR top-up order for a student. */
export async function createStudentSePayTopUpOrder(
  studentId: string,
  payload: { amount: number },
): Promise<StudentSePayTopUpOrderResponse> {
  const safeId = encodeURIComponent(studentId);
  const response = await api.post<StudentSePayTopUpOrderResponse>(
    `/student/${safeId}/wallet-sepay-topup-order`,
    payload,
  );
  return response.data;
}

/** GET /student/:id/wallet-sepay-static-qr – get static SePay QR for a student. */
export async function getStudentSePayStaticQr(
  studentId: string,
): Promise<StudentSePayStaticQrResponse> {
  const safeId = encodeURIComponent(studentId);
  const response = await api.get<StudentSePayStaticQrResponse>(
    `/student/${safeId}/wallet-sepay-static-qr`,
  );
  return response.data;
}

/** POST /student/:id/wallet-direct-topup-requests – request admin approval for a manual top-up. */
export async function createStudentWalletDirectTopUpRequest(
  studentId: string,
  payload: CreateStudentWalletDirectTopUpRequestPayload,
): Promise<StudentWalletDirectTopUpRequestResponse> {
  const safeId = encodeURIComponent(studentId);
  const response = await api.post<StudentWalletDirectTopUpRequestResponse>(
    `/student/${safeId}/wallet-direct-topup-requests`,
    payload,
  );
  return response.data;
}

/** GET /student/wallet-direct-topup-requests – admin approval queue and history. */
export async function getStudentWalletDirectTopUpRequests(
  params: StudentWalletDirectTopUpRequestListParams = {},
): Promise<StudentWalletDirectTopUpRequestListResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const response = await api.get<StudentWalletDirectTopUpRequestListResponse>(
    "/student/wallet-direct-topup-requests",
    {
      params: {
        page,
        limit,
        ...(params.status ? { status: params.status } : {}),
      },
    },
  );
  return {
    data: Array.isArray(response.data?.data) ? response.data.data : [],
    meta: {
      total: response.data?.meta?.total ?? 0,
      page: response.data?.meta?.page ?? page,
      limit: response.data?.meta?.limit ?? limit,
    },
  };
}

/** GET /student/wallet-direct-topup-requests/:requestId – admin approval popup detail. */
export async function getStudentWalletDirectTopUpRequest(
  requestId: string,
): Promise<StudentWalletDirectTopUpRequestResponse> {
  const safeId = encodeURIComponent(requestId);
  const response = await api.get<StudentWalletDirectTopUpRequestResponse>(
    `/student/wallet-direct-topup-requests/${safeId}`,
  );
  return response.data;
}

/** POST /student/wallet-direct-topup-requests/:requestId/approve – approve from admin queue. */
export async function approveStudentWalletDirectTopUpRequest(
  requestId: string,
): Promise<StudentWalletDirectTopUpApprovalResult> {
  const safeId = encodeURIComponent(requestId);
  const response = await api.post<StudentWalletDirectTopUpApprovalResult>(
    `/student/wallet-direct-topup-requests/${safeId}/approve`,
  );
  return response.data;
}

/** GET /student/wallet-direct-topup-approval – preview public approval request. */
export async function getStudentWalletDirectTopUpApproval(
  token: string,
): Promise<StudentWalletDirectTopUpRequestResponse> {
  const response = await api.get<StudentWalletDirectTopUpRequestResponse>(
    "/student/wallet-direct-topup-approval",
    {
      params: { token },
    },
  );
  return response.data;
}

/** POST /student/wallet-direct-topup-approval/confirm – approve public direct top-up request. */
export async function confirmStudentWalletDirectTopUpApproval(
  token: string,
): Promise<StudentWalletDirectTopUpApprovalResult> {
  const response = await api.post<StudentWalletDirectTopUpApprovalResult>(
    "/student/wallet-direct-topup-approval/confirm",
    { token },
  );
  return response.data;
}

/**
 * PATCH /student/:id/classes – replace student memberships authoritatively in backend.
 */
export async function updateStudentClasses(
  id: string,
  payload: UpdateStudentClassesPayload,
): Promise<StudentDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch<StudentDetail>(`/student/${safeId}/classes`, payload);
  return response.data;
}

/**
 * DELETE /student/:id – delete a student by ID.
 */
export async function deleteStudentById(id: string) {
  const safeId = encodeURIComponent(id);
  const response = await api.delete(`/student/${safeId}`);
  return response.data;
}

/** POST /student/:id/avatar – upload linked-user avatar (clean + watermark twin). */
export async function uploadStudentAvatar(
  id: string,
  file: File,
): Promise<StudentDetail> {
  const safeId = encodeURIComponent(id);
  const formData = new FormData();
  formData.append("avatar", file);
  const response = await api.post<StudentDetail>(
    `/student/${safeId}/avatar`,
    formData,
  );
  return response.data;
}

/** DELETE /student/:id/avatar – remove linked-user avatar twins. */
export async function deleteStudentAvatar(id: string): Promise<StudentDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.delete<StudentDetail>(`/student/${safeId}/avatar`);
  return response.data;
}
