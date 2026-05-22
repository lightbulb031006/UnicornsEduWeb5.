import {
    AssistantStaffOption,
    CustomerCareStaffOption,
    CreateStaffPayload,
    StaffDepositPaymentPreview,
    StaffAssignableUser,
    StaffDetail,
    StaffPayDepositSessionsPayload,
    StaffPayDepositSessionsResult,
    StaffPayAllPaymentsPayload,
    StaffPayAllPaymentsResult,
    StaffPaymentPreview,
    StaffIncomeSummary,
    StaffListResponse,
    StaffOption,
    StaffStatus,
} from '@/dtos/staff.dto';
import { CreateUserPayload, UpdateUserPayload } from '@/dtos/user.dto';
import { api } from '../client';
import { normalizeStaffIncomeSummary } from './staff-income-summary.api';

export async function getUsers() {
    const response = await api.get('/users');
    return response.data;
}

export async function getUserById(id: string) {
    const safeId = encodeURIComponent(id);
    const response = await api.get(`/users/${safeId}`);
    return response.data;
}

export async function createUser(data: CreateUserPayload) {
    const response = await api.post('/users', data);
    return response.data;
}

export async function updateUser(data: UpdateUserPayload) {
    const response = await api.patch('/users', data);
    return response.data;
}

export async function deleteUser(id: string) {
    const safeId = encodeURIComponent(id);
    const response = await api.delete(`/users/${safeId}`);
    return response.data;
}

/** StaffInfo list (bảng staff_info): GET /staff */
export async function getStaff(params: {
    page: number;
    limit: number;
    search?: string;
    status?: "" | StaffStatus;
    province?: string;
    university?: string;
    highSchool?: string;
    role?: string;
    className?: string;
}): Promise<StaffListResponse> {
    const response = await api.get("/staff", {
        params: {
            page: params.page,
            limit: params.limit,
            ...(params.search ? { search: params.search } : {}),
            ...(params.status ? { status: params.status } : {}),
            ...(params.province ? { province: params.province } : {}),
            ...(params.university ? { university: params.university } : {}),
            ...(params.highSchool ? { highSchool: params.highSchool } : {}),
            ...(params.role ? { role: params.role } : {}),
            ...(params.className ? { className: params.className } : {}),
        },
    });

    const payload = response.data as StaffListResponse;
    return {
        data: Array.isArray(payload?.data)
            ? payload.data.map((item) => ({
                ...item,
                unpaidAmountTotal:
                    typeof item?.unpaidAmountTotal === "number" && Number.isFinite(item.unpaidAmountTotal)
                        ? item.unpaidAmountTotal
                        : 0,
            }))
            : [],
        meta: {
            total: payload?.meta?.total ?? 0,
            page: payload?.meta?.page ?? params.page,
            limit: payload?.meta?.limit ?? params.limit,
        },
    };
}

/** Chi tiết một nhân sự: GET /staff/:id */
export async function getStaffById(id: string): Promise<StaffDetail> {
    const safeId = encodeURIComponent(id);
    const response = await api.get(`/staff/${safeId}`);
    return response.data;
}

/** % khấu trừ vận hành theo lớp (class_teachers.tax_rate_percent). Chỉ admin (backend). */
export async function patchStaffClassTeacherOperatingDeduction(
    staffId: string,
    classId: string,
    payload: { operating_deduction_rate_percent: number },
): Promise<StaffDetail> {
    const safeStaff = encodeURIComponent(staffId);
    const safeClass = encodeURIComponent(classId);
    const response = await api.patch(
        `/staff/${safeStaff}/class-teachers/${safeClass}/operating-deduction`,
        payload,
    );
    return response.data as StaffDetail;
}

/** Cập nhật thông tin nhân sự: PATCH /staff */
export async function updateStaff(payload: {
    id: string;
    full_name?: string;
    cccd_number?: string;
    ethnicity?: string;
    gender?: "male" | "female";
    current_address?: string;
    cccd_issued_date?: string;
    cccd_issued_place?: string;
    birth_date?: string;
    university?: string;
    high_school?: string;
    specialization?: string;
    bank_account?: string;
    bank_qr_link?: string;
    personal_achievement_link?: string | null;
    roles?: string[];
    status?: StaffStatus;
    customer_care_managed_by_staff_id?: string | null;
}): Promise<StaffDetail> {
    const response = await api.patch("/staff", payload);
    return response.data;
}

export async function updateStaffStatus(
    id: string,
    status: StaffStatus,
): Promise<StaffDetail> {
    const safeId = encodeURIComponent(id);
    const response = await api.patch(`/staff/${safeId}/status`, { status });
    return response.data as StaffDetail;
}

/** Xóa bản ghi staff (StaffInfo) theo id */
export async function deleteStaffById(id: string) {
    const safeId = encodeURIComponent(id);
    const response = await api.delete(`/staff/${safeId}`);
    return response.data;
}

export async function searchAssignableUsersByEmail(
    email: string,
): Promise<StaffAssignableUser[]> {
    const response = await api.get('/staff/assignable-users', {
        params: {
            email,
        },
    });

    return Array.isArray(response.data) ? (response.data as StaffAssignableUser[]) : [];
}

export async function searchCustomerCareStaff(params: {
    search?: string;
    limit?: number;
}): Promise<CustomerCareStaffOption[]> {
    const response = await api.get<CustomerCareStaffOption[]>('/staff/customer-care-options', {
        params: {
            ...(params.search?.trim() ? { search: params.search.trim() } : {}),
            ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
        },
    });

    return Array.isArray(response.data) ? response.data : [];
}

export async function searchStaffOptions(params: {
    search?: string;
    limit?: number;
}): Promise<StaffOption[]> {
    const response = await api.get<StaffOption[]>('/staff/options', {
        params: {
            ...(params.search?.trim() ? { search: params.search.trim() } : {}),
            ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
        },
    });

    return Array.isArray(response.data) ? response.data : [];
}

export async function searchAssistantStaff(params: {
    search?: string;
    limit?: number;
}): Promise<AssistantStaffOption[]> {
    const response = await api.get<AssistantStaffOption[]>('/staff/assistant-options', {
        params: {
            ...(params.search?.trim() ? { search: params.search.trim() } : {}),
            ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
        },
    });

    return Array.isArray(response.data) ? response.data : [];
}

export async function createStaff(payload: CreateStaffPayload): Promise<StaffDetail> {
    const response = await api.post('/staff', payload);
    return response.data as StaffDetail;
}

export async function getStaffIncomeSummary(
    id: string,
    params: {
        month: string;
        year: string;
        days?: number;
    },
): Promise<StaffIncomeSummary> {
    const safeId = encodeURIComponent(id);
    const response = await api.get<StaffIncomeSummary>(`/staff/${safeId}/income-summary`, {
        params: {
            month: params.month,
            year: params.year,
            ...(typeof params.days === "number" ? { days: params.days } : {}),
        },
    });

    console.log("response.data", response.data);

    return normalizeStaffIncomeSummary(response.data);
}

export async function getStaffPaymentPreview(
    id: string,
    params: {
        month: string;
        year: string;
    },
): Promise<StaffPaymentPreview> {
    const safeId = encodeURIComponent(id);
    const response = await api.get<StaffPaymentPreview>(`/staff/${safeId}/payment-preview`, {
        params: {
            month: params.month,
            year: params.year,
        },
    });

    return response.data;
}

export async function getStaffDepositPaymentPreview(
    id: string,
    params: {
        year: string;
    },
): Promise<StaffDepositPaymentPreview> {
    const safeId = encodeURIComponent(id);
    const response = await api.get<StaffDepositPaymentPreview>(`/staff/${safeId}/deposit-payment-preview`, {
        params: {
            year: params.year,
        },
    });

    return response.data;
}

export async function payAllStaffPayments(
    id: string,
    data: StaffPayAllPaymentsPayload,
): Promise<StaffPayAllPaymentsResult> {
    const safeId = encodeURIComponent(id);
    const response = await api.patch<StaffPayAllPaymentsResult>(
        `/staff/${safeId}/payment-status/pay-all`,
        data,
    );

    return response.data;
}

export async function payStaffDepositSessions(
    id: string,
    data: StaffPayDepositSessionsPayload,
): Promise<StaffPayDepositSessionsResult> {
    const safeId = encodeURIComponent(id);
    const response = await api.patch<StaffPayDepositSessionsResult>(
        `/staff/${safeId}/payment-status/pay-deposit`,
        data,
    );

    return response.data;
}

/** Regenerate Google Meet link cho gia sư: POST /staff/:id/regenerate-meet-link */
export async function regenerateStaffMeetLink(
    id: string,
): Promise<{ googleMeetLink: string }> {
    const safeId = encodeURIComponent(id);
    const response = await api.post<{ googleMeetLink: string }>(
        `/staff/${safeId}/regenerate-meet-link`,
    );
    return response.data;
}
