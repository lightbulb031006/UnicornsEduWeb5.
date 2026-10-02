"use client";

import { Suspense } from "react";

import { useSearchParams } from "next/navigation";
import ExtraAllowanceRoleDetailPage from "@/components/admin/extra-allowance/ExtraAllowanceRoleDetailPage";
import type { ExtraAllowanceRoleType } from "@/dtos/extra-allowance.dto";

function AdminAccountantDetailPageContent() {
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const roleTypeParam = getSearchParam("roleType");
  const roleType: Extract<
    ExtraAllowanceRoleType,
    "accountant" | "accountant_income" | "accountant_expense"
  > =
    roleTypeParam === "accountant_income" ||
    roleTypeParam === "accountant_expense"
      ? roleTypeParam
      : "accountant";

  return (
    <ExtraAllowanceRoleDetailPage
      roleType={roleType}
      staffId={getSearchParam("staffId")}
    />
  );
}

export default function AdminAccountantDetailPage() {
  // useSearchParams cần <Suspense>, nếu không Next.js sẽ bỏ static render cả route.
  return (
    <Suspense fallback={null}>
      <AdminAccountantDetailPageContent />
    </Suspense>
  );
}
