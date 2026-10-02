"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { LessonTaskDetailPage } from "@/app/admin/lesson-plans/tasks/[taskId]/page";
import { LessonTaskDetailPageSkeleton } from "@/components/admin/lesson-plans/LessonOverviewSkeleton";
import { getFullProfile } from "@/lib/apis/auth.api";
import { resolveStaffLessonWorkspace } from "@/lib/staff-lesson-workspace";

export default function StaffLessonTaskDetailPage() {
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const {
    canAccessTaskDetail,
    isAssistant,
    isAccountant,
    isAccountantExpense,
    participantMode,
    workspacePolicy,
  } = resolveStaffLessonWorkspace(profile);

  if (isProfileLoading && !profile) {
    return <LessonTaskDetailPageSkeleton />;
  }

  if (!canAccessTaskDetail) {
    return null;
  }

  return (
    <Suspense fallback={<LessonTaskDetailPageSkeleton />}>
      <LessonTaskDetailPage
        workspaceBasePath="/staff/lesson-plans"
        participantMode={participantMode}
        accountantMode={isAccountant}
        allowPaymentStatusEdit={workspacePolicy === "admin" || isAccountantExpense}
        allowDelete={isAssistant}
      />
    </Suspense>
  );
}
