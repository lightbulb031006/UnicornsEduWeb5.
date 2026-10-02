"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLessonPlansWorkspace } from "@/components/admin/lesson-plans";
import { LessonWorkspaceLoadingSkeleton } from "@/components/admin/lesson-plans/LessonOverviewSkeleton";
import { getFullProfile } from "@/lib/apis/auth.api";
import { resolveAdminShellAccess } from "@/lib/admin-shell-access";

export default function AdminLessonPlansPage() {
  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const { isAdmin, isAssistant, isAccountantExpense, isLessonPlanHead } =
    resolveAdminShellAccess(fullProfile);
  const workspacePolicy =
    isAdmin || isAssistant
      ? "admin"
      : isLessonPlanHead
        ? "lesson_plan_head"
        : isAccountantExpense
          ? "accountant"
          : "admin";

  return (
    <Suspense fallback={<LessonWorkspaceLoadingSkeleton />}>
      <AdminLessonPlansWorkspace
        workspacePolicy={workspacePolicy}
        currentUserId={fullProfile?.id ?? null}
      />
    </Suspense>
  );
}
