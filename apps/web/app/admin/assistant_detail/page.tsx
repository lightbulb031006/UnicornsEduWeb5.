"use client";

import { Suspense } from "react";

import { useSearchParams } from "next/navigation";
import ExtraAllowanceRoleDetailPage from "@/components/admin/extra-allowance/ExtraAllowanceRoleDetailPage";

function AdminAssistantDetailPageContent() {
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);

  return (
    <ExtraAllowanceRoleDetailPage
      roleType="assistant"
      staffId={getSearchParam("staffId")}
    />
  );
}

export default function AdminAssistantDetailPage() {
  // useSearchParams cần <Suspense>, nếu không Next.js sẽ bỏ static render cả route.
  return (
    <Suspense fallback={null}>
      <AdminAssistantDetailPageContent />
    </Suspense>
  );
}
