"use client";

import { useQuery } from "@tanstack/react-query";
import { AdminLessonPlansWorkspace } from "@/components/admin/lesson-plans";
import { LessonWorkspaceLoadingSkeleton } from "@/components/admin/lesson-plans/LessonOverviewSkeleton";
import { getFullProfile } from "@/lib/apis/auth.api";
import { resolveStaffLessonWorkspace } from "@/lib/staff-lesson-workspace";

export default function StaffLessonPlansPage() {
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const {
    participantMode,
    workspacePolicy,
    workAccessMode,
    createOutputAccessMode,
  } = resolveStaffLessonWorkspace(profile);

  if (isProfileLoading && !profile) {
    return <LessonWorkspaceLoadingSkeleton />;
  }

  if (!workspacePolicy) {
    return null;
  }

  return (
    <AdminLessonPlansWorkspace
      basePath="/staff/lesson-plans"
      manageDetailsPath="/staff/lesson-manage-details"
      taskDetailBasePath="/staff/lesson-plans/tasks"
      participantMode={participantMode}
      workspacePolicy={workspacePolicy}
      workAccessMode={workAccessMode ?? undefined}
      createOutputAccessMode={createOutputAccessMode}
    />
  );
}
