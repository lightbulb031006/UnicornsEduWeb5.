import { api } from "@/lib/client";
import type { UserDevice, ForceLogoutResponse, CleanupExpiredResponse } from "@/dtos/device.dto";

export async function getStudentDevices(
  studentId: string,
  includeExpired = false
): Promise<UserDevice[]> {
  const params = new URLSearchParams();
  if (includeExpired) {
    params.set("includeExpired", "true");
  }
  const queryString = params.toString();
  const url = `/device/student/${studentId}${queryString ? `?${queryString}` : ""}`;
  const response = await api.get<UserDevice[]>(url);
  return response.data;
}

export async function forceLogoutDevice(
  deviceId: string
): Promise<ForceLogoutResponse> {
  const response = await api.delete<ForceLogoutResponse>(
    `/device/${deviceId}/force-logout`
  );
  return response.data;
}

export async function cleanupExpiredDevices(): Promise<CleanupExpiredResponse> {
  const response = await api.delete<CleanupExpiredResponse>(
    "/device/cleanup-expired"
  );
  return response.data;
}
