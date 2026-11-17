import type {
  StaffTrainingRolesResult,
  TrainingTutorAccountStatusResult,
  TrainingTutorBonus,
  TrainingTutorStatusResult,
  UpdateTrainingTutorProfilePayload,
  UpdateTrainingTutorStatusPayload,
  TrainingTutorDetail,
  TrainingTutorListParams,
  TrainingTutorPage,
  TrainingTutorSession,
  TrainingTutorListItem,
  TrainingRoleCandidate,
  TrainingRoleCandidateParams,
  UpdateStaffTrainingRolesPayload,
} from "@/dtos/training-tutor.dto";
import type {
  AccountHandleResult,
  SetAccountHandlePayload,
} from "@/dtos/user.dto";
import { api } from "@/lib/client";

export const trainingTutorKeys = {
  all: ["training-tutors"] as const,
  list: (params: TrainingTutorListParams) =>
    ["training-tutors", "list", params] as const,
  detail: (id: string) => ["training-tutors", "detail", id] as const,
  sessions: (id: string, page: number) =>
    ["training-tutors", "sessions", id, page] as const,
  bonuses: (id: string, month: string) =>
    ["training-tutors", "bonuses", id, month] as const,
  roleCandidates: (params: TrainingRoleCandidateParams) =>
    ["training-tutors", "role-candidates", params] as const,
};

function tutorPath(id: string, suffix = ""): string {
  return `/training/tutors/${encodeURIComponent(id)}${suffix}`;
}

export async function listTrainingTutors(
  params: TrainingTutorListParams,
): Promise<TrainingTutorPage<TrainingTutorListItem>> {
  const response = await api.get<TrainingTutorPage<TrainingTutorListItem>>(
    "/training/tutors",
    {
      params: {
        page: params.page,
        limit: params.limit,
        ...(params.search ? { search: params.search } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.scope === "all" ? { scope: "all" } : {}),
        ...(params.scope === "all" && params.role ? { role: params.role } : {}),
      },
    },
  );
  return response.data;
}

/** Ứng viên ngoài ba nhóm để Trưởng ban Đào tạo bật role (follow-up 13/11 mục 2.2). */
export async function listTrainingRoleCandidates(
  params: TrainingRoleCandidateParams,
): Promise<TrainingTutorPage<TrainingRoleCandidate>> {
  const response = await api.get<TrainingTutorPage<TrainingRoleCandidate>>(
    "/training/tutors/role-candidates",
    {
      params: {
        page: params.page,
        limit: params.limit,
        ...(params.search ? { search: params.search } : {}),
      },
    },
  );
  return response.data;
}

export async function getTrainingTutor(
  id: string,
): Promise<TrainingTutorDetail> {
  const response = await api.get<TrainingTutorDetail>(
    `/training/tutors/${encodeURIComponent(id)}`,
  );
  return response.data;
}

export async function listTrainingTutorSessions(
  id: string,
  page: number,
  limit: number,
): Promise<TrainingTutorPage<TrainingTutorSession>> {
  const response = await api.get<TrainingTutorPage<TrainingTutorSession>>(
    `/training/tutors/${encodeURIComponent(id)}/sessions`,
    { params: { page, limit } },
  );
  return response.data;
}

/** Trưởng ban Đào tạo bật/tắt role gia sư, Ban Chuyên môn, Đào Tạo của nhân sự. */
export async function updateStaffTrainingRoles(
  staffId: string,
  payload: UpdateStaffTrainingRolesPayload,
): Promise<StaffTrainingRolesResult> {
  const response = await api.patch<StaffTrainingRolesResult>(
    `/staff/${encodeURIComponent(staffId)}/training-roles`,
    payload,
  );
  return response.data;
}

/** Thưởng của cấp dưới — chỉ xem (#278). */
export async function listTrainingTutorBonuses(
  id: string,
  month: string,
): Promise<TrainingTutorBonus[]> {
  const response = await api.get<TrainingTutorBonus[]>(
    tutorPath(id, "/bonuses"),
    { params: month ? { month } : {} },
  );
  return response.data;
}

export async function updateTrainingTutorProfile(
  id: string,
  payload: UpdateTrainingTutorProfilePayload,
): Promise<TrainingTutorDetail> {
  const response = await api.patch<TrainingTutorDetail>(
    tutorPath(id, "/professional-profile"),
    payload,
  );
  return response.data;
}

export async function uploadTrainingTutorAvatar(
  id: string,
  file: File,
): Promise<TrainingTutorDetail> {
  const formData = new FormData();
  formData.append("avatar", file);
  const response = await api.post<TrainingTutorDetail>(
    tutorPath(id, "/avatar"),
    formData,
  );
  return response.data;
}

export async function updateTrainingTutorStatus(
  id: string,
  payload: UpdateTrainingTutorStatusPayload,
): Promise<TrainingTutorStatusResult> {
  const response = await api.patch<TrainingTutorStatusResult>(
    tutorPath(id, "/status"),
    payload,
  );
  return response.data;
}

/** Đổi tên đăng nhập cấp dưới của Trưởng ban Đào tạo (16/11). */
export async function updateTrainingTutorAccountHandle(
  id: string,
  payload: SetAccountHandlePayload,
): Promise<AccountHandleResult> {
  const response = await api.patch<AccountHandleResult>(
    tutorPath(id, "/account-handle"),
    payload,
  );
  return response.data;
}

export async function updateTrainingTutorAccountStatus(
  id: string,
  locked: boolean,
): Promise<TrainingTutorAccountStatusResult> {
  const response = await api.patch<TrainingTutorAccountStatusResult>(
    tutorPath(id, "/account-status"),
    { locked },
  );
  return response.data;
}
