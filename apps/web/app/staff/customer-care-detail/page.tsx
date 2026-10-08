"use client";

import { useState } from "react";
import CreateCustomerCareStudentPopup from "@/components/customer-care/CreateCustomerCareStudentPopup";
import CustomerCareDetailPanels from "@/components/customer-care/CustomerCareDetailPanels";
import { useQuery } from "@tanstack/react-query";
import { getFullProfile } from "@/lib/apis/auth.api";

export default function StaffCustomerCareDetailPage() {
  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });

  const staffInfo = profile?.staffInfo;
  const isCustomerCare =
    (profile?.roleType === "staff" || profile?.roleType === "admin") &&
    (staffInfo?.roles ?? []).includes("customer_care");
  const canOpenStaffClassDetail = isCustomerCare;
  const [createStudentOpen, setCreateStudentOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <section className="rounded-[2rem] border border-border-default bg-bg-surface p-5 shadow-sm lg:p-6">
          <div className="h-3 w-40 animate-pulse rounded-full bg-bg-tertiary" />
          <div className="mt-4 h-10 w-full max-w-md animate-pulse rounded-2xl bg-bg-tertiary" />
          <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-bg-tertiary" />
          <div className="mt-2 h-4 w-5/6 max-w-xl animate-pulse rounded bg-bg-tertiary" />
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-[1.5rem] border border-border-default bg-bg-secondary/70"
              />
            ))}
          </div>
        </section>
        <section className="rounded-[2rem] border border-border-default bg-bg-surface p-5 shadow-sm lg:p-6">
          <div className="h-10 w-48 animate-pulse rounded-full bg-bg-tertiary" />
          <div className="mt-4 h-64 animate-pulse rounded-[1.5rem] bg-bg-secondary/70" />
        </section>
      </div>
    );
  }

  if (isError || !isCustomerCare || !staffInfo?.id) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <section className="rounded-[2rem] border border-warning/30 bg-warning/10 p-5 shadow-sm lg:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-warning">
            Customer Care Locked
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-text-primary">
            Tài khoản này không dùng được màn CSKH cá nhân.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
            Route `/staff/customer-care-detail` chỉ mở khi hồ sơ staff hiện tại có
            role `customer_care` và luôn khóa vào đúng hồ sơ nhân sự đang đăng nhập.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <section className="overflow-hidden rounded-[2rem] border border-border-default bg-bg-surface shadow-sm">
        <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)] lg:px-6 lg:pb-8">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">
              Customer Care Workspace
            </p>
            <h1 className="mt-3 text-balance text-2xl font-semibold text-text-primary sm:text-3xl">
              Bảng công việc CSKH của bạn
            </h1>
          </div>
          <div className="flex items-start lg:justify-end">
            <button
              type="button"
              onClick={() => setCreateStudentOpen(true)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:w-auto"
            >
              Tạo học sinh
            </button>
          </div>
        </div>
      </section>

      {createStudentOpen ? (
        <CreateCustomerCareStudentPopup
          onClose={() => setCreateStudentOpen(false)}
        />
      ) : null}

      <CustomerCareDetailPanels
        staffId={staffInfo.id}
        workspaceMode="self"
        allowStaffClassNavigation={canOpenStaffClassDetail}
      />
    </div>
  );
}
