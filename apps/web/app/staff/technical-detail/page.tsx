"use client";

import { Suspense } from "react";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import ExtraAllowanceRoleDetailPage from "@/components/admin/extra-allowance/ExtraAllowanceRoleDetailPage";
import StaffSelfExtraAllowanceRoleDetailPage from "@/components/staff/StaffSelfExtraAllowanceRoleDetailPage";
import { getFullProfile } from "@/lib/apis/auth.api";
import { canViewCrossStaffRoleDetail } from "@/lib/staff-role-detail-access";

function StaffRoleDetailLoadingShell() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-bg-primary p-4 pb-8 sm:p-6"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-4 h-8 w-48 animate-pulse rounded bg-bg-tertiary" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-[1.5rem] border border-border-default bg-bg-secondary/70"
          />
        ))}
      </div>
      <div className="mt-6 h-6 w-48 animate-pulse rounded-full bg-bg-secondary/70" />
      <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-bg-secondary/70" />
      <div className="mt-4 h-72 animate-pulse rounded-[1.5rem] bg-bg-secondary/70" />
    </div>
  );
}

function StaffTechnicalDetailPageContent() {
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const staffId = getSearchParam("staffId");

  if (isProfileLoading && !profile) {
    return <StaffRoleDetailLoadingShell />;
  }

  if (canViewCrossStaffRoleDetail(profile, staffId)) {
    return <ExtraAllowanceRoleDetailPage roleType="technical" staffId={staffId} />;
  }

  return (
    <StaffSelfExtraAllowanceRoleDetailPage roleType="technical" allowCreate />
  );
}

export default function StaffTechnicalDetailPage() {
  // useSearchParams cần <Suspense>, nếu không Next.js sẽ bỏ static render cả route.
  return (
    <Suspense fallback={<StaffRoleDetailLoadingShell />}>
      <StaffTechnicalDetailPageContent />
    </Suspense>
  );
}
