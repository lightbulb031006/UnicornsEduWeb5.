"use client";

import { useQuery } from "@tanstack/react-query";
import { getFullProfile } from "@/lib/apis/auth.api";

/** StaffId + roles + cờ Admin của người đang đăng nhập (dùng chung cache full-profile). */
export function useStaffViewer() {
  const { data: profile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const roles = profile?.staffInfo?.roles ?? [];
  return {
    staffId: profile?.staffInfo?.id ?? null,
    roles,
    isTrainingHead: roles.includes("training_head"),
    isAdmin: profile?.roleType === "admin" || roles.includes("admin"),
  };
}
