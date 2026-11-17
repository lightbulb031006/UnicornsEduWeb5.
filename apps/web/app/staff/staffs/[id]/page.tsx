"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import AdminStaffDetailPage from "@/app/admin/staffs/[id]/page";
import HeadStaffDetailPage from "@/components/staff/detail/HeadStaffDetailPage";
import StaffDetailSkeleton from "@/components/staff/detail/StaffDetailSkeleton";
import { getFullProfile } from "@/lib/apis/auth.api";
import { resolveAdminShellAccess } from "@/lib/admin-shell-access";
import { AUTH_FULL_PROFILE_QUERY_KEY } from "@/lib/profile-full-query";

/**
 * `/staff/staffs/:id` — một route hồ sơ nhân sự cho mọi người xem trong staff
 * shell:
 * - Admin / Kế toán chi: trang admin đầy đủ (`/admin/staffs/:id`, `routeBase`
 *   `/staff`);
 * - các trưởng (Trưởng phòng Sale & CSKH, Ban Đào Tạo): `HeadStaffDetailPage`
 *   theo bố cục admin nhưng chỉ dữ liệu trong phạm vi quản lý (#270).
 * Trưởng tự xem chính mình → `/staff/profile` (trang cá nhân có thu nhập).
 */
export default function StaffStaffDetailRoute() {
  const params = useParams<{ id: string }>();
  const staffId = decodeURIComponent(params.id ?? "");
  const router = useRouter();
  const { data: profile, isLoading } = useQuery({
    queryKey: AUTH_FULL_PROFILE_QUERY_KEY,
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const access = resolveAdminShellAccess(profile);
  const isAdminLike = access.isAdmin || access.isAccountantExpense;
  const viewerStaffId = profile?.staffInfo?.id ?? null;
  const isSelfView =
    !isAdminLike && viewerStaffId != null && viewerStaffId === staffId;

  useEffect(() => {
    if (isSelfView) router.replace("/staff/profile");
  }, [isSelfView, router]);

  if (isLoading || isSelfView) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 bg-bg-primary p-4 pb-8 sm:p-6">
        <StaffDetailSkeleton />
      </div>
    );
  }

  if (isAdminLike) return <AdminStaffDetailPage />;

  return (
    <HeadStaffDetailPage staffId={staffId} viewerRoles={access.staffRoles} />
  );
}
