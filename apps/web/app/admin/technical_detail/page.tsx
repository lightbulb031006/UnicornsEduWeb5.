"use client";

import { Suspense } from "react";

import { useSearchParams } from "next/navigation";
import ExtraAllowanceRoleDetailPage from "@/components/admin/extra-allowance/ExtraAllowanceRoleDetailPage";

function AdminTechnicalDetailPageContent() {
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);

  return (
    <ExtraAllowanceRoleDetailPage
      roleType="technical"
      staffId={getSearchParam("staffId")}
    />
  );
}

export default function AdminTechnicalDetailPage() {
  // useSearchParams cần <Suspense>, nếu không Next.js sẽ bỏ static render cả route.
  return (
    <Suspense fallback={null}>
      <AdminTechnicalDetailPageContent />
    </Suspense>
  );
}
