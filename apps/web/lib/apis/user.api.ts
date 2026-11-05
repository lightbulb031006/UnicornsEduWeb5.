import type {
  AdminSetUserPasswordPayload,
  CreateStudentUserPayload,
  CreateUserPayload,
  CreateUserResponse,
  UserDetailWithStaff,
  UserListItem,
  UserListResponse,
  UpdateUserPayload,
} from "@/dtos/user.dto";
import { api } from "../client";

export interface GetUserListParams {
  page?: number;
  limit?: number;
  search?: string;
}

/** Danh sách user có phân trang (admin). */
export async function getUserList(
  params: GetUserListParams = {}
): Promise<UserListResponse> {
  const { page = 1, limit = 20 } = params;
  const response = await api.get<UserListResponse>("/users", {
    params: {
      page,
      limit,
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
    },
  });
  const payload = response.data;
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    meta: payload?.meta ?? { total: 0, page: 1, limit },
  };
}

/** Chi tiết user (có staffInfo cho phân quyền). */
export async function getUserById(id: string): Promise<UserDetailWithStaff> {
  const safeId = encodeURIComponent(id);
  const response = await api.get<UserDetailWithStaff>(`/users/${safeId}`);
  return response.data;
}

/** Tạo user mới từ admin, gửi email xác thực và gán role nếu có. */
export async function createUser(
  data: CreateUserPayload,
): Promise<CreateUserResponse> {
  const response = await api.post<CreateUserResponse>("/users", data);
  return response.data;
}

/** Tạo user học sinh đầy đủ (profile + classes) từ admin. */
export async function createStudentUser(
  data: CreateStudentUserPayload,
): Promise<CreateUserResponse> {
  const response = await api.post<CreateUserResponse>("/users/student", data);
  return response.data;
}

/** Cập nhật user (roleType, status, ...). */
export async function updateUser(data: UpdateUserPayload): Promise<UserDetailWithStaff> {
  const response = await api.patch<UserDetailWithStaff>("/users", data);
  return response.data;
}

/** Admin/trợ lí đặt mật khẩu mới cho user (thu hồi mọi phiên đăng nhập). */
export async function setUserPassword(
  id: string,
  data: AdminSetUserPasswordPayload,
): Promise<{ message: string }> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch<{ message: string }>(
    `/users/${safeId}/password`,
    data,
  );
  return response.data;
}

/** Xóa user theo id (chỉ user chưa liên kết staff/student/history). */
export async function deleteUser(id: string): Promise<UserListItem> {
  const safeId = encodeURIComponent(id);
  const response = await api.delete<UserListItem>(`/users/${safeId}`);
  return response.data;
}
