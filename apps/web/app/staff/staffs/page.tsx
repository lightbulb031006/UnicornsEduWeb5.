"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminStaffPage from "@/app/admin/staffs/page";
import { StaffListTableSkeleton } from "@/components/admin/staff";
import LessonPlanHeadStaffPanel from "@/components/staff/lesson-plan-head/LessonPlanHeadStaffPanel";
import SaleCsTeamStaffList from "@/components/staff/sale-cs-team/SaleCsTeamStaffList";
import TrainingStaffList from "@/components/staff/tutors/TrainingStaffList";
import { getFullProfile } from "@/lib/apis/auth.api";
import { resolveAdminShellAccess } from "@/lib/admin-shell-access";
import { AUTH_FULL_PROFILE_QUERY_KEY } from "@/lib/profile-full-query";
import { resolveStaffLessonWorkspace } from "@/lib/staff-lesson-workspace";
import { hasTrainingAccess } from "@/lib/training-access";

/**
 * `/staff/staffs` — danh sách nhân sự trong staff shell:
 * - Admin / Kế toán chi: trang `/admin/staffs` đầy đủ (`routeBase` `/staff`);
 * - Trưởng phòng Sale & CSKH: cùng bố cục nhưng chỉ đội Sale & CSKH, dữ liệu
 *   giới hạn (#270, #271) — thay trang `/staff/sale-cs-team` cũ;
 * - Ban Đào Tạo: gia sư; Trưởng ban Đào tạo thêm Ban Chuyên môn / Đào tạo
 *   (`/training/tutors`) — thay trang `/staff/tutors` cũ.
 * Người vừa là Trưởng phòng Sale & CSKH vừa thuộc Ban Đào Tạo thấy danh sách
 * Sale & CSKH (giống thứ tự ưu tiên của nút quay lại ở hồ sơ).
 * - Trưởng ban Chuyên môn (14/11): chỉ khối «Tạo nhân sự».
 * Gate (`staff-shell-access.ts`) chặn các role khác trước khi tới đây.
 */
export default function StaffStaffsRoute() {
  const { data: profile, isLoading } = useQuery({
    queryKey: AUTH_FULL_PROFILE_QUERY_KEY,
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const access = resolveAdminShellAccess(profile);

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
        <StaffListTableSkeleton rows={5} />
      </div>
    );
  }

  if (access.isAdmin || access.isAccountantExpense) return <AdminStaffPage />;
  const list = access.isAssistant ? (
    <SaleCsTeamStaffList />
  ) : hasTrainingAccess(profile?.staffInfo?.roles) ? (
    <TrainingStaffList />
  ) : resolveStaffLessonWorkspace(profile).isLessonPlanHead ? (
    <LessonPlanHeadStaffPanel />
  ) : null;
  if (!list) return null;

  return <Suspense fallback={null}>{list}</Suspense>;
}
