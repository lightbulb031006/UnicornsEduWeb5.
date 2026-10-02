import type {
  AchievementDto,
  AchievementOwnerRef,
  CreateStaffAchievementPayload,
  CreateStudentAchievementPayload,
  ReorderAchievementsPayload,
  UpdateStaffAchievementPayload,
  UpdateStudentAchievementPayload,
} from "@/dtos/achievement.dto";
import { api } from "@/lib/client";

function ownerBasePath(owner: AchievementOwnerRef): string {
  if (owner.kind === "staff" && owner.mode === "self") {
    return "/users/me/achievements";
  }
  if (owner.kind === "staff") {
    return `/staff/${encodeURIComponent(owner.staffId)}/achievements`;
  }
  return `/student/${encodeURIComponent(owner.studentId)}/achievements`;
}

export function achievementQueryKey(owner: AchievementOwnerRef) {
  if (owner.kind === "staff" && owner.mode === "self") {
    return ["achievements", "staff", "me"] as const;
  }
  if (owner.kind === "staff") {
    return ["achievements", "staff", owner.staffId] as const;
  }
  return ["achievements", "student", owner.studentId] as const;
}

export async function listAchievements(
  owner: AchievementOwnerRef,
): Promise<AchievementDto[]> {
  const response = await api.get<AchievementDto[]>(ownerBasePath(owner));
  return Array.isArray(response.data) ? response.data : [];
}

export async function createAchievement(
  owner: AchievementOwnerRef,
  payload: CreateStaffAchievementPayload | CreateStudentAchievementPayload,
): Promise<AchievementDto> {
  const response = await api.post<AchievementDto>(ownerBasePath(owner), payload);
  return response.data;
}

export async function updateAchievement(
  owner: AchievementOwnerRef,
  achievementId: string,
  payload: UpdateStaffAchievementPayload | UpdateStudentAchievementPayload,
): Promise<AchievementDto> {
  const response = await api.patch<AchievementDto>(
    `${ownerBasePath(owner)}/${encodeURIComponent(achievementId)}`,
    payload,
  );
  return response.data;
}

export async function deleteAchievement(
  owner: AchievementOwnerRef,
  achievementId: string,
): Promise<void> {
  await api.delete(
    `${ownerBasePath(owner)}/${encodeURIComponent(achievementId)}`,
  );
}

export async function reorderAchievements(
  owner: AchievementOwnerRef,
  payload: ReorderAchievementsPayload,
): Promise<AchievementDto[]> {
  const response = await api.put<AchievementDto[]>(
    `${ownerBasePath(owner)}/reorder`,
    payload,
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function uploadAchievementImage(
  owner: AchievementOwnerRef,
  achievementId: string,
  file: File,
): Promise<AchievementDto> {
  const formData = new FormData();
  formData.append("image", file);
  const response = await api.post<AchievementDto>(
    `${ownerBasePath(owner)}/${encodeURIComponent(achievementId)}/image`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return response.data;
}

export async function deleteAchievementImage(
  owner: AchievementOwnerRef,
  achievementId: string,
): Promise<AchievementDto> {
  const response = await api.delete<AchievementDto>(
    `${ownerBasePath(owner)}/${encodeURIComponent(achievementId)}/image`,
  );
  return response.data;
}
