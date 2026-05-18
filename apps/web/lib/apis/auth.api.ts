import {
  createGuestUser,
  ForgotPasswordDto,
  LoginDto,
  LoginResponseDto,
  RegisterDto,
  ResetPasswordDto,
  SetupPasswordDto,
  UserInfoDto,
} from "@/dtos/Auth.dto";
import type {
  BonusListResponse,
  CreateMyBonusPayload,
  UpdateMyBonusPayload,
} from "@/dtos/bonus.dto";
import type { StaffDashboardDto } from "@/dtos/dashboard.dto";
import type {
  CreateMyStaffExtraAllowancePayload,
  ExtraAllowanceListResponse,
  ExtraAllowanceRoleType,
  ExtraAllowanceStatus,
  UpdateMyStaffExtraAllowancePayload,
} from "@/dtos/extra-allowance.dto";
import type { LessonOutputStaffStatsResponse } from "@/dtos/lesson.dto";
import type {
  FullProfileDto,
  UpdateMyProfileDto,
  UpdateMyStaffProfileDto,
  UpdateMyStudentProfileDto,
} from "@/dtos/profile.dto";
import type { SessionItem } from "@/dtos/session.dto";
import type { StaffDetail, StaffIncomeSummary } from "@/dtos/staff.dto";
import type {
  StudentSelfDetail,
  StudentExamScheduleItem,
  StudentSePayStaticQrResponse,
  StudentSePayTopUpOrderResponse,
  StudentWalletTransaction,
  UpdateStudentExamSchedulesPayload,
} from "@/dtos/student.dto";
import { api } from "../client";
import { normalizeStaffIncomeSummary } from "./staff-income-summary.api";

export async function logIn(dto: LoginDto): Promise<LoginResponseDto> {
  const response = await api.post<LoginResponseDto>("/auth/login", dto);
  return response.data;
}

export async function register(registerDto: RegisterDto) {
  const response = await api.post("/auth/register", registerDto);
  return response.data;
}

export async function forgotPassword(ForgotPasswordDto: ForgotPasswordDto) {
  const response = await api.post("/auth/forgot-password", ForgotPasswordDto);
  return response.data;
}

export async function resetPassword(ResetPasswordDto: ResetPasswordDto) {
  const response = await api.post("/auth/reset-password", ResetPasswordDto);
  return response.data;
}

export async function verifyEmail(token: string) {
  const response = await api.get(`/auth/verify?token=${token}`);
  return response.data;
}

export async function resendVerificationEmail(dto?: { email?: string }) {
  const response = await api.post("/auth/resend-verification", dto ?? {});
  return response.data as { message: string; email: string };
}

export async function acceptDataConsent() {
  const response = await api.post("/auth/data-consent/accept");
  return response.data as {
    message: string;
    dataConsentAcceptedAt: string | null;
    dataConsentVersion: string | null;
  };
}

export async function getSession(): Promise<UserInfoDto> {
  const response = await api.get<UserInfoDto>("/auth/session");
  return response.data ?? createGuestUser();
}

export async function getProfile(): Promise<UserInfoDto> {
  return getSession();
}

export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}) {
  const response = await api.post("/auth/change-password", data);
  return response.data;
}

export async function setupPassword(data: SetupPasswordDto) {
  const response = await api.post("/auth/setup-password", data);
  return response.data;
}

export async function logout() {
  const response = await api.post("/auth/logout");
  return response.data;
}

/** Full profile (user + staffInfo + studentInfo). Requires auth. */
export async function getFullProfile(): Promise<FullProfileDto> {
  const response = await api.get("/users/me/full");
  return response.data;
}

/** Update current user basic info. Returns updated full profile. */
export async function updateMyProfile(
  dto: UpdateMyProfileDto,
): Promise<FullProfileDto> {
  const response = await api.patch<FullProfileDto>("/users/me", dto);
  return response.data;
}

export async function uploadMyAvatar(file: File): Promise<FullProfileDto> {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await api.post<FullProfileDto>("/users/me/avatar", formData);
  return response.data;
}

export async function deleteMyAvatar(): Promise<FullProfileDto> {
  const response = await api.delete<FullProfileDto>("/users/me/avatar");
  return response.data;
}

/** Update current user's staff record. Returns updated full profile. */
export async function updateMyStaffProfile(
  dto: UpdateMyStaffProfileDto,
): Promise<FullProfileDto> {
  const response = await api.patch<FullProfileDto>("/users/me/staff", dto);
  return response.data;
}

/** Update current user's student record. Returns updated full profile. */
export async function updateMyStudentProfile(
  dto: UpdateMyStudentProfileDto,
): Promise<FullProfileDto> {
  const response = await api.patch<FullProfileDto>("/users/me/student", dto);
  return response.data;
}

export async function uploadMyStaffCccdImages(params: {
  frontImage?: File | null;
  backImage?: File | null;
}): Promise<{
  staffId: string;
  cccdFrontPath?: string | null;
  cccdBackPath?: string | null;
  cccdFrontUrl?: string | null;
  cccdBackUrl?: string | null;
}> {
  const formData = new FormData();
  if (params.frontImage) {
    formData.append("front_image", params.frontImage);
  }
  if (params.backImage) {
    formData.append("back_image", params.backImage);
  }

  const response = await api.post("/users/me/staff/cccd-images", formData);
  return response.data;
}

/** Current linked student detail for self-service pages. */
export async function getMyStudentDetail(): Promise<StudentSelfDetail> {
  const response = await api.get<StudentSelfDetail>("/users/me/student-detail");
  return response.data;
}

/** Current linked student wallet history for self-service pages. */
export async function getMyStudentWalletHistory(params?: {
  limit?: number;
}): Promise<StudentWalletTransaction[]> {
  const response = await api.get<StudentWalletTransaction[]>(
    "/users/me/student-wallet-history",
    {
      params: {
        ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
      },
    },
  );

  return Array.isArray(response.data) ? response.data : [];
}

export async function getMyStudentExamSchedules(): Promise<
  StudentExamScheduleItem[]
> {
  const response = await api.get<StudentExamScheduleItem[]>(
    "/users/me/student-exam-schedules",
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function updateMyStudentExamSchedules(
  payload: UpdateStudentExamSchedulesPayload,
): Promise<StudentExamScheduleItem[]> {
  const response = await api.put<StudentExamScheduleItem[]>(
    "/users/me/student-exam-schedules",
    payload,
  );
  return Array.isArray(response.data) ? response.data : [];
}

/** Tạo đơn nạp tiền SePay kèm QR (không tự cộng số dư ví). */
export async function createMyStudentSePayTopUpOrder(payload: {
  amount: number;
}): Promise<StudentSePayTopUpOrderResponse> {
  const response = await api.post<StudentSePayTopUpOrderResponse>(
    "/users/me/student-wallet-sepay-topup-order",
    payload,
  );
  return response.data;
}

/** Lấy QR SePay tĩnh cho học sinh hiện tại (không tạo đơn, không chứa số tiền). */
export async function getMyStudentSePayStaticQr(): Promise<StudentSePayStaticQrResponse> {
  const response = await api.get<StudentSePayStaticQrResponse>(
    "/users/me/student-wallet-sepay-static-qr",
  );
  return response.data;
}

/** Current linked staff detail for self-service pages. */
export async function getMyStaffDetail(): Promise<StaffDetail> {
  const response = await api.get<StaffDetail>("/users/me/staff-detail");
  return response.data;
}

/** Current linked staff income summary for self-service pages. */
export async function getMyStaffIncomeSummary(params: {
  month: string;
  year: string;
  days?: number;
}): Promise<StaffIncomeSummary> {
  const response = await api.get<StaffIncomeSummary>(
    "/users/me/staff-income-summary",
    {
      params: {
        month: params.month,
        year: params.year,
        ...(typeof params.days === "number" ? { days: params.days } : {}),
      },
    },
  );
  return normalizeStaffIncomeSummary(response.data);
}

/** Current linked staff dashboard payload, filtered by current staff roles. */
export async function getMyStaffDashboard(
  params: {
    month?: string;
    year?: string;
  } = {},
): Promise<StaffDashboardDto> {
  const response = await api.get<StaffDashboardDto>(
    "/users/me/staff-dashboard",
    {
      params: {
        ...(params.month ? { month: params.month } : {}),
        ...(params.year ? { year: params.year } : {}),
      },
    },
  );

  return response.data;
}

/** Current linked staff bonuses for self-service pages. */
export async function getMyStaffBonuses(params: {
  page: number;
  limit: number;
  month?: string;
  status?: string;
}): Promise<BonusListResponse> {
  const response = await api.get<BonusListResponse>("/users/me/staff-bonuses", {
    params: {
      page: params.page,
      limit: params.limit,
      ...(params.month ? { month: params.month } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
  });

  const payload = response.data as BonusListResponse;
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    meta: {
      total: payload?.meta?.total ?? 0,
      page: payload?.meta?.page ?? params.page,
      limit: payload?.meta?.limit ?? params.limit,
    },
  };
}

/** Create a bonus for current linked staff. Status is enforced by backend. */
export async function createMyStaffBonus(dto: CreateMyBonusPayload) {
  const response = await api.post("/users/me/staff-bonuses", dto);
  return response.data;
}

/** Update a bonus for current linked staff. Payment status remains backend-managed. */
export async function updateMyStaffBonus(dto: UpdateMyBonusPayload) {
  const response = await api.patch("/users/me/staff-bonuses", dto);
  return response.data;
}

/** Current linked staff sessions for self-service pages. */
export async function getMyStaffSessions(params: {
  month: string;
  year: string;
}): Promise<SessionItem[]> {
  const response = await api.get<SessionItem[]>("/users/me/staff-sessions", {
    params: {
      month: params.month,
      year: params.year,
    },
  });

  return Array.isArray(response.data) ? response.data : [];
}

/** Current linked staff extra allowances for self-service role detail pages. */
export async function getMyStaffExtraAllowances(params: {
  page: number;
  limit: number;
  year?: string;
  month?: string;
  roleType?: ExtraAllowanceRoleType;
  status?: ExtraAllowanceStatus;
}): Promise<ExtraAllowanceListResponse> {
  const response = await api.get<ExtraAllowanceListResponse>(
    "/users/me/staff-extra-allowances",
    {
      params: {
        page: params.page,
        limit: params.limit,
        ...(params.year ? { year: params.year } : {}),
        ...(params.month ? { month: params.month } : {}),
        ...(params.roleType ? { roleType: params.roleType } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
    },
  );

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

/** Self-service: supported staff roles create a pending extra allowance for themselves. */
export async function createMyStaffExtraAllowance(
  dto: CreateMyStaffExtraAllowancePayload,
): Promise<unknown> {
  const response = await api.post("/users/me/staff-extra-allowances", dto);
  return response.data;
}

/** Self-service: supported staff roles update their own allowance details. */
export async function updateMyStaffExtraAllowance(
  dto: UpdateMyStaffExtraAllowancePayload,
): Promise<unknown> {
  const response = await api.patch("/users/me/staff-extra-allowances", dto);
  return response.data;
}

/** Current linked staff lesson output stats for self-service lesson-plan detail page. */
export async function getMyStaffLessonOutputStats(params?: {
  days?: number;
}): Promise<LessonOutputStaffStatsResponse> {
  const response = await api.get<LessonOutputStaffStatsResponse>(
    "/users/me/staff-lesson-output-stats",
    {
      params: {
        ...(typeof params?.days === "number" ? { days: params.days } : {}),
      },
    },
  );

  return response.data;
}
