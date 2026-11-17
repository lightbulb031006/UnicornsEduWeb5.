"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ExtraAllowanceRoleDetailPage from "@/components/admin/extra-allowance/ExtraAllowanceRoleDetailPage";

function AdminTrainingHeadDetailLoadingShell() {
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
      <div className="mt-6 h-72 animate-pulse rounded-[1.5rem] bg-bg-secondary/70" />
    </div>
  );
}

function AdminTrainingHeadDetailContent() {
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);

  return (
    <ExtraAllowanceRoleDetailPage
      roleType="training_head"
      staffId={getSearchParam("staffId")}
    />
  );
}

export default function AdminTrainingHeadDetailPage() {
  return (
    <Suspense fallback={<AdminTrainingHeadDetailLoadingShell />}>
      <AdminTrainingHeadDetailContent />
    </Suspense>
  );
}
